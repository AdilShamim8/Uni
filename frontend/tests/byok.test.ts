import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, setupAppTest } from './helpers'
import { useAppStore } from '@/state/store'
import type { ProviderProfile } from '@/domain/types'
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
} from '@/services/storage/credentials'
import {
  modelsListUrl,
  testProviderConnection,
} from '@/services/connection/providerConnection'
import { createLiveAdapter } from '@/services/live/liveChatAdapter'
import type { ChatStreamHandlers } from '@/domain/chatAdapter'

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const CREDENTIALS_KEY = 'universe:credentials:v1'

function sseResponse(chunks: string[], status = 200): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new Response(stream, { status, headers: { 'Content-Type': 'text/event-stream' } })
}

const profile: ProviderProfile = {
  id: 'provider-test',
  label: 'Test Provider',
  kind: 'openai-compatible',
  endpointUrl: 'https://api.test.example/v1',
  demo: false,
  models: [],
}

const anthropicProfile: ProviderProfile = {
  ...profile,
  id: 'provider-anthropic',
  label: 'Anthropic Test',
  kind: 'anthropic',
  endpointUrl: 'https://api.anthropic.test',
}

function makeHandlers(): ChatStreamHandlers & {
  deltas: string[]
  started: string[]
  done: string[]
  errors: string[]
} {
  const deltas: string[] = []
  const started: string[] = []
  const done: string[] = []
  const errors: string[] = []
  return {
    deltas,
    started,
    done,
    errors,
    onStart: (draft) => started.push(draft.statusPrefix ?? ''),
    onDelta: (text) => deltas.push(text),
    onDone: (reason) => done.push(reason),
    onError: (error) => errors.push(`${error.code}: ${error.message}`),
  }
}

/* ------------------------------------------------------------------ */
/* Credential storage                                                  */
/* ------------------------------------------------------------------ */

describe('credential storage', () => {
  beforeEach(() => {
    localStorage.removeItem(CREDENTIALS_KEY)
  })

  it('round-trips credentials under its own private key', () => {
    saveCredentials({
      'provider-a': {
        providerId: 'provider-a',
        apiKey: 'sk-test',
        status: 'connected',
        lastCheckedAt: 123,
        lastError: null,
        discoveredModels: ['m1'],
      },
    })
    expect(localStorage.getItem(CREDENTIALS_KEY)).toContain('sk-test')
    expect(loadCredentials()['provider-a']?.apiKey).toBe('sk-test')
  })

  it('quarantines malformed entries instead of failing the load', () => {
    localStorage.setItem(
      CREDENTIALS_KEY,
      JSON.stringify({
        good: {
          providerId: 'good',
          apiKey: 'k',
          status: 'connected',
          lastCheckedAt: null,
          lastError: null,
          discoveredModels: [],
        },
        bad: { providerId: 'bad', apiKey: 42 },
        worse: 'not-even-an-object',
      }),
    )
    const loaded = loadCredentials()
    expect(Object.keys(loaded)).toEqual(['good'])
  })

  it('returns empty state for missing or corrupt payloads', () => {
    expect(loadCredentials()).toEqual({})
    localStorage.setItem(CREDENTIALS_KEY, '{not json')
    expect(loadCredentials()).toEqual({})
  })

  it('clears every credential', () => {
    saveCredentials({
      'provider-a': {
        providerId: 'provider-a',
        apiKey: 'sk-test',
        status: 'connected',
        lastCheckedAt: 1,
        lastError: null,
        discoveredModels: [],
      },
    })
    clearCredentials()
    expect(localStorage.getItem(CREDENTIALS_KEY)).toBeNull()
    expect(loadCredentials()).toEqual({})
  })
})

/* ------------------------------------------------------------------ */
/* Connection testing                                                  */
/* ------------------------------------------------------------------ */

