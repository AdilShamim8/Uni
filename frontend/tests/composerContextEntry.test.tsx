import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useContextStore } from '@/state/contextStore'
import { useAppStore } from '@/state/store'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'
import { renderApp, setupAppTest } from './helpers'

setupAppTest()

describe('composer context entry point', () => {
  it('opens the inspector Context tab from the composer toolbar', async () => {
    renderApp('/')
    const input = screen.getByLabelText('Message Uni')
    await userEvent.type(input, 'Hello there')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(useAppStore.getState().activeConversationId).toBeTruthy())

    // The button exists next to Attach files, with no badge while empty.
    const contextButton = screen.getByRole('button', {
      name: 'Context — choose what this chat can see',
    })
    expect(contextButton).toBeInTheDocument()
    expect(contextButton.textContent).not.toMatch(/\d/)

    await userEvent.click(contextButton)
    const tab = await screen.findByRole('tab', { name: 'Context' })
    expect(tab).toHaveAttribute('aria-selected', 'true')
    expect(useWorkspaceUiStore.getState().inspectorOpen).toBe(true)
  })

  it('the badge counts selected context items for the active conversation', async () => {
    renderApp('/')
    const input = screen.getByLabelText('Message Uni')
    await userEvent.type(input, 'Hello again')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(useAppStore.getState().activeConversationId).toBeTruthy())
    const conversationId = useAppStore.getState().activeConversationId as string

    useContextStore.getState().addNoteContext(conversationId, {
      title: 'Audience note',
      content: 'Internal reviewers only.',
    })
    useContextStore.getState().addKnowledgeContext(conversationId)

    await waitFor(() => {
      const badge = screen
        .getByRole('button', { name: 'Context — choose what this chat can see' })
        .querySelector('span[aria-hidden="true"]')
      expect(badge).not.toBeNull()
      expect(badge!.textContent).toBe('2')
    })

    // The panel opened from the same button shows both items honestly.
    await userEvent.click(
      screen.getByRole('button', { name: 'Context — choose what this chat can see' }),
    )
    await screen.findByRole('tab', { name: 'Context' })
    expect(await screen.findByText('Audience note')).toBeInTheDocument()
    expect(await screen.findByText('Knowledge base')).toBeInTheDocument()
  })
})
