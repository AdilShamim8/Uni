import { create } from 'zustand'
import type {
  TaskDeliverable,
  TaskEvent,
  TaskEventKind,
  WorkTask,
} from '@/domain/workspaceTypes'
import { canTransition } from '@/domain/taskMachine'
import { makeId } from '@/domain/ids'
import type { AttachmentMeta } from '@/domain/types'
import {
  clearWorkSlice,
  loadWorkSlice,
  saveWorkSlice,
} from '@/services/storage/workspaceStorage'

/**
 * Work store — task instances with a deterministic local state machine and
 * a demo execution runner.
 *
 * Runner safety properties (milestone-03 audit, reliability section):
 * - Every run has a unique id; events carry it and stale-run events are
 *   dropped by `appendEvent`.
 * - Pause/cancel abort the run's timers; a cancelled run can never accept
 *   a late timer event.
 * - Timer and abort handles live in this module — never in persisted state.
 * - On reload, `initialize()` demotes running/queued tasks to `paused` and
 *   flags them interrupted; nothing pretends to have kept running.
 */

/* ------------------------------------------------------------------ */
/* Runner plan definitions                                             */
/* ------------------------------------------------------------------ */

interface PlanStep {
  kind: TaskEventKind
  label: string
  detail?: string
  /** Pause here and ask the user before continuing. */
  input?: { question: string; options: string[] }
  delayMs?: number
}

interface RunPlan {
  steps: PlanStep[]
  template: 'research' | 'data' | 'email'
}

const PLANS: Record<TaskDeliverable, RunPlan> = {
  'research-report': {
    template: 'research',
    steps: [
      { kind: 'plan', label: 'Read the brief and set the scope' },
      {
        kind: 'input_request',
        label: 'Checking the depth you need',
        input: {
          question: 'Should this report be a quick comparison or a deeper dive?',
          options: ['Quick comparison', 'Deeper dive'],
        },
      },
      {
        kind: 'tool',
        label: 'Searching sources (simulated)',
        detail: '3 example sources — fixture data, no live web access',
      },
      { kind: 'plan', label: 'Outline: options, trade-offs, evidence gaps' },
      { kind: 'tool', label: 'Drafting the comparison (simulated)' },
    ],
  },
  'data-review': {
    template: 'data',
    steps: [
      { kind: 'plan', label: 'Read the brief and inspect the dataset' },
      {
        kind: 'tool',
        label: 'Profiled 4 columns (fixture dataset)',
        detail: 'rows: 128 · numeric: 3 · categorical: 1',
      },
      {
        kind: 'input_request',
        label: 'Deciding how to handle missing values',
        input: {
          question: 'Should rows with missing values be flagged or excluded?',
          options: ['Flag them', 'Exclude them'],
        },
      },
      { kind: 'tool', label: 'Computed summary statistics (fixture data)' },
      { kind: 'plan', label: 'Assemble findings and caveats' },
    ],
  },
  'email-draft': {
    template: 'email',
    steps: [
      { kind: 'plan', label: 'Read the brief: recipient, goal, context' },
      {
        kind: 'input_request',
        label: 'Checking the tone you want',
        input: {
          question: 'What tone should the email take?',
          options: ['Warm and direct', 'Formal'],
        },
      },
      { kind: 'tool', label: 'Drafted the email (simulated)' },
    ],
  },
}

/** Delay between run steps; tests shrink this to keep suites fast. */
let stepDelayMs = 1100

export function setRunnerStepMs(ms: number): void {
  stepDelayMs = Math.max(0, ms)
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal.aborted) return resolve()
    const timer = setTimeout(finish, ms)
    function finish() {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    signal.addEventListener('abort', finish, { once: true })
  })
}

