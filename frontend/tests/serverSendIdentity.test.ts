import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  useServerSessionStore,
  type ServerConversationDetail,
} from '@/state/serverSessionStore'
import type { ServerProvider } from '@/services/api/serverProviders'
import {
  beginServerSend,
  clearServerSends,
  completeServerSend,
  retryOnNetworkFailure,
} from '@/services/api/sendIdentity'

/**
 * N019 — persistent client send identity. ONE operation id per logical
 * send, reused across automatic network retries, a manual re-press
 * after failure, and a full page reload (localStorage survives it). It
 * is the node clientId AND (`run-<opId>`) the run idempotency key, so
 * the server's N016–N018 idempotency semantics protect the real
 * browser send path. The first three tests DISCRIMINATE against the
 * pre-fix code (fresh `send-<Date.now()>` ids, no auto-retry): run
 * against it they fail; the rest pin lifecycle rules the fix must keep.
 */

const ME = {
  user: { id: 'u-1', email: 'alice@example.test', name: 'Alice', createdAt: 1 },
  workspace: { id: 'w-1', name: 'Personal workspace', role: 'owner' },
}

const CONVERSATION: ServerConversationDetail = {
  id: 'c-1',
  title: 'Server chat',
  agentId: null,
  pinned: false,
  archived: false,
  activeLeafId: 'n-2',
  createdAt: 1,
  updatedAt: 2,
  messageCount: 2,
  nodes: [
    { id: 'n-1', parentId: null, role: 'user', status: 'complete', content: 'Hello', createdAt: 1, feedback: null },
    { id: 'n-2', parentId: 'n-1', role: 'assistant', status: 'complete', content: 'Hi', createdAt: 2, feedback: null },
  ],
}

const PROVIDER: ServerProvider = {
  id: 'sp-1',
  label: 'xAI',
  kind: 'openai-compatible',
  endpointUrl: 'https://api.example.test/v1',
  authMode: 'bearer',
  modelId: 'grok-test',
  models: ['grok-test'],
  credential: { present: true, keyId: 'key-1', status: 'connected', lastCheckedAt: null, lastError: null },
  createdAt: 1,
  updatedAt: 1,
}

interface RecordedCall {
  url: string
  method: string
  body: Record<string, unknown>
}

/** Route-based fetch mock with a scriptable node/run behavior. */
function createFetchMock(behavior: {
  /** Returning undefined falls through to the default success response. */
  nodeRespond?: (attempt: number, call: RecordedCall) => Response | Promise<Response> | undefined
  runRespond?: (attempt: number, call: RecordedCall) => Response | Promise<Response> | undefined
}) {
  const calls: RecordedCall[] = []
  let nodeAttempts = 0
  let runAttempts = 0
  const jsonResponse = (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input)
    const method = init?.method ?? 'GET'
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {}
    const call: RecordedCall = { url, method, body }
    calls.push(call)

    if (/\/api\/v1\/auth\//.test(url)) return jsonResponse(200, ME)
    if (/\/api\/v1\/conversations\/c-1\/nodes$/.test(url) && method === 'POST') {
      nodeAttempts += 1
      const scripted = behavior.nodeRespond?.(nodeAttempts, call)
      if (scripted !== undefined) return scripted
      return jsonResponse(201, {
            node: {
              id: 'n-user-1',
              parentId: 'n-2',
              role: 'user',
              status: 'complete',
              content: String(body.content ?? ''),
              createdAt: 3,
              feedback: null,
            },
            conversation: CONVERSATION,
            reused: false,
          })
    }
    if (/\/api\/v1\/conversations\/c-1\/runs$/.test(url) && method === 'POST') {
      runAttempts += 1
      const scripted = behavior.runRespond?.(runAttempts, call)
      if (scripted !== undefined) return scripted
      return jsonResponse(201, {
            run: {
              id: 'run-1',
              conversationId: 'c-1',
              parentNodeId: 'n-user-1',
              providerId: 'sp-1',
              providerKind: 'openai-compatible',
              providerEndpoint: 'https://api.example.test/v1',
              modelId: 'grok-test',
              status: 'complete',
              outputText: 'answer',
              usage: null,
              errorCode: null,
              errorMessage: null,
              createdAt: 3,
              updatedAt: 3,
              terminalAt: 3,
            },
            events: [
              {
                eventId: 'run-1:1',
                runId: 'run-1',
                sequence: 1,
                type: 'terminal',
                timestamp: 3,
                payload: { status: 'complete' },
              },
            ],
            reused: false,
          })
    }
    if (/\/api\/v1\/runs\/run-1\/events/.test(url)) {
      return new Response(
        'data: ' +
          JSON.stringify({
            eventId: 'run-1:1',
            runId: 'run-1',
            sequence: 1,
            type: 'terminal',
            timestamp: 3,
            payload: { status: 'complete' },
          }) +
          '\n\n',
        { status: 200, headers: { 'content-type': 'text/event-stream' } },
      )
    }
    if (/\/api\/v1\/conversations$/.test(url)) return jsonResponse(200, { items: [CONVERSATION] })
    if (/\/api\/v1\/conversations\/c-1$/.test(url)) return jsonResponse(200, CONVERSATION)
    if (/\/api\/v1\/providers/.test(url)) return jsonResponse(200, { items: [PROVIDER] })
    return jsonResponse(200, { items: [] })
  })

  return {
    fetchMock,
    calls,
    nodeAttempts: () => nodeAttempts,
    runAttempts: () => runAttempts,
  }
}

