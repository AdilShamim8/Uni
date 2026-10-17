import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChatAdapter } from '@/domain/chatAdapter'
import { setChatAdapter } from '@/state/store'
import { renderApp, setupAppTest } from './helpers'

/**
 * A controllable adapter: the test decides when the stream finishes, so
 * "typed during streaming" is deterministic — no timer races on CI.
 */
function createControlledAdapter() {
  let release: (() => void) | null = null
  const adapter: ChatAdapter = {
    id: 'controlled-test-adapter',
    label: 'Controlled test adapter',
    stream(_request, handlers, signal) {
      return new Promise<void>((resolve) => {
        release = () => {
          release = null
          handlers.onDone('complete')
          resolve()
        }
        signal.addEventListener('abort', () => {
          release = null
          handlers.onDone('stopped')
          resolve()
        })
      })
    },
  }
  return {
    adapter,
    finishStream: () => new Promise<void>((resolve) => {
      const done = () => resolve()
      ;(release ?? done)()
      resolve()
    }),
  }
}

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
    const controlled = createControlledAdapter()
    setChatAdapter(controlled.adapter)
    renderApp('/')

    const input = screen.getByLabelText('Message Universe')
    await userEvent.type(input, 'First message')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    // Composer cleared immediately at submit time, and the turn is
    // streaming (stop button visible).
    await waitFor(() => expect(input).toHaveValue(''))
    expect(screen.getByRole('button', { name: 'Stop generating' })).toBeTruthy()

    // Type a new draft while the assistant is still streaming.
    await userEvent.type(input, 'draft typed mid-stream')

    // Finish the turn — the draft must survive it (audit D2).
    await controlled.finishStream()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Send message' })).toBeTruthy(),
    )
    expect(input).toHaveValue('draft typed mid-stream')
  })

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