function fixtureReport(
  task: WorkTask,
  template: RunPlan['template'],
  answers: string[],
): string {
  const guidance =
    answers.length > 0 ? `\n**Your guidance:** ${answers.join(' · ')}\n` : '\n'
  if (template === 'research') {
    return [
      `# ${task.title}`,
      '',
      '> Example report — simulated output. This content is fixture data; edit it before downloading.',
      '',
      `## Goal`,
      task.goal || '—',
      guidance,
      '## Comparison',
      '',
      '| Option | Strengths | Trade-offs |',
      '| --- | --- | --- |',
      '| Option A | Simple, quick to adopt | Fewer advanced features |',
      '| Option B | More powerful, flexible | Steeper learning curve |',
      '',
      '## What the evidence supports',
      '',
      '- Both options cover the core need described in the brief.',
      '- The choice mostly depends on how much flexibility you need later.',
      '',
      '## Gaps in this example',
      '',
      '- This is a local simulation: no live sources were consulted.',
      '- Replace the rows above with your own findings before using this.',
    ].join('\n')
  }
  if (template === 'data') {
    return [
      `# ${task.title}`,
      '',
      '> Example review — simulated output computed from a bundled fixture dataset.',
      '',
      `## Goal`,
      task.goal || '—',
      guidance,
      '## Dataset profile',
      '',
      '- 128 rows, 4 columns (fixture data bundled with the app)',
      '- No values left the device; nothing was uploaded',
      '',
      '## Findings',
      '',
      '- Column A: mean 42.1, range 3–97 (example values)',
      '- Column B: 12 rows with missing values (example values)',
      '- Column C: strongly skewed; median is the safer summary',
      '',
      '## Caveats',
      '',
      '- All numbers are fixture data for demonstration, not your upload.',
    ].join('\n')
  }
  return [
    `# ${task.title}`,
    '',
    '> Example email draft — simulated output. Sending is not available; save or download instead.',
    '',
    `## Goal`,
    task.goal || '—',
    guidance,
    '## Draft',
    '',
    'Subject: Following up on our conversation',
    '',
    'Hi there,',
    '',
    'Thanks for making time earlier. I put together the summary we discussed —',
    'the main points are below, and I am happy to adjust anything.',
    '',
    'Best,',
    'Universe (example draft)',
  ].join('\n')
}

/* ------------------------------------------------------------------ */
/* Runner handles (module-scoped, never persisted)                     */
/* ------------------------------------------------------------------ */

interface RunHandle {
  taskId: string
  runId: string
  abort: AbortController
  inputWaiter: { resolve: (answer: string) => void } | null
}

const activeRuns = new Map<string, RunHandle>()

export function activeRunCount(): number {
  return activeRuns.size
}

export function abortAllRunsForTests(): void {
  for (const handle of activeRuns.values()) handle.abort.abort()
  activeRuns.clear()
}

