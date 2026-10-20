import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAgentsStore, flushAgentsPersistence } from '@/state/agentsStore'
import { useAppStore } from '@/state/store'
import { useWorkStore } from '@/state/workStore'
import { renderApp, setupAppTest } from './helpers'

/** The agent also appears in the sidebar's agents list; scope to the page. */
const main = () => within(screen.getByRole('main'))

describe('Agents — directory and builder', () => {
  setupAppTest()

  it('seeds the personal assistant and specialists, searchable', async () => {
    renderApp('/agents')
    expect(await screen.findAllByText('Uni Assistant')).not.toHaveLength(0)
    expect(main().getByText('Research Analyst')).toBeTruthy()
    expect(main().getByText('Writing Assistant')).toBeTruthy()
    expect(main().getByText('Finance Analyst')).toBeTruthy()

    await userEvent.type(screen.getByLabelText('Search agents'), 'finance')
    expect(main().queryByText('Research Analyst')).toBeNull()
    expect(main().getByText('Finance Analyst')).toBeTruthy()
  })

  it('features the Uni bot as a hero with working chat and starters', async () => {
    renderApp('/agents')

    // The hero renders in its own Featured section, above the directory.
    const hero = await screen.findByRole('heading', { level: 3, name: 'Uni' })
    expect(hero).toBeTruthy()
    expect(main().getByText(/AI teammate you give real work to/i)).toBeTruthy()

    // The honest provider hint deep-links the Providers settings section.
    await userEvent.click(main().getByRole('button', { name: 'xAI · Grok' }))
    const settings = await screen.findByRole('dialog', { name: 'Settings' })
    expect(within(settings).getByRole('button', { name: 'Providers & models' })).toHaveAttribute(
      'aria-current',
      'true',
    )
    await userEvent.click(within(settings).getByRole('button', { name: 'Close dialog' }))

    // A starter chip opens the bot's conversation with the draft prefilled.
    await userEvent.click(main().getByRole('button', { name: 'Take this task end to end' }))
    const composer = await screen.findByRole('textbox', { name: /Message Uni$/i })
    expect(composer).toHaveValue('Take this task end to end')
  })

  it('validates the builder: empty name and instructions are rejected', async () => {
    renderApp('/agents/new')
    await userEvent.click(screen.getByRole('button', { name: 'Create agent' }))
    expect(await screen.findByText('Give the agent a name.')).toBeTruthy()
    expect(screen.getByText('Write at least one line of instructions.')).toBeTruthy()
  })

  it('creates a specialist, then edits it from the employee view', async () => {
    renderApp('/agents/new')
    await userEvent.type(screen.getByLabelText('Name'), 'My editor')
    await userEvent.type(screen.getByLabelText('Description'), 'Helps with prose')
    await userEvent.type(screen.getByLabelText('Instructions'), 'Tighten the text.')
    await userEvent.click(screen.getByRole('button', { name: 'Create agent' }))

    // The employee view opens with its conversation directly.
    expect((await screen.findAllByText('My editor')).length).toBeGreaterThan(0)
    expect(
      await screen.findByRole('textbox', { name: /Message My editor/i }),
    ).toBeInTheDocument()

    // Edit flow.
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const nameField = screen.getByLabelText('Name')
    await userEvent.clear(nameField)
    await userEvent.type(nameField, 'My editor 2')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.getAllByText('My editor 2').length).toBeGreaterThan(0))
  })

  it('refuses to delete built-in agents and archives referenced custom agents', async () => {
    renderApp('/agents')
    await screen.findAllByText('Uni Assistant')
    // Built-ins expose no delete action (archive instead); the personal
    // assistant's menu offers Archive, not Delete.
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull()
  })
})

