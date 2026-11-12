import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ServerChatComposer } from '@/features/chat/server/ServerChatComposer'
import { useServerSessionStore } from '@/state/serverSessionStore'
import { resetStoreForTests } from '@/state/store'
import type { ServerProvider } from '@/services/api/serverProviders'

/**
 * Phase B unified server chat surface — the composer: destination
 * semantics reuse (N004), honest unavailable placeholder when no usable
 * provider exists, send/stop states, Enter-to-send with the user's
 * send-key preference, and honest run-error display.
 */

const PROVIDERS: ServerProvider[] = [
  {
    id: 'p-1',
    label: 'Local runtime',
    kind: 'openai-compatible',
    authMode: 'none',
    endpointUrl: 'http://127.0.0.1:11434/v1',
    modelId: 'llama-3.1-8b',
    models: ['llama-3.1-8b'],
    credential: {
      present: false,
      keyId: null,
      status: 'untested',
      lastCheckedAt: null,
      lastError: null,
    },
    createdAt: 1,
    updatedAt: 1,
  },
]

describe('ServerChatComposer', () => {
  beforeEach(() => {
    cleanup()
    resetStoreForTests()
    useServerSessionStore.setState({
      serverProviders: PROVIDERS,
      serverSelection: { providerId: 'p-1', modelId: 'llama-3.1-8b' },
      serverSelectionNotice: null,
      activeRun: null,
      runError: null,
      sendServerMessage: vi.fn(async () => true),
      stopActiveServerRun: vi.fn(async () => {}),
    })
  })

  it('sends the typed text through the server send action', async () => {
    const user = userEvent.setup()
    const send = vi.fn(async () => true)
    useServerSessionStore.setState({ sendServerMessage: send })
    render(<ServerChatComposer conversationId="c-1" />)

    await user.type(screen.getByLabelText('Message Uni on this server'), 'Hello server')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(send).toHaveBeenCalledWith('Hello server')
  })

  it('submits on Enter (default send key) but not on Shift+Enter', async () => {
    const user = userEvent.setup()
    const send = vi.fn(async () => true)
    useServerSessionStore.setState({ sendServerMessage: send })
    render(<ServerChatComposer conversationId="c-1" />)

    const input = screen.getByLabelText('Message Uni on this server')
    await user.type(input, 'first line')
    await user.keyboard('{Shift>}{Enter}{/Shift}')
    expect(send).not.toHaveBeenCalled()
    await user.type(input, 'second line')
    await user.keyboard('{Enter}')
    expect(send).toHaveBeenCalledWith('first line\nsecond line')
  })

  it('shows Stop instead of Send while the run is live and stops through the store', async () => {
    const user = userEvent.setup()
    const stop = vi.fn(async () => {})
    useServerSessionStore.setState({
      stopActiveServerRun: stop,
      activeRun: {
        runId: 'r-1',
        conversationId: 'c-1',
        text: '…',
        status: 'running',
        errorMessage: null,
      },
    })
    render(<ServerChatComposer conversationId="c-1" />)

    expect(screen.queryByRole('button', { name: 'Send message' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Stop generating' }))
    expect(stop).toHaveBeenCalled()
  })

  it('disables Send with no text and re-enables once text exists', async () => {
    const user = userEvent.setup()
    render(<ServerChatComposer conversationId="c-1" />)
    const send = screen.getByRole('button', { name: 'Send message' })
    expect(send).toBeDisabled()
    await user.type(screen.getByLabelText('Message Uni on this server'), 'hi')
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled()
  })

  it('shows the honest no-provider placeholder when no usable provider exists', () => {
    useServerSessionStore.setState({ serverProviders: [], serverSelection: null })
    render(<ServerChatComposer conversationId="c-1" />)
    expect(
      screen.getByPlaceholderText('Add a server provider in Settings → Account first…'),
    ).toBeInTheDocument()
  })

  it('displays the run error honestly', () => {
    useServerSessionStore.setState({ runError: 'Run failed: provider unavailable' })
    render(<ServerChatComposer conversationId="c-1" />)
    expect(screen.getByRole('alert')).toHaveTextContent('Run failed: provider unavailable')
  })

  it('ignores a live run that belongs to a different conversation', () => {
    useServerSessionStore.setState({
      activeRun: {
        runId: 'r-9',
        conversationId: 'c-other',
        text: '…',
        status: 'running',
        errorMessage: null,
      },
    })
    render(<ServerChatComposer conversationId="c-1" />)
    expect(screen.getByRole('button', { name: 'Send message' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop generating' })).not.toBeInTheDocument()
  })
})
