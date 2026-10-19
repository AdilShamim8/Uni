import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  flushWorkPersistence,
  setRunnerStepMs,
  useWorkStore,
} from '@/state/workStore'
import { useAgentsStore } from '@/state/agentsStore'
import { downloadText } from '@/features/chat/exportUtils'
import { renderApp, setupAppTest } from './helpers'

vi.mock('@/features/chat/exportUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/chat/exportUtils')>()
  return { ...actual, downloadText: vi.fn() }
})

/**
 * The milestone's complete demonstration, end to end on the message-first
 * surface: type a goal on the Work home → the task thread opens and the
 * demo runs → answer the inline clarification → review the fixture output
 * in the thread → edit it in Details → Outputs → download Markdown that
 * matches the edited visible report → mark complete.
 */
describe('Work — complete local demo flow', () => {
  setupAppTest()

  it('runs a typed goal from the composer to a completed, downloadable thread', async () => {
    setRunnerStepMs(10)
    renderApp('/work')

    // Type a goal — no form in the way.
    const composer = screen.getByLabelText('Describe an outcome')
    await userEvent.type(composer, 'Pick a router for the new apartment')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    // The thread opens and the demo run starts automatically.
    expect(await screen.findByText(/Starting demo run/i)).toBeTruthy()

    // The run asks for input — an inline clarify card in the thread.
    const question = await screen.findByText(/quick comparison or a deeper dive/i)
    expect(question).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Quick comparison' }))

    // The run completes; the toolbar reflects Ready for review.
    await waitFor(
      () => expect(screen.getAllByText('Ready for review').length).toBeGreaterThan(0),
      { timeout: 8000 },
    )

    // The activity card (open while live) records the plan and tool steps.
    expect(screen.getByText(/Searching sources \(simulated\)/)).toBeTruthy()
    expect(screen.getByText(/Drafting the comparison \(simulated\)/)).toBeTruthy()

    // The report renders in the thread as an assistant message, honestly
    // labeled, with an output card underneath.
    expect(screen.getByText(/Example output — simulated/i)).toBeTruthy()
    expect(screen.getByText(/Output — ready to review/i)).toBeTruthy()

    // Edit the visible report from Details → Outputs.
    await userEvent.click(screen.getByRole('button', { name: 'Details' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Outputs' }))
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const editor = screen.getByLabelText('Edit report markdown')
    await userEvent.clear(editor)
    await userEvent.type(editor, '# My edited findings\n\nAll mine.')

    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }))
    // The edited content now renders both in the thread and in Outputs.
    await waitFor(() =>
      expect(screen.getAllByText('My edited findings').length).toBeGreaterThan(0),
    )

    // Download must match the EDITED report.
    const downloadSpy = vi.mocked(downloadText)
    downloadSpy.mockClear()
    await userEvent.click(screen.getByRole('button', { name: /^Download$/ }))
    expect(downloadSpy).toHaveBeenCalledWith(
      expect.stringContaining('pick-a-router-for-the-new-apartment'),
      expect.stringContaining('# My edited findings'),
    )

    // Mark complete from the run strip.
    await userEvent.click(screen.getByRole('button', { name: /Mark complete/ }))
    await waitFor(() => expect(screen.getAllByText('Completed').length).toBeGreaterThan(0))
    setRunnerStepMs(1100)
  }, 20000)

  it('sends a follow-up that reruns the demo with the guidance included', async () => {
    setRunnerStepMs(10)
    renderApp('/work')

    await userEvent.type(
      screen.getByLabelText('Describe an outcome'),
      'Draft a quick note about the launch',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    const question = await screen.findByText(/quick comparison or a deeper dive/i)
    expect(question).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Quick comparison' }))
    await waitFor(
      () => expect(screen.getAllByText('Ready for review').length).toBeGreaterThan(0),
      { timeout: 8000 },
    )

    // The first output is preserved as a prior version when a follow-up
    // triggers the revision rerun.
    await userEvent.type(
      screen.getByLabelText('Send a follow-up about this task'),
      'Make it shorter and friendlier',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText(/Revising \(demo\)/i)).toBeTruthy()

    // The demo script asks its question again on the rerun.
    const secondQuestion = await screen.findByText(/quick comparison or a deeper dive/i)
    expect(secondQuestion).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Quick comparison' }))

    await waitFor(
      () => expect(screen.getAllByText('Ready for review').length).toBeGreaterThan(0),
      { timeout: 8000 },
    )

    const task = Object.values(useWorkStore.getState().tasks)[0]
    expect(task.previousReports).toHaveLength(1)
    expect(task.previousReports[0].markdown).toContain('Example report')
    // The rerun fixture includes the follow-up guidance.
    expect(task.report?.markdown).toContain('Make it shorter and friendlier')
    // Both the user follow-up and the acknowledgment are on the thread.
    expect(
      task.messages.filter((message) => message.role === 'user').map((m) => m.content),
    ).toContain('Make it shorter and friendlier')
    setRunnerStepMs(1100)
  }, 25000)

  it('filters tasks by status on the Work home', async () => {
    setRunnerStepMs(5)
    useWorkStore.getState().initialize()
    const store = useWorkStore.getState()
    const draftId = store.createTask({ title: 'Draft only', goal: '', deliverable: 'email-draft' })
    const doneId = store.createTask({ title: 'Finished work', goal: '', deliverable: 'email-draft' })
    void draftId
    // Drive one task to completed through the real state machine.
    store.runTask(doneId)
    await waitFor(() => {
      expect(useWorkStore.getState().tasks[doneId]?.status).toBe('needs_input')
    })
    store.answerInput(doneId, 'Formal')
    await waitFor(() => {
      expect(useWorkStore.getState().tasks[doneId]?.status).toBe('ready_for_review')
    })
    store.completeTask(doneId)

    // Persist before rendering so the app's initialize() loads these tasks.
    flushWorkPersistence()
    renderApp('/work')
    expect((await screen.findAllByText('Draft only')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('Finished work').length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('tab', { name: 'Completed' }))
    // The Work list is filtered; the sidebar's recent-tasks list is not,
    // so scope the assertion to the main content.
    const main = within(screen.getByRole('main'))
    expect(main.queryByText('Draft only')).toBeNull()
    expect(main.getAllByText('Finished work').length).toBeGreaterThan(0)
    setRunnerStepMs(1100)
  }, 15000)
})

describe('Work — routing resilience (audit R3)', () => {
  setupAppTest()

  it('direct-loads a task by URL after a refresh', () => {
    useWorkStore.getState().initialize()
    const id = useWorkStore.getState().createTask({
      title: 'Direct link task',
      goal: '',
      deliverable: 'data-review',
    })
    flushWorkPersistence()
    renderApp(`/work/${id}`)
    expect(screen.getAllByText('Direct link task').length).toBeGreaterThan(0)
  })

  it('recovers an unknown task id to the Work home', async () => {
    renderApp('/work/task-does-not-exist')
    await waitFor(() => expect(screen.getByText('What needs doing?')).toBeTruthy())
  })

  it('links an agent into the task and keeps the reference readable', () => {
    useAgentsStore.getState().initialize()
    const agentId = useAgentsStore.getState().duplicateAgent('agent-research-analyst') as string
    useAgentsStore.getState().saveAgent({
      ...useAgentsStore.getState().agents[agentId],
      name: 'My researcher',
    })

    useWorkStore.getState().initialize()
    const id = useWorkStore.getState().createTask({
      title: 'Agent-linked task',
      goal: '',
      deliverable: 'research-report',
      agentId,
    })
    flushWorkPersistence()
    renderApp(`/work/${id}`)
    // The agent reference stays visible in the honest composer status line.
    expect(screen.getAllByText(/My researcher/).length).toBeGreaterThan(0)
  })
})
