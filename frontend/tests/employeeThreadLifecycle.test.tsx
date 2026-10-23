import { StrictMode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { App } from '@/app/App'
import { useAppStore } from '@/state/store'
import { renderApp, setupAppTest } from './helpers'

/**
 * Regression coverage for the B00 prerequisite fix: EmployeeView used to
 * call the mutating openAgentConversation() inside useMemo — a store write
 * during render that produced "Cannot update a component (Sidebar) while
 * rendering a different component (EmployeeView)" warnings. Resolution now
 * runs in an effect with a loading state, and must stay idempotent so
 * Strict Mode's double-invoked effects cannot duplicate threads.
 */

/** Render the full app inside React StrictMode (dev double-invoke behavior). */
function renderAppStrict(initialEntry: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[initialEntry]}>
        <App />
      </MemoryRouter>
    </StrictMode>,
  )
}

const main = () => within(screen.getByRole('main'))

/** IDs of every conversation linked to the given employee. */
const agentThreadIds = (agentId: string): string[] =>
  Object.entries(useAppStore.getState().conversations)
    .filter(([, conversation]) => conversation.agentId === agentId)
    .map(([id]) => id)

describe('EmployeeView — safe thread lifecycle', () => {
  setupAppTest()

  it('opens the employee thread without mutating the store during render', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    renderApp('/agents/agent-research-analyst')

    // The composer appears once the thread resolution effect has run.
    expect(
      await screen.findByRole('textbox', { name: /Message Research Analyst/i }),
    ).toBeInTheDocument()

    const renderTimeUpdates = errorSpy.mock.calls
      .map((call) => String(call[0] ?? ''))
      .filter((message) => message.includes('while rendering a different component'))
    errorSpy.mockRestore()
    expect(renderTimeUpdates).toHaveLength(0)
  })

  it('exposes a loading state, then the thread, for a fresh employee view', async () => {
    renderApp('/agents/agent-research-analyst')

    // The very first paint resolves asynchronously now: the composer only
    // mounts after the effect has opened (or taken over) the thread. By
    // the time the composer is queryable, the thread must be selected.
    expect(
      await screen.findByRole('textbox', { name: /Message Research Analyst/i }),
    ).toBeInTheDocument()
    const ids = agentThreadIds('agent-research-analyst')
    expect(ids).toHaveLength(1)
    expect(useAppStore.getState().activeConversationId).toBe(ids[0])
  })

  it('Strict Mode double-invoked effects reuse one thread, not duplicates', async () => {
    renderAppStrict('/agents/agent-research-analyst')

    expect(
      await screen.findByRole('textbox', { name: /Message Research Analyst/i }),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(agentThreadIds('agent-research-analyst')).toHaveLength(1)
    })
    // The reused thread is the store's active conversation.
    expect(useAppStore.getState().activeConversationId).toBe(
      agentThreadIds('agent-research-analyst')[0],
    )
  })

  it('navigating away and back reuses the same employee thread', async () => {
    renderApp('/agents/agent-research-analyst')
    const composer = await screen.findByRole('textbox', {
      name: /Message Research Analyst/i,
    })
    const originalId = agentThreadIds('agent-research-analyst')[0]
    expect(originalId).toBeTruthy()

    // Give the thread content so the "reuse existing" path is exercised.
    await userEvent.type(composer, 'remember to reuse threads')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => {
      const conversation = useAppStore.getState().conversations[originalId]
      expect(Object.keys(conversation?.nodes ?? {})).not.toHaveLength(0)
    })

    // Leave to the agents directory, then re-enter the employee view.
    await userEvent.click(screen.getByRole('button', { name: 'Back to Agents' }))
    await screen.findAllByText('Research Analyst')
    await userEvent.click(main().getByText('Research Analyst'))
    expect(
      await screen.findByRole('textbox', { name: /Message Research Analyst/i }),
    ).toBeInTheDocument()

    expect(agentThreadIds('agent-research-analyst')).toEqual([originalId])
  })
})