describe('provider connection testing', () => {
  it('builds the right model-list URL per protocol', () => {
    expect(modelsListUrl(profile)).toBe('https://api.test.example/v1/models')
    expect(modelsListUrl({ ...profile, endpointUrl: 'https://api.test.example/v1/' })).toBe(
      'https://api.test.example/v1/models',
    )
    expect(modelsListUrl(anthropicProfile)).toBe('https://api.anthropic.test/v1/models')
    expect(modelsListUrl({ ...anthropicProfile, endpointUrl: 'https://api.anthropic.test/v1' })).toBe(
      'https://api.anthropic.test/v1/models',
    )
  })

  it('rejects an empty key before touching the network', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const result = await testProviderConnection(profile, '   ')
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Enter an API key first.')
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('rejects malformed endpoint URLs without fetching', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const result = await testProviderConnection(
      { ...profile, endpointUrl: 'not-a-url' },
      'sk-key',
    )
    expect(result.ok).toBe(false)
    expect(result.message).toContain('endpoint URL is not valid')
    vi.unstubAllGlobals()
  })

  it('reports success with latency and sorted discovered models', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'zeta' }, { id: 'alpha' }] }), {
        status: 200,
      }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await testProviderConnection(profile, 'sk-key')

    expect(result.ok).toBe(true)
    expect(result.models).toEqual(['alpha', 'zeta'])
    expect(result.message).toMatch(/Connected in \d+ms — 2 models available\./)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.test.example/v1/models',
      expect.objectContaining({ headers: { Authorization: 'Bearer sk-key' } }),
    )
    vi.unstubAllGlobals()
  })

  it('uses Anthropic headers for Anthropic providers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await testProviderConnection(anthropicProfile, 'ant-key')

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.test/v1/models')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('ant-key')
    expect(headers['anthropic-version']).toBe('2023-06-01')
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    vi.unstubAllGlobals()
  })

  it('translates HTTP failures into honest diagnostics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad key', { status: 401 })))
    const unauthorized = await testProviderConnection(profile, 'sk-key')
    expect(unauthorized.ok).toBe(false)
    expect(unauthorized.message).toContain('401 Unauthorized')
    vi.unstubAllGlobals()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })))
    const notFound = await testProviderConnection(profile, 'sk-key')
    expect(notFound.message).toContain('404 Not found')
    vi.unstubAllGlobals()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('slow down', { status: 429 })))
    const limited = await testProviderConnection(profile, 'sk-key')
    expect(limited.message).toContain('429 Rate limited')
    vi.unstubAllGlobals()
  })

  it('explains browser-level network failures (CORS, offline)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const result = await testProviderConnection(profile, 'sk-key')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Could not reach the endpoint from this browser')
    vi.unstubAllGlobals()
  })
})

/* ------------------------------------------------------------------ */
/* Live adapter                                                        */
/* ------------------------------------------------------------------ */