function networkError(): Promise<Response> {
  return Promise.reject(new TypeError('Failed to fetch'))
}

/** Signed-in store state with the conversation open and a destination. */
function seedSignedInSession(): void {
  useServerSessionStore.setState({
    status: 'signed-in',
    account: ME,
    openConversationId: 'c-1',
    openConversation: CONVERSATION,
    serverProviders: [PROVIDER],
    serverSelection: { providerId: 'sp-1', modelId: 'grok-test' },
    activeRun: null,
    runError: null,
  })
}

function nodeCalls(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => /\/nodes$/.test(call.url) && call.method === 'POST')
}

function runCalls(calls: RecordedCall[]): RecordedCall[] {
  return calls.filter((call) => /\/runs$/.test(call.url) && call.method === 'POST')
}

beforeEach(() => {
  localStorage.clear()
  useServerSessionStore.getState().resetForTests()
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
  localStorage.clear()
  useServerSessionStore.getState().resetForTests()
  vi.unstubAllGlobals()
})

describe('N019 persistent client send identity — discriminating retry/reload reuse', () => {
  it('re-pressing Send after a network failure reuses the SAME clientId and run key', async () => {
    // Deterministic time: pre-fix ids embed Date.now(), so advancing the
    // clock between sends makes pre-fix ids provably different.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-04T10:00:00Z'))
    const mock = createFetchMock({ nodeRespond: () => networkError() })
    vi.stubGlobal('fetch', mock.fetchMock)
    seedSignedInSession()

    const firstSend = useServerSessionStore.getState().sendServerMessage('Retry me')
    await vi.advanceTimersByTimeAsync(2000) // let the 2 network retries fire
    expect(await firstSend).toBe(false)
    expect(mock.nodeAttempts()).toBe(3) // 1 try + 2 network retries

    vi.setSystemTime(new Date('2026-11-04T10:00:05Z'))
    const secondSend = useServerSessionStore.getState().sendServerMessage('Retry me')
    await vi.advanceTimersByTimeAsync(2000)
    expect(await secondSend).toBe(false)

    const ids = nodeCalls(mock.calls).map((call) => call.body.clientId)
    expect(ids.length).toBeGreaterThanOrEqual(2)
    expect(new Set(ids).size).toBe(1) // ONE operation id across both sends
  })

  it('survives a page reload: a resend of the same text replays the same operation', async () => {
    const mock = createFetchMock({ nodeRespond: () => networkError() })
    vi.stubGlobal('fetch', mock.fetchMock)
    seedSignedInSession()

    expect(await useServerSessionStore.getState().sendServerMessage('After reload')).toBe(false)
    const firstId = nodeCalls(mock.calls)[0].body.clientId

    // Simulate the reload: in-memory store state is rebuilt (only
    // localStorage crosses a reload), then the same text is re-sent.
    useServerSessionStore.getState().resetForTests()
    seedSignedInSession()
    expect(await useServerSessionStore.getState().sendServerMessage('After reload')).toBe(false)

    const ids = nodeCalls(mock.calls).map((call) => call.body.clientId)
    expect(new Set(ids).size).toBe(1)
    expect(ids[0]).toBe(firstId)
  })

  it('retries the node create on network failure and every attempt carries the same clientId', async () => {
    vi.useFakeTimers()
    // Attempts 1 and 2 reject at the transport; attempt 3 falls through
    // to the default created-node response.
    const mock = createFetchMock({
      nodeRespond: (attempt) => (attempt <= 2 ? networkError() : undefined),
    })
    vi.stubGlobal('fetch', mock.fetchMock)
    seedSignedInSession()

    const sendPromise = useServerSessionStore.getState().sendServerMessage('Auto retry')
    // Advance through the backoff sleeps so the retries actually fire.
    await vi.advanceTimersByTimeAsync(2000)
    const result = await sendPromise
    expect(result).toBe(true)
    expect(mock.nodeAttempts()).toBe(3)
    const ids = nodeCalls(mock.calls).map((call) => call.body.clientId)
    expect(new Set(ids).size).toBe(1)
    // The run rides the SAME operation: key is run-<clientId>.
    const run = runCalls(mock.calls)[0]
    expect(run.body.idempotencyKey).toBe(`run-${ids[0]}`)
  })
})