describe('Employees — direct conversation', () => {
  setupAppTest()

  it('opens the conversation immediately and reuses the same thread', async () => {
    renderApp('/agents')
    await screen.findAllByText('Research Analyst')

    // Selecting the employee opens its conversation — no info-card hop.
    await userEvent.click(main().getByText('Research Analyst'))
    const input = await screen.findByRole('textbox', {
      name: /Message Research Analyst/i,
    })
    expect(input).toBeInTheDocument()

    // Send a message; the demo reply notes the agent instructions.
    await userEvent.type(input, 'Compare two options')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(
      () =>
        expect(document.body.textContent).toContain('Working from your agent instructions'),
      { timeout: 4000 },
    )

    // Leaving and returning reuses the same conversation, not a new one.
    const conversationCountBefore = Object.keys(useAppStore.getState().conversations).filter(
      (id) => useAppStore.getState().conversations[id].agentId === 'agent-research-analyst',
    ).length
    useAppStore.getState().openAgentConversation('agent-research-analyst')
    const conversationCountAfter = Object.keys(useAppStore.getState().conversations).filter(
      (id) => useAppStore.getState().conversations[id].agentId === 'agent-research-analyst',
    ).length
    expect(conversationCountAfter).toBe(conversationCountBefore)
  })

  it('assigns real work from the thread and opens the same task from the card', async () => {
    renderApp('/agents/agent-research-analyst')

    // /assign opens the inline brief prefilled with the command text;
    // confirmation creates ONE real task.
    const input = await screen.findByRole('textbox', {
      name: /Message Research Analyst/i,
    })
    await userEvent.type(input, '/assign Compare two note-taking apps')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    const brief = await screen.findByLabelText('Assignment brief')
    expect(brief).toHaveValue('Compare two note-taking apps')
    await userEvent.click(screen.getByRole('button', { name: 'Create task' }))

    // An assignment card links the canonical task.
    const card = await screen.findByRole('button', { name: /Compare two note-taking apps/ })
    await userEvent.click(card)

    // Opening it lands on the SAME task thread, not a copy.
    await waitFor(() => {
      const tasks = Object.values(useWorkStore.getState().tasks)
      expect(tasks).toHaveLength(1)
      expect(tasks[0].agentId).toBe('agent-research-analyst')
    })
    expect(await screen.findByRole('textbox', { name: /Send a follow-up/ })).toBeInTheDocument()

    // Returning to the employee keeps its thread and the assignment card.
    const primaryNav = screen.getByRole('navigation', { name: 'Primary' })
    await userEvent.click(within(primaryNav).getByRole('button', { name: 'Agents' }))
    await userEvent.click(
      await within(screen.getByRole('main')).findByText('Research Analyst'),
    )
    expect(
      await screen.findByRole('textbox', { name: /Message Research Analyst/i }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Compare two note-taking apps/ })).toBeInTheDocument()
  })

  it('remembers a note through the explicit /remember command', async () => {
    renderApp('/agents/agent-universe-assistant')
    const input = await screen.findByRole('textbox', {
      name: /Message Uni Assistant/i,
    })

    await userEvent.type(input, '/remember Prefers concise answers')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    // The thread records the memory confirmation…
    expect(await screen.findByText('Remembered: Prefers concise answers')).toBeInTheDocument()
    expect(
      screen.getByText(/Saved locally to this assistant’s memory/),
    ).toBeInTheDocument()

    // …and the note itself lives in the Memory inspector.
    await userEvent.click(screen.getByRole('button', { name: 'Profile' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Memory' }))
    expect(await screen.findByText('Prefers concise answers')).toBeInTheDocument()
  })
})

describe('Employee — inspector panels', () => {
  setupAppTest()

  it('adds, edits, and deletes memory notes locally', async () => {
    renderApp('/agents/agent-universe-assistant')
    await userEvent.click(await screen.findByRole('button', { name: 'Profile' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Memory' }))

    const noteInput = screen.getByLabelText('New memory note')
    await userEvent.type(noteInput, 'Prefers morning planning')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Prefers morning planning')).toBeTruthy()

    // Edit inline.
    await userEvent.click(screen.getByRole('button', { name: 'Edit note' }))
    const editField = screen.getByLabelText('Edit memory note')
    await userEvent.clear(editField)
    await userEvent.type(editField, 'Prefers evening planning')
    await userEvent.click(screen.getByRole('button', { name: /^Save$/ }))

    await waitFor(() => expect(screen.getByText('Prefers evening planning')).toBeTruthy())

    // Delete.
    await userEvent.click(screen.getByRole('button', { name: 'Delete note' }))
    await waitFor(() =>
      expect(screen.queryByText('Prefers evening planning')).toBeNull(),
    )
  })

  it('saves routine drafts with the honest unavailable-execution label', async () => {
    renderApp('/agents/agent-universe-assistant')
    await userEvent.click(await screen.findByRole('button', { name: 'Profile' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Routines' }))

    expect(screen.getByText(/Saved locally — execution unavailable/)).toBeTruthy()

    await userEvent.type(screen.getByLabelText('Routine name'), 'Monday summary')
    await userEvent.type(
      screen.getByLabelText('Routine instructions'),
      'Draft a weekly summary each Monday morning',
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByText('Monday summary')).toBeTruthy()
    expect(screen.getAllByText(/execution unavailable/).length).toBeGreaterThan(0)
    expect(screen.queryByText('Active')).toBeNull()
  })

  it('lists tasks assigned to the employee from Work', async () => {
    useAgentsStore.getState().initialize()
    useWorkStore.getState().initialize()
    useWorkStore.getState().createTask({
      title: 'Plan my week',
      goal: 'Draft a weekly plan',
      deliverable: 'research-report',
      agentId: 'agent-universe-assistant',
    })

    renderApp('/agents/agent-universe-assistant')
    await userEvent.click(await screen.findByRole('button', { name: 'Profile' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Work' }))
    expect(await screen.findByText('Plan my week')).toBeTruthy()
  })

  it('persists memory across reload', async () => {
    useAgentsStore.getState().initialize()
    useAgentsStore.getState().addMemoryNote('agent-universe-assistant', 'Persisted preference')
    flushAgentsPersistence()

    renderApp('/agents/agent-universe-assistant')
    await userEvent.click(await screen.findByRole('button', { name: 'Profile' }))
    await userEvent.click(screen.getByRole('tab', { name: 'Memory' }))
    expect(await screen.findByText('Persisted preference')).toBeTruthy()
  })
})
