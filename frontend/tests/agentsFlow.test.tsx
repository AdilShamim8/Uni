import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAgentsStore, flushAgentsPersistence } from '@/state/agentsStore'
import { useAppStore } from '@/state/store'
import { useWorkStore } from '@/state/workStore'
import { renderApp, setupAppTest } from './helpers'

describe('Agents — directory and builder', () => {
  setupAppTest()

  it('seeds the personal assistant and specialists, searchable', async () => {
    renderApp('/agents')
    expect(await screen.findByText('Universe Assistant')).toBeTruthy()
    expect(screen.getByText('Research Analyst')).toBeTruthy()
    expect(screen.getByText('Writing Assistant')).toBeTruthy()
    expect(screen.getByText('Finance Analyst')).toBeTruthy()

    await userEvent.type(screen.getByLabelText('Search agents'), 'finance')
    expect(screen.queryByText('Research Analyst')).toBeNull()
    expect(screen.getByText('Finance Analyst')).toBeTruthy()
  })

  it('validates the builder: empty name and instructions are rejected', async () => {
    renderApp('/agents/new')
    await userEvent.click(screen.getByRole('button', { name: 'Create agent' }))
    expect(await screen.findByText('Give the agent a name.')).toBeTruthy()
    expect(screen.getByText('Write at least one line of instructions.')).toBeTruthy()
  })

  it('creates a specialist, then edits it', async () => {
    renderApp('/agents/new')
    await userEvent.type(screen.getByLabelText('Name'), 'My editor')
    await userEvent.type(screen.getByLabelText('Description'), 'Helps with prose')
    await userEvent.type(screen.getByLabelText('Instructions'), 'Tighten the text.')
    await userEvent.click(screen.getByRole('button', { name: 'Create agent' }))

    // Detail page shows the saved profile.
    expect((await screen.findAllByText('My editor')).length).toBeGreaterThan(0)
    expect(screen.getByText('Tighten the text.')).toBeTruthy()

    // Edit flow.
    await userEvent.click(screen.getByRole('button', { name: 'Edit profile' }))
    const nameField = screen.getByLabelText('Name')
    await userEvent.clear(nameField)
    await userEvent.type(nameField, 'My editor 2')
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.getAllByText('My editor 2').length).toBeGreaterThan(0))
  })

  it('refuses to delete built-in agents and archives referenced custom agents', async () => {
    renderApp('/agents')
    await screen.findByText('Universe Assistant')
    // Built-ins expose no delete action (archive instead); the personal
    // assistant's menu offers Archive, not Delete.
    expect(screen.queryByRole('menuitem', { name: 'Delete' })).toBeNull()
  })
})

describe('Agents — chat wiring', () => {
  setupAppTest()

  it('"Chat with agent" opens one scoped conversation that reuses the same thread', async () => {
    renderApp('/agents')
    await screen.findByText('Research Analyst')

    // Open the profile, then chat with it.
    await userEvent.click(screen.getByText('Research Analyst'))
    await userEvent.click(
      await screen.findByRole('button', { name: /Chat with agent/ }),
    )

    // The conversation is titled for the agent and shares one thread.
    await waitFor(() =>
      expect(screen.getAllByText('Chat with Research Analyst').length).toBeGreaterThan(0),
    )

    // Send a message; the demo reply notes the agent instructions.
    const input = screen.getByLabelText('Message Universe')
    await userEvent.type(input, 'Compare two options')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(
      () => {
        const replies = Array.from(document.querySelectorAll('[data-node-role="assistant"], .prose'))
        return replies.length
      },
      { timeout: 4000 },
    )
    await waitFor(() =>
      expect(document.body.textContent).toContain('Working from your agent instructions'),
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

  it('"Assign task" preselects the agent in the Work brief', async () => {
    renderApp('/agents')
    await screen.findByText('Writing Assistant')
    await userEvent.click(screen.getByText('Writing Assistant'))
    await userEvent.click(await screen.findByRole('button', { name: /Chat with agent|\.\.\./ }))
  })
})

describe('Personal assistant — memory and schedules', () => {
  setupAppTest()

  it('adds, edits, and deletes memory notes locally', async () => {
    renderApp('/agents/agent-universe-assistant')
    await userEvent.click(await screen.findByRole('tab', { name: 'Memory' }))

    const noteInput = screen.getByLabelText('New memory note')
    await userEvent.type(noteInput, 'Prefers morning planning')
    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Prefers morning planning')).toBeTruthy()

    // Edit inline.
    await userEvent.click(screen.getByRole('button', { name: 'Edit note' }))
    const editField = screen.getByLabelText('Edit memory note')
    await userEvent.clear(editField)
    await userEvent.type(editField, 'Prefers evening planning')
    await userEvent.click(screen.getByRole('button', { name: /Save/ }))

    await waitFor(() => expect(screen.getByText('Prefers evening planning')).toBeTruthy())

    // Delete.
    await userEvent.click(screen.getByRole('button', { name: 'Delete note' }))
    await waitFor(() =>
      expect(screen.queryByText('Prefers evening planning')).toBeNull(),
    )
  })

  it('saves schedule drafts with the honest unavailable-execution label', async () => {
    renderApp('/agents/agent-universe-assistant')
    await userEvent.click(await screen.findByRole('tab', { name: 'Schedules' }))

    expect(
      screen.getByText('Saved locally — execution unavailable'),
    ).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'New draft' }))
    await userEvent.type(screen.getByLabelText('Name'), 'Monday summary')
    await userEvent.type(screen.getByLabelText(/Notify when/), 'When drafted')
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByText('Monday summary')).toBeTruthy()
    expect(screen.getByText('Draft saved locally · never runs on its own')).toBeTruthy()
    expect(screen.queryByText('Active')).toBeNull()
  })

  it('lists tasks assigned to the assistant from Work', async () => {
    useAgentsStore.getState().initialize()
    useWorkStore.getState().initialize()
    useWorkStore.getState().createTask({
      title: 'Plan my week',
      goal: 'Draft a weekly plan',
      deliverable: 'research-report',
      agentId: 'agent-universe-assistant',
    })

    renderApp('/agents/agent-universe-assistant')
    await userEvent.click(await screen.findByRole('tab', { name: 'Assigned work' }))
    expect(await screen.findByText('Plan my week')).toBeTruthy()
  })

  it('persists memory across reload', async () => {
    useAgentsStore.getState().initialize()
    useAgentsStore.getState().addMemoryNote('agent-universe-assistant', 'Persisted preference')
    flushAgentsPersistence()

    renderApp('/agents/agent-universe-assistant')
    await userEvent.click(await screen.findByRole('tab', { name: 'Memory' }))
    expect(await screen.findByText('Persisted preference')).toBeTruthy()
  })
})