describe('N019 lifecycle rules (guard tests)', () => {
  it('a SUCCESSFUL send completes the identity: resending the same text starts a fresh operation', async () => {
    const mock = createFetchMock({})
    vi.stubGlobal('fetch', mock.fetchMock)
    seedSignedInSession()

    expect(await useServerSessionStore.getState().sendServerMessage('Hello')).toBe(true)
    const firstId = nodeCalls(mock.calls)[0].body.clientId

    expect(await useServerSessionStore.getState().sendServerMessage('Hello')).toBe(true)
    const secondId = nodeCalls(mock.calls)[1].body.clientId
    expect(secondId).not.toBe(firstId)
    expect(runCalls(mock.calls)[1].body.idempotencyKey).toBe(`run-${secondId}`)
  })

  it('different content supersedes the pending identity', async () => {
    const mock = createFetchMock({ nodeRespond: () => networkError() })
    vi.stubGlobal('fetch', mock.fetchMock)
    seedSignedInSession()

    expect(await useServerSessionStore.getState().sendServerMessage('first draft')).toBe(false)
    expect(await useServerSessionStore.getState().sendServerMessage('edited draft')).toBe(false)

    const ids = nodeCalls(mock.calls).map((call) => call.body.clientId)
    expect(new Set(ids).size).toBe(2)
  })

  it('an HTTP error is answered by the server: NO automatic retry, but a re-press reuses the id', async () => {
    const mock = createFetchMock({
      nodeRespond: () =>
        new Response(JSON.stringify({ code: 'INTERNAL', message: 'boom', requestId: 'r-1' }), {
          status: 500,
          headers: { 'content-type': 'application/json' },
        }),
    })
    vi.stubGlobal('fetch', mock.fetchMock)
    seedSignedInSession()

    expect(await useServerSessionStore.getState().sendServerMessage('Server said no')).toBe(false)
    expect(mock.nodeAttempts()).toBe(1) // ApiError never auto-retries

    expect(await useServerSessionStore.getState().sendServerMessage('Server said no')).toBe(false)
    const ids = nodeCalls(mock.calls).map((call) => call.body.clientId)
    expect(new Set(ids).size).toBe(1) // manual re-press still reuses it
  })

  it('signing out clears pending identities — the next session sends with fresh ids', async () => {
    const mock = createFetchMock({ nodeRespond: () => networkError() })
    vi.stubGlobal('fetch', mock.fetchMock)
    seedSignedInSession()

    expect(await useServerSessionStore.getState().sendServerMessage('Across accounts')).toBe(false)
    const firstId = nodeCalls(mock.calls)[0].body.clientId

    await useServerSessionStore.getState().signOut()
    seedSignedInSession()
    expect(await useServerSessionStore.getState().sendServerMessage('Across accounts')).toBe(false)

    const secondId = nodeCalls(mock.calls).at(-1)?.body.clientId
    expect(secondId).toBeTruthy()
    expect(secondId).not.toBe(firstId)
  })
})

describe('N019 send identity module', () => {
  it('expires pending records after 24 hours — an old retry is a new logical send', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-04T10:00:00Z'))
    const first = beginServerSend('w-1', 'c-1', 'stale')
    expect(beginServerSend('w-1', 'c-1', 'stale')).toBe(first)

    vi.setSystemTime(new Date('2026-11-05T11:00:00Z')) // > 24h later
    const after = beginServerSend('w-1', 'c-1', 'stale')
    expect(after).not.toBe(first)
  })

  it('scopes records to the workspace: another workspace never reuses them', () => {
    const first = beginServerSend('w-1', 'c-1', 'scoped')
    expect(beginServerSend('w-2', 'c-1', 'scoped')).not.toBe(first)
    expect(beginServerSend('w-1', 'c-1', 'scoped')).toBe(first)
  })

  it('completeServerSend clears only its own record; clearServerSends drops everything', () => {
    const op = beginServerSend('w-1', 'c-1', 'done')
    completeServerSend('w-1', 'c-1', 'someone-elses-op') // superseded: no-op
    expect(beginServerSend('w-1', 'c-1', 'done')).toBe(op)
    completeServerSend('w-1', 'c-1', op)
    expect(beginServerSend('w-1', 'c-1', 'done')).not.toBe(op)

    const kept = beginServerSend('w-1', 'c-2', 'kept')
    clearServerSends()
    expect(beginServerSend('w-1', 'c-2', 'kept')).not.toBe(kept)
  })

  it('retryOnNetworkFailure retries network rejections but never ApiError-shaped HTTP failures', async () => {
    let attempts = 0
    const networkThenSuccess = async (): Promise<string> => {
      attempts += 1
      if (attempts === 1) throw new TypeError('Failed to fetch')
      return 'ok'
    }
    await expect(retryOnNetworkFailure(networkThenSuccess, { attempts: 3 })).resolves.toBe('ok')
    expect(attempts).toBe(2)

    let httpAttempts = 0
    const httpFailure = async (): Promise<string> => {
      httpAttempts += 1
      const { ApiError } = await import('@/services/api/client')
      throw new ApiError({ code: 'RATE_LIMITED', message: 'slow down', requestId: 'r' }, 429)
    }
    await expect(retryOnNetworkFailure(httpFailure, { attempts: 3 })).rejects.toThrow('slow down')
    expect(httpAttempts).toBe(1)
  })
})
