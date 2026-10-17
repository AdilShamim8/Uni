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
 * The milestone's single complete demonstration, end to end:
 * create a Research brief task → choose an agent → Run demo → inspect
 * activity → answer the input request → review the editable fixture
 * report → edit it → mark complete → download Markdown that matches the
 * edited visible report.
 */
describe('Work — complete local demo flow', () => {
  setupAppTest()

  it('runs the research template from creation to download', async () => {
    setRunnerStepMs(10)
    renderApp('/work')

    // Start from the Research brief template card.
    await userEvent.click(await screen.findByRole('button', { name: /Research brief/ }))

    // Brief form: title, goal, agent.
    const titleInput = screen.getByLabelText('Title')
    await userEvent.type(titleInput, 'Compare two routers')

    const goalInput = screen.getByLabelText('Goal')
    await userEvent.type(goalInput, 'Pick a router for the new apartment')

    const agentSelect = screen.getByLabelText('Agent')
    await userEvent.selectOptions(agentSelect, 'agent-research-analyst')

    await userEvent.click(screen.getByRole('button', { name: 'Create task' }))

    // Task workspace: brief shows the agent and demo mode. The title
    // appears both in the sidebar's recent-tasks list and the workspace.
    expect((await screen.findAllByText('Compare two routers')).length).toBeGreaterThan(1)
    expect(screen.getByText('Research Analyst')).toBeTruthy()
    expect(screen.getByText('Local demo')).toBeTruthy()

    // Run the demo.
    await userEvent.click(screen.getByRole('button', { name: /Run demo/ }))

    // The run asks for input.
    const question = await screen.findByText(/quick comparison or a deeper dive/i)
    expect(question).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Quick comparison' }))

    // The activity timeline records the plan and tool steps.
    await waitFor(
      () => expect(screen.getByText('Ready for review')).toBeTruthy(),
      { timeout: 8000 },
    )
    expect(screen.getByText(/Searching sources \(simulated\)/)).toBeTruthy()
    expect(screen.getByText(/Drafting the comparison \(simulated\)/)).toBeTruthy()

    // The report renders as fixture content, honestly labeled.
    expect(screen.getByText(/Example report — simulated output/)).toBeTruthy()

    // Edit the visible report.
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const editor = screen.getByLabelText('Edit report markdown')
    await userEvent.clear(editor)
    await userEvent.type(editor, '# My edited findings\n\nAll mine.')

    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }))
    await waitFor(() => expect(screen.getByText('My edited findings')).toBeTruthy())

    // Download must match the EDITED report.
    const downloadSpy = vi.mocked(downloadText)
    downloadSpy.mockClear()
    await userEvent.click(screen.getByRole('button', { name: /Download/ }))
    expect(downloadSpy).toHaveBeenCalledWith(
      expect.stringContaining('compare-two-routers'),
      expect.stringContaining('# My edited findings'),
    )

    // Mark complete from the review panel.
    await userEvent.click(screen.getByRole('button', { name: /Mark complete/ }))
    await waitFor(() => expect(screen.getByText('Completed')).toBeTruthy())
    setRunnerStepMs(1100)
  }, 20000)

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
    await waitFor(() =>
      expect(screen.getByText('Describe an outcome, run it as a local demo, review the output.')).toBeTruthy(),
    )
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
    expect(screen.getAllByText('My researcher').length).toBeGreaterThan(0)
  })
})