describe('live chat adapter', () => {
  it('streams OpenAI-compatible SSE deltas to completion', async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":" there"}}]}\n\n',
      'data: [DONE]\n\n',
    ]
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(chunks))
    vi.stubGlobal('fetch', fetchMock)
    const handlers = makeHandlers()
    const adapter = createLiveAdapter(profile, 'sk-key', 'test-model')

    await adapter.stream(
      { prompt: 'hi', history: [], tools: [], attachments: [], nickname: '', traits: '' },
      handlers,
      new AbortController().signal,
    )

    expect(handlers.deltas).toEqual(['Hello', ' there'])
    expect(handlers.started[0]).toContain('Live reply from Test Provider')
    expect(handlers.done).toEqual(['complete'])
    expect(handlers.errors).toEqual([])

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.test.example/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-key')
    const body = JSON.parse(init.body as string) as { model: string; messages: unknown[] }
    expect(body.model).toBe('test-model')
    vi.unstubAllGlobals()
  })

  it('streams Anthropic SSE events with the native protocol', async () => {
    const chunks = [
      'data: {"type":"message_start"}\n\n',
      'data: {"type":"content_block_delta","delta":{"text":"Bonjour"}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ]
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(chunks))
    vi.stubGlobal('fetch', fetchMock)
    const handlers = makeHandlers()
    const adapter = createLiveAdapter(anthropicProfile, 'ant-key', 'claude-test')

    await adapter.stream(
      { prompt: 'hi', history: [], tools: [], attachments: [], nickname: '', traits: '' },
      handlers,
      new AbortController().signal,
    )

    expect(handlers.deltas).toEqual(['Bonjour'])
    expect(handlers.done).toEqual(['complete'])

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://api.anthropic.test/v1/messages')
    const headers = init.headers as Record<string, string>
    expect(headers['x-api-key']).toBe('ant-key')
    vi.unstubAllGlobals()
  })

  it('sends conversation history and persona context', async () => {
    const fetchMock = vi.fn().mockResolvedValue(sseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\n\n']))
    vi.stubGlobal('fetch', fetchMock)
    const handlers = makeHandlers()
    const adapter = createLiveAdapter(profile, 'sk-key', 'test-model')

    await adapter.stream(
      {
        prompt: 'new question',
        history: [{ role: 'user', content: 'old question' }, { role: 'assistant', content: 'old answer' }],
        tools: [],
        attachments: [{ id: 'a1', name: 'notes.txt', size: 12, kind: 'file', mediaType: 'text/plain' }],
        nickname: 'Ada',
        traits: 'Be concise',
      },
      handlers,
      new AbortController().signal,
    )

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string) as {
      messages: Array<{ role: string; content: string }>
    }
    expect(body.messages.map((m) => `${m.role}:${m.content}`)).toEqual([
      'system:You are Universe, a helpful assistant. Address the user as Ada. Persona notes: Be concise. The user attached these files (names only, contents are not available in this build): notes.txt.',
      'user:old question',
      'assistant:old answer',
      'user:new question',
    ])
    vi.unstubAllGlobals()
  })

  it('surfaces a rejected key as a provider error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('invalid', { status: 401 })))
    const handlers = makeHandlers()
    const adapter = createLiveAdapter(profile, 'sk-key', 'test-model')

    await adapter.stream(
      { prompt: 'hi', history: [], tools: [], attachments: [], nickname: '', traits: '' },
      handlers,
      new AbortController().signal,
    )

    expect(handlers.errors).toHaveLength(1)
    expect(handlers.errors[0]).toContain('provider_error')
    expect(handlers.errors[0]).toContain('401 Unauthorized')
    expect(handlers.done).toEqual([])
    vi.unstubAllGlobals()
  })

  it('treats a pre-aborted signal as a clean stop', async () => {
    const abortError = new DOMException('Aborted', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError))
    const handlers = makeHandlers()
    const adapter = createLiveAdapter(profile, 'sk-key', 'test-model')
    const controller = new AbortController()
    controller.abort()

    await adapter.stream(
      { prompt: 'hi', history: [], tools: [], attachments: [], nickname: '', traits: '' },
      handlers,
      controller.signal,
    )

    expect(handlers.done).toEqual(['stopped'])
    expect(handlers.errors).toEqual([])
    vi.unstubAllGlobals()
  })
})

/* ------------------------------------------------------------------ */
/* Store routing                                                       */
/* ------------------------------------------------------------------ */

setupAppTest()

describe('live routing through the store', () => {
  it('streams from the connected endpoint when the active provider has a key', async () => {
    const { providers, activeProviderId } = useAppStore.getState()
    const activeProvider = providers.find((p) => p.id === activeProviderId)
    expect(activeProvider).toBeDefined()

    useAppStore.getState().setCredential(activeProvider!.id, {
      providerId: activeProvider!.id,
      apiKey: 'k-live',
      status: 'connected',
      lastCheckedAt: Date.now(),
      lastError: null,
      discoveredModels: [useAppStore.getState().activeModelId ?? 'demo-pro'],
    })

    const fetchMock = vi.fn().mockResolvedValue(
      sseResponse([
        'data: {"choices":[{"delta":{"content":"Live "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"hello!"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    )
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    renderApp('/')
    await user.type(screen.getByLabelText('Message Universe'), 'anybody out there')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByText('Live hello!')).toBeInTheDocument()

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${activeProvider!.endpointUrl}/chat/completions`)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k-live')
    const body = JSON.parse(init.body as string) as { model: string }
    expect(body.model).toBe(useAppStore.getState().activeModelId)

    // The private credential never leaks into the exported app data.
    const exported = JSON.parse(useAppStore.getState().exportAllData()) as {
      credentials?: unknown
    }
    expect(exported.credentials).toBeUndefined()
    vi.unstubAllGlobals()
  })

  it('keeps using the local demo adapter when no key is connected', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const user = userEvent.setup()
    renderApp('/')
    await user.type(screen.getByLabelText('Message Universe'), 'Help me brainstorm ideas')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByText(/Start with the smallest useful slice/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
