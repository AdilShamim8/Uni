import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  setDemoStreamForTests,
  useCompareStore,
  type CompareSlot,
} from '@/state/compareStore'
import { useAppStore } from '@/state/store'
import { useLibraryStore } from '@/state/libraryStore'
import { renderApp, setupAppTest } from './helpers'

setupAppTest()

function makeSlots(): [CompareSlot, CompareSlot] {
  return [
    {
      providerId: 'provider-demo-balanced',
      modelId: 'demo-pro',
      modelLabel: 'Demo Pro',
      providerLabel: 'Uni Demo — Balanced',
    },
    {
      providerId: 'provider-demo-anthropic-style',
      modelId: 'demo-chat-s',
      modelLabel: 'Demo Chat S',
      providerLabel: 'Demo — Another-style profile',
    },
  ]
}

describe('model comparison', () => {
  it('never auto-runs — the run starts only from the explicit button', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Compare models' }))

    // Pick models and type a prompt; nothing runs yet.
    await user.selectOptions(
      screen.getByLabelText('Model A selection'),
      'provider-demo-balanced::demo-pro',
    )
    await user.selectOptions(
      screen.getByLabelText('Model B selection'),
      'provider-demo-anthropic-style::demo-chat-s',
    )
    await user.type(screen.getByPlaceholderText(/one prompt both models/i), 'Explain queues simply')

    expect(useCompareStore.getState().current).toBeNull()

    await user.click(screen.getByRole('button', { name: /Run comparison/ }))
    await waitFor(() => expect(useCompareStore.getState().current).not.toBeNull())
    expect(useCompareStore.getState().current?.prompt).toBe('Explain queues simply')
  })

  it('stopping one side leaves the other side intact (separate controllers)', async () => {
    // Controlled demo streams: slot 0 waits forever until aborted; slot 1
    // completes after a tick.
    setDemoStreamForTests((slotIndex, handlers, signal) => {
      if (slotIndex === 0) {
        return new Promise<void>((resolve) => {
          const onAbort = () => {
            signal.removeEventListener('abort', onAbort)
            handlers.onDone('stopped')
            resolve()
          }
          signal.addEventListener('abort', onAbort)
        })
      }
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          handlers.onDelta('Side B finished its answer.')
          handlers.onDone('complete')
          resolve()
        }, 10)
      })
    })

    useCompareStore.getState().startComparison({
      prompt: 'test prompt',
      slots: makeSlots(),
      contextBlock: '',
      history: [],
    })

    const state = useCompareStore.getState()
    expect(state.current?.results[0].status).toBe('running')

    // Stop ONLY slot 0.
    useCompareStore.getState().stopSlot(0)

    await waitFor(() => {
      const results = useCompareStore.getState().current?.results
      expect(results?.[0].status).toBe('stopped')
    })
    // Slot 1 completes on its own — the stop did not cancel it.
    await waitFor(() => {
      const results = useCompareStore.getState().current?.results
      expect(results?.[1].status).toBe('complete')
      expect(results?.[1].content).toContain('Side B finished')
    })

    useCompareStore.getState().clearCurrent()
  })

  it('one side failing never erases the other side\'s result', async () => {
    setDemoStreamForTests((slotIndex, handlers) => {
      if (slotIndex === 0) {
        handlers.onError({ code: 'provider_error', message: 'Slot A endpoint unreachable' })
        return Promise.resolve()
      }
      handlers.onDelta('Slot B content that must survive.')
      handlers.onDone('complete')
      return Promise.resolve()
    })

    useCompareStore.getState().startComparison({
      prompt: 'compare prompt',
      slots: makeSlots(),
      contextBlock: '',
      history: [],
    })

    await waitFor(() => {
      const results = useCompareStore.getState().current?.results
      expect(results?.[0].status).toBe('error')
      expect(results?.[0].error).toContain('unreachable')
      expect(results?.[1].status).toBe('complete')
      expect(results?.[1].content).toContain('must survive')
    })

    useCompareStore.getState().clearCurrent()
  })

  it('saved comparison records contain no credentials', async () => {
    setDemoStreamForTests((_slotIndex, handlers) => {
      handlers.onDelta('done text')
      handlers.onDone('complete')
      return Promise.resolve()
    })

    useCompareStore.getState().startComparison({
      prompt: 'credential-free prompt',
      slots: makeSlots(),
      contextBlock: '',
      history: [],
    })

    await waitFor(() => {
      expect(useCompareStore.getState().history).toHaveLength(1)
    })

    const persisted = localStorage.getItem('universe:compare:v1') ?? ''
    expect(persisted).not.toContain('apiKey')
    expect(persisted).not.toContain('sk-')
    expect(persisted).toContain('credential-free prompt')

    useCompareStore.getState().clearCurrent()
  })

  it('continuing a result in chat preserves the prompt and provenance', async () => {
    setDemoStreamForTests((_slotIndex, handlers) => {
      handlers.onDelta('The answer is 42.')
      handlers.onDone('complete')
      return Promise.resolve()
    })

    useCompareStore.getState().startComparison({
      prompt: 'meaning of life?',
      slots: makeSlots(),
      contextBlock: '',
      history: [],
    })
    await waitFor(() => {
      expect(useCompareStore.getState().current?.results[0].status).toBe('complete')
    })

    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Compare models' }))

    // The current run renders; continue its first result in chat.
    await user.click(screen.getAllByRole('button', { name: /Continue in chat/ })[0])

    await waitFor(() =>
      expect(useAppStore.getState().activeConversationId).toBeTruthy(),
    )
    const conversationId = useAppStore.getState().activeConversationId!
    const conversation = useAppStore.getState().conversations[conversationId]
    const userMessage = Object.values(conversation.nodes).find((node) => node.role === 'user')
    const assistantMessage = Object.values(conversation.nodes).find(
      (node) => node.role === 'assistant',
    )
    expect(userMessage?.content).toBe('meaning of life?')
    expect(assistantMessage?.content).toContain('The answer is 42.')
    expect(assistantMessage?.statusPrefix).toContain('Continued from a comparison')
  })

  it('saving a result to Canvas creates a versioned model-output document', async () => {
    setDemoStreamForTests((_slotIndex, handlers) => {
      handlers.onDelta('Saved comparison body.')
      handlers.onDone('complete')
      return Promise.resolve()
    })
    useCompareStore.getState().startComparison({
      prompt: 'canvas save prompt',
      slots: makeSlots(),
      contextBlock: '',
      history: [],
    })
    await waitFor(() => {
      expect(useCompareStore.getState().current?.results[0].status).toBe('complete')
    })

    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Compare models' }))
    await user.click(screen.getAllByRole('button', { name: /Save to Canvas/ })[0])

    const artifacts = Object.values(useLibraryStore.getState().artifacts)
    const saved = artifacts.find((artifact) =>
      artifact.markdown.includes('Saved comparison body.'),
    )
    expect(saved).toBeTruthy()
    expect(saved?.provenance).toBe('model-output')
    expect(saved?.versions).toHaveLength(1)

    useCompareStore.getState().clearCurrent()
  })

  it('shows the charge warning when a live model is selected', async () => {
    const user = userEvent.setup()
    renderApp('/')

    // Simulate a connected credential for the demo provider.
    useAppStore.setState((state) => ({
      credentials: {
        ...state.credentials,
        'provider-demo-balanced': {
          providerId: 'provider-demo-balanced',
          apiKey: 'sk-test',
          status: 'connected',
          lastCheckedAt: Date.now(),
          lastError: null,
          discoveredModels: [],
        },
      },
    }))

    await user.click(screen.getByRole('button', { name: 'Compare models' }))
    await user.selectOptions(
      screen.getByLabelText('Model A selection'),
      'provider-demo-balanced::demo-pro',
    )
    await user.selectOptions(
      screen.getByLabelText('Model B selection'),
      'provider-demo-anthropic-style::demo-chat-s',
    )

    expect(
      await screen.findByText(/sends up to two requests and may incur both providers/i),
    ).toBeInTheDocument()

    // Restore state for other tests.
    useAppStore.setState((state) => {
      const credentials = { ...state.credentials }
      delete credentials['provider-demo-balanced']
      return { credentials }
    })
  })
})
