import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMockAdapter } from '@/services/mock/mockChatAdapter'
import { setChatAdapter } from '@/state/store'
import { renderApp, setupAppTest } from './helpers'

/**
 * Audit D2 — the composer used to clear `text` in a `finally` block after
 * the stream completed, wiping anything the user typed while a reply was
 * still streaming. These tests pin the fixed ownership model:
 *
 *   1. text typed during streaming survives the turn's completion;
 *   2. the submitted message itself is cleared immediately at submit;
 *   3. drafts are scoped per conversation and restored on switch.
 */
describe('composer draft ownership (audit D2)', () => {
  setupAppTest()

  it('preserves text typed while a reply streams', async () => {
    // Slow adapter: the stream stays open long enough to type mid-flight.
    setChatAdapter(createMockAdapter({ chunkDelay: 10, firstTokenDelay: 60 }))
    renderApp('/')

    const input = screen.getByLabelText('Message Universe')
    await userEvent.type(input, 'Tell me about planets')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    // Composer cleared immediately at submit time.
    await waitFor(() => expect(input).toHaveValue(''))

    // Type a new draft while the assistant is still streaming.
    await userEvent.type(input, 'second question draft')

    // Wait until the turn completes (stop button replaced by send).
    await waitFor(
      () => expect(screen.getByRole('button', { name: 'Send message' })).toBeTruthy(),
      { timeout: 6000 },
    )

    // The draft typed mid-stream must still be there.
    expect(input).toHaveValue('second question draft')
  }, 15000)

  it('scopes drafts per conversation and restores them on switch', async () => {
    renderApp('/')

    const input = screen.getByLabelText('Message Universe')
    const { useAppStore } = await import('@/state/store')
    const ids = Object.keys(useAppStore.getState().conversations)
    const [conversationA, conversationB] = ids
    expect(conversationA).toBeTruthy()
    expect(conversationB).toBeTruthy()

    // Type a draft while no conversation is active (key: 'new').
    await userEvent.type(input, 'draft for first conversation')

    // Open conversation A — its composer starts empty.
    useAppStore.getState().selectConversation(conversationA)
    await waitFor(() => expect(input).toHaveValue(''))

    // Type a different draft in A.
    await userEvent.type(input, 'draft for second conversation')

    // Switch to B, then back to A — A's draft must come back exactly.
    useAppStore.getState().selectConversation(conversationB)
    await waitFor(() => expect(input).toHaveValue(''))
    useAppStore.getState().selectConversation(conversationA)
    await waitFor(() => expect(input).toHaveValue('draft for second conversation'))
  })
})