async function executeRun(taskId: string, runId: string): Promise<void> {
  const handle: RunHandle = { taskId, runId, abort: new AbortController(), inputWaiter: null }
  activeRuns.set(taskId, handle)

  try {
    while (true) {
      const task = useWorkStore.getState().tasks[taskId]
      if (!task || task.currentRunId !== runId || task.status !== 'running') return

      const plan = PLANS[task.deliverable]
      const cursor = task.planCursor
      if (cursor >= plan.steps.length) {
        useWorkStore.getState().finishRun(taskId, runId)
        return
      }

      const step = plan.steps[cursor]
      useWorkStore.getState().appendEvent(taskId, {
        id: makeId('ev'),
        runId,
        at: Date.now(),
        kind: step.kind,
        label: step.label,
        detail: step.detail,
      })
      useWorkStore.getState().setCursor(taskId, runId, cursor + 1)

      await sleep(step.delayMs ?? stepDelayMs, handle.abort.signal)
      if (handle.abort.signal.aborted) return

      if (step.input) {
        // Park: hand the question to the UI and wait for the answer.
        const answered = useWorkStore.getState().parkForInput(
          taskId,
          runId,
          step.input,
        )
        if (!answered) return
        const answer = await new Promise<string>((resolve) => {
          handle.inputWaiter = { resolve }
        })
        if (handle.abort.signal.aborted) return
        const resumed = useWorkStore.getState().resumeAfterInput(taskId, runId, answer)
        if (!resumed) return
      }
    }
  } finally {
    if (activeRuns.get(taskId) === handle) activeRuns.delete(taskId)
  }
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export interface CreateTaskInput {
  title: string
  goal: string
  deliverable: TaskDeliverable
  agentId?: string | null
  projectId?: string | null
  attachments?: AttachmentMeta[]
}

export interface WorkStore {
  hydrated: boolean
  tasks: Record<string, WorkTask>

  initialize: () => void
  resetDemoData: () => void

  createTask: (input: CreateTaskInput) => string
  updateTask: (
    id: string,
    patch: Partial<Pick<WorkTask, 'title' | 'goal' | 'deliverable' | 'agentId' | 'projectId'>>,
  ) => void
  deleteTask: (id: string) => void

  runTask: (id: string) => void
  pauseTask: (id: string) => void
  resumeTask: (id: string) => void
  cancelTask: (id: string) => void
  retryTask: (id: string) => void
  reopenTask: (id: string) => void
  completeTask: (id: string) => void
  answerInput: (id: string, answer: string) => void

  updateReport: (id: string, markdown: string) => void
  /** Link (or re-link) the library artifact produced from the report. */
  attachArtifactToReport: (id: string, artifactId: string) => void

  /** Internal — called by the runner. Exposed on the store for testability. */
  appendEvent: (taskId: string, event: TaskEvent) => void
  setCursor: (taskId: string, runId: string, cursor: number) => void
  parkForInput: (
    taskId: string,
    runId: string,
    request: { question: string; options: string[] },
  ) => boolean
  resumeAfterInput: (taskId: string, runId: string, answer: string) => boolean
  finishRun: (taskId: string, runId: string) => void
}

function nowEvent(kind: TaskEventKind, label: string, runId: string | null = null): TaskEvent {
  return { id: makeId('ev'), runId, at: Date.now(), kind, label }
}

export const useWorkStore = create<WorkStore>()((set, get) => ({
  hydrated: false,
  tasks: {},

  initialize: () => {
    if (get().hydrated) return
    const loaded = loadWorkSlice()
    const tasks: Record<string, WorkTask> = {}
    if (loaded.state) {
      for (const task of loaded.state.tasks) {
        // A reload ends any live simulation honestly: running/queued tasks
        // become paused and interrupted, with a clear Resume action.
        if (task.status === 'running' || task.status === 'queued') {
          tasks[task.id] = {
            ...task,
            status: 'paused',
            interrupted: true,
            currentRunId: null,
            events: [
              ...task.events,
              nowEvent('note', 'Run interrupted by a reload — resume to continue.'),
            ],
          }
        } else {
          tasks[task.id] = { ...task, currentRunId: null }
        }
      }
      set({ hydrated: true, tasks })
    } else {
      set({ hydrated: true, tasks: {} })
    }
  },

  resetDemoData: () => {
    clearWorkSlice()
    set({ hydrated: true, tasks: {} })
  },

  createTask: (input) => {
    const now = Date.now()
    const task: WorkTask = {
      id: makeId('task'),
      title: input.title.trim() || 'Untitled task',
      goal: input.goal.trim(),
      deliverable: input.deliverable,
      agentId: input.agentId ?? null,
      projectId: input.projectId ?? null,
      attachments: input.attachments ?? [],
      status: 'draft',
      mode: 'demo',
      createdAt: now,
      updatedAt: now,
      events: [nowEvent('created', 'Task created')],
      currentRunId: null,
      planCursor: 0,
      runAnswers: [],
      interrupted: false,
      report: null,
      inputRequest: null,
    }
    set((state) => ({ tasks: { ...state.tasks, [task.id]: task } }))
    return task.id
  },

  updateTask: (id, patch) => {
    set((state) => {
      const task = state.tasks[id]
      if (!task) return state
      return {
        tasks: { ...state.tasks, [id]: { ...task, ...patch, updatedAt: Date.now() } },
      }
    })
  },

  deleteTask: (id) => {
    const handle = activeRuns.get(id)
    if (handle) handle.abort.abort()
    set((state) => {
      const tasks = { ...state.tasks }
      delete tasks[id]
      return { tasks }
    })
  },

  runTask: (id) => {
    const task = get().tasks[id]
    if (!task || !canTransition(task.status, 'queued')) return
    const runId = makeId('run')
    set((state) => ({
      tasks: {
        ...state.tasks,
        [id]: {
          ...state.tasks[id],
          status: 'running',
          currentRunId: runId,
          planCursor: 0,
          runAnswers: [],
          interrupted: false,
          inputRequest: null,
          updatedAt: Date.now(),
          events: [
            ...state.tasks[id].events,
            nowEvent('status', 'Run started (demo execution)'),
          ],
        },
      },
    }))
    void executeRun(id, runId)
  },

  pauseTask: (id) => {
    const task = get().tasks[id]
    if (!task || !canTransition(task.status, 'paused')) return
    activeRuns.get(id)?.abort.abort()
    set((state) => ({
      tasks: {
        ...state.tasks,
        [id]: {
          ...state.tasks[id],
          status: 'paused',
          currentRunId: null,
          updatedAt: Date.now(),
          events: [...state.tasks[id].events, nowEvent('status', 'Run paused')],
        },
      },
    }))
  },

  resumeTask: (id) => {
    const task = get().tasks[id]
    if (!task || !canTransition(task.status, 'running')) return
    const runId = makeId('run')
    set((state) => ({
      tasks: {
        ...state.tasks,
        [id]: {
          ...state.tasks[id],
          status: 'running',
          currentRunId: runId,
          interrupted: false,
          updatedAt: Date.now(),
          events: [
            ...state.tasks[id].events,
            nowEvent('status', 'Run resumed'),
          ],
        },
      },
    }))
    void executeRun(id, runId)
  },

  cancelTask: (id) => {
    const task = get().tasks[id]
    if (!task || !canTransition(task.status, 'cancelled')) return
    activeRuns.get(id)?.abort.abort()
    set((state) => ({
      tasks: {
        ...state.tasks,
        [id]: {
          ...state.tasks[id],
          status: 'cancelled',
          currentRunId: null,
          updatedAt: Date.now(),
          events: [
            ...state.tasks[id].events,
            nowEvent('status', 'Run cancelled — late events from this run are rejected'),
          ],
        },
      },
    }))
  },

  retryTask: (id) => {
    const task = get().tasks[id]
    if (!task || !canTransition(task.status, 'queued')) return
    const runId = makeId('run')
    set((state) => ({
      tasks: {
        ...state.tasks,
        [id]: {
          ...state.tasks[id],
          status: 'running',
          currentRunId: runId,
          planCursor: 0,
          runAnswers: [],
          interrupted: false,
          inputRequest: null,
          updatedAt: Date.now(),
          events: [...state.tasks[id].events, nowEvent('status', 'Retry started')],
        },
      },
    }))
    void executeRun(id, runId)
  },

  reopenTask: (id) => {
    const task = get().tasks[id]
    if (!task || !canTransition(task.status, 'draft')) return
    set((state) => ({
      tasks: {
        ...state.tasks,
        [id]: {
          ...state.tasks[id],
          status: 'draft',
          updatedAt: Date.now(),
          events: [...state.tasks[id].events, nowEvent('status', 'Task reopened as draft')],
        },
      },
    }))
  },

  completeTask: (id) => {
    const task = get().tasks[id]
    if (!task || !canTransition(task.status, 'completed')) return
    set((state) => ({
      tasks: {
        ...state.tasks,
        [id]: {
          ...state.tasks[id],
          status: 'completed',
          updatedAt: Date.now(),
          events: [...state.tasks[id].events, nowEvent('status', 'Reviewed and completed')],
        },
      },
    }))
  },

  answerInput: (id, answer) => {
    const handle = activeRuns.get(id)
    if (handle?.inputWaiter) {
      handle.inputWaiter.resolve(answer)
    } else {
      // Post-reload answer: no live run exists, so record the answer on
      // the task (so the report can use it) and continue with a fresh run
      // from the stored cursor.
      const task = get().tasks[id]
      if (!task || task.status !== 'needs_input') return
      set((state) => ({
        tasks: {
          ...state.tasks,
          [id]: {
            ...state.tasks[id],
            runAnswers: [...state.tasks[id].runAnswers, answer],
            events: [
              ...state.tasks[id].events,
              nowEvent('input_response', `Answered: ${answer}`),
            ],
          },
        },
      }))
      get().resumeTask(id)
    }
  },

  updateReport: (id, markdown) => {
    set((state) => {
      const task = state.tasks[id]
      if (!task?.report) return state
      return {
        tasks: {
          ...state.tasks,
          [id]: {
            ...task,
            report: { ...task.report, markdown },
            updatedAt: Date.now(),
          },
        },
      }
    })
  },

  attachArtifactToReport: (id, artifactId) => {
    set((state) => {
      const task = state.tasks[id]
      if (!task?.report) return state
      return {
        tasks: {
          ...state.tasks,
          [id]: {
            ...task,
            report: { ...task.report, artifactId },
            updatedAt: Date.now(),
          },
        },
      }
    })
  },

  appendEvent: (taskId, event) => {
    set((state) => {
      const task = state.tasks[taskId]
      if (!task) return state
      // Stale-run guard: events from an old or cancelled run are dropped.
      if (event.runId !== null && task.currentRunId !== event.runId) return state
      if (event.runId !== null && task.status !== 'running') return state
      return {
        tasks: {
          ...state.tasks,
          [taskId]: { ...task, events: [...task.events, event], updatedAt: Date.now() },
        },
      }
    })
  },

  setCursor: (taskId, runId, cursor) => {
    set((state) => {
      const task = state.tasks[taskId]
      if (!task || task.currentRunId !== runId) return state
      return {
        tasks: { ...state.tasks, [taskId]: { ...task, planCursor: cursor } },
      }
    })
  },

  parkForInput: (taskId, runId, request) => {
    let parked = false
    set((state) => {
      const task = state.tasks[taskId]
      if (!task || task.currentRunId !== runId || task.status !== 'running') return state
      parked = true
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            status: 'needs_input',
            inputRequest: request,
            updatedAt: Date.now(),
          },
        },
      }
    })
    return parked
  },

  resumeAfterInput: (taskId, runId, answer) => {
    let resumed = false
    set((state) => {
      const task = state.tasks[taskId]
      if (!task || task.currentRunId !== runId || task.status !== 'needs_input') return state
      resumed = true
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            status: 'running',
            inputRequest: null,
            // Persisted with the task so a post-reload resume still sees it.
            runAnswers: [...task.runAnswers, answer],
            updatedAt: Date.now(),
            events: [
              ...task.events,
              { ...nowEvent('input_response', `Answered: ${answer}`), runId },
            ],
          },
        },
      }
    })
    return resumed
  },

  finishRun: (taskId, runId) => {
    set((state) => {
      const task = state.tasks[taskId]
      if (!task || task.currentRunId !== runId || task.status !== 'running') return state
      const plan = PLANS[task.deliverable]
      const markdown = fixtureReport(task, plan.template, task.runAnswers)
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            status: 'ready_for_review',
            currentRunId: null,
            inputRequest: null,
            report: { template: plan.template, markdown, artifactId: null },
            updatedAt: Date.now(),
            events: [
              ...task.events,
              {
                ...nowEvent('output', 'Example output ready for review — simulated content'),
                runId,
              },
            ],
          },
        },
      }
    })
  },
}))

/* ------------------------------------------------------------------ */
/* Persistence wiring                                                  */
/* ------------------------------------------------------------------ */

let saveTimer: ReturnType<typeof setTimeout> | undefined

let workStorageWarned = false

export function flushWorkPersistence(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  const state = useWorkStore.getState()
  if (!state.hydrated) return
  const saved = saveWorkSlice({ tasks: Object.values(state.tasks) })
  if (!saved && !workStorageWarned) {
    workStorageWarned = true
    import('@/state/store').then(({ useAppStore }) => {
      useAppStore.getState().showToast(
        'Local storage is full or blocked — task changes may not survive a reload.',
      )
    })
  }
}

useWorkStore.subscribe(() => {
  const state = useWorkStore.getState()
  if (!state.hydrated) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushWorkPersistence, 400)
})

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushWorkPersistence)
}

/** Test-only: wipe work state (and optionally storage). */
export function resetWorkStoreForTests(options: { keepStorage?: boolean } = {}): void {
  if (!options.keepStorage) clearWorkSlice()
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  abortAllRunsForTests()
  useWorkStore.setState({ hydrated: false, tasks: {} })
}
