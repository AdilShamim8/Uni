import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  flushWorkPersistence,
  resetWorkStoreForTests,
  setRunnerStepMs,
  useWorkStore,
} from '@/state/workStore'
import type { TaskDeliverable, WorkTask } from '@/domain/workspaceTypes'

interface TaskInput {
  title: string
  goal: string
  deliverable: TaskDeliverable
  agentId?: string | null
  projectId?: string | null
}

function makeTask(overrides: Partial<TaskInput> = {}): string {
  const input: TaskInput = {
    title: 'Compare two routers',
    goal: 'Pick a router for the new apartment',
    deliverable: 'research-report',
    ...overrides,
  }
  return useWorkStore.getState().createTask(input)
}

function task(id: string): WorkTask {
  return useWorkStore.getState().tasks[id] as WorkTask
}

function status(id: string): string | undefined {
  return useWorkStore.getState().tasks[id]?.status
}

function waitFor(predicate: () => boolean, timeoutMs = 4000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (predicate()) return resolve()
      if (Date.now() - started > timeoutMs) return reject(new Error('waitFor timed out'))
      setTimeout(tick, 10)
    }
    tick()
  })
}

describe('work store — task lifecycle', () => {
  beforeEach(() => {
    resetWorkStoreForTests()
    useWorkStore.getState().initialize()
    setRunnerStepMs(5)
  })
  afterEach(() => {
    resetWorkStoreForTests()
    setRunnerStepMs(1100)
  })

  it('creates a task in draft with a created event', () => {
    const id = makeTask()
    expect(task(id).status).toBe('draft')
    expect(task(id).mode).toBe('demo')
    expect(task(id).events[0]?.kind).toBe('created')
  })

  it('runs to ready_for_review and produces an editable report', async () => {
    const id = makeTask()
    useWorkStore.getState().runTask(id)

    await waitFor(() => status(id) === 'needs_input')
    expect(task(id).inputRequest?.question).toBeTruthy()

    useWorkStore.getState().answerInput(id, 'Quick comparison')

    await waitFor(() => status(id) === 'ready_for_review')
    const finished = task(id)
    expect(finished.report?.markdown).toContain('Example report')
    expect(finished.report?.markdown).toContain('Quick comparison')
    expect(finished.currentRunId).toBeNull()

    useWorkStore.getState().updateReport(id, '# Edited')
    expect(task(id).report?.markdown).toBe('# Edited')

    useWorkStore.getState().completeTask(id)
    expect(status(id)).toBe('completed')
  })

  it('cancel rejects late events from the cancelled run', async () => {
    const id = makeTask()
    useWorkStore.getState().runTask(id)
    await waitFor(() => status(id) === 'needs_input')

    useWorkStore.getState().cancelTask(id)
    expect(status(id)).toBe('cancelled')

    const eventsBefore = task(id).events.length
    const staleRun = task(id).events.find((e) => e.runId)?.runId ?? 'run-stale'

    // A late timer event from the cancelled run must be dropped.
    useWorkStore.getState().appendEvent(id, {
      id: 'ev-late',
      runId: staleRun,
      at: Date.now(),
      kind: 'tool',
      label: 'Late event from a stale run',
    })
    expect(task(id).events.length).toBe(eventsBefore)

    // Cancelled tasks cannot complete directly.
    useWorkStore.getState().completeTask(id)
    expect(status(id)).toBe('cancelled')
    // The deliberate path: reopen as draft.
    useWorkStore.getState().reopenTask(id)
    expect(status(id)).toBe('draft')
  })

  it('demotes a running task to paused+interrupted on reload', async () => {
    const id = makeTask({ deliverable: 'email-draft' })
    // Long steps so the reload lands while the first step is still running.
    setRunnerStepMs(10000)
    useWorkStore.getState().runTask(id)
    await waitFor(() => task(id).events.some((e) => e.kind === 'plan'))
    expect(status(id)).toBe('running')

    // Reload while the step timer is still pending.
    flushWorkPersistence()
    resetWorkStoreForTests({ keepStorage: true })
    useWorkStore.getState().initialize()

    const reloaded = task(id)
    expect(reloaded.status).toBe('paused')
    expect(reloaded.interrupted).toBe(true)
    expect(reloaded.currentRunId).toBeNull()
    expect(reloaded.events.some((e) => e.label.includes('interrupted by a reload'))).toBe(true)

    // Resume continues to completion (back on fast steps).
    setRunnerStepMs(5)
    useWorkStore.getState().resumeTask(id)
    await waitFor(() => status(id) === 'needs_input')
    useWorkStore.getState().answerInput(id, 'Formal')
    await waitFor(() => status(id) === 'ready_for_review')
  })

  it('keeps needs_input questions across reload and continues after answering', async () => {
    const id = makeTask()
    useWorkStore.getState().runTask(id)
    await waitFor(() => status(id) === 'needs_input')

    flushWorkPersistence()
    resetWorkStoreForTests({ keepStorage: true })
    useWorkStore.getState().initialize()

    expect(status(id)).toBe('needs_input')
    useWorkStore.getState().answerInput(id, 'Deeper dive')
    await waitFor(() => status(id) === 'ready_for_review')
    expect(task(id).report?.markdown).toContain('Deeper dive')
  })

  it('keeps two concurrent tasks completely isolated', async () => {
    const a = makeTask({ title: 'Task A' })
    const b = makeTask({ title: 'Task B' })
    useWorkStore.getState().runTask(a)
    useWorkStore.getState().runTask(b)

    await waitFor(() => status(a) === 'needs_input')
    useWorkStore.getState().answerInput(a, 'Quick comparison')
    await waitFor(() => status(a) === 'ready_for_review')

    // Task A finished its own events; task B is untouched by A's run.
    expect(status(b)).toBe('needs_input')
    const taskA = task(a)
    const taskB = task(b)
    expect(taskA.events.every((e) => e.runId === null || e.runId === taskA.events.find((x) => x.runId)?.runId)).toBe(true)
    expect(taskB.events.some((e) => e.label.includes('Task A'))).toBe(false)
  })

  it('supports pause and resume mid-run', async () => {
    const id = makeTask({ deliverable: 'data-review' })
    // Pause during an actual running step (not while parked for input).
    setRunnerStepMs(10000)
    useWorkStore.getState().runTask(id)
    await waitFor(() => task(id).events.some((e) => e.kind === 'plan'))

    useWorkStore.getState().pauseTask(id)
    expect(status(id)).toBe('paused')

    setRunnerStepMs(5)
    useWorkStore.getState().resumeTask(id)
    await waitFor(() => status(id) === 'needs_input')
    useWorkStore.getState().answerInput(id, 'Flag them')
    await waitFor(() => status(id) === 'ready_for_review')
  })

  it('persists tasks across a reload', () => {
    const id = makeTask()
    flushWorkPersistence()
    resetWorkStoreForTests({ keepStorage: true })
    useWorkStore.getState().initialize()
    expect(task(id).title).toBe('Compare two routers')
  })
})
