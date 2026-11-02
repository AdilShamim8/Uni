import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useServerSessionStore } from '@/state/serverSessionStore'

/**
 * Session fencing (audit F07 / U009): a delayed response from account A
 * must never repopulate the store after sign-out, nor leak into account
 * B after a switch. All HTTP is mocked; deferred responses are settled
 * manually so each test controls exactly when a response lands
 * relative to the sign-out/switch.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Per-URL queues of waiters: when a request for a queued URL fires, the
 * waiter receives a `respond` function; the test later calls
 * `settle(body)` on its handle to answer that specific request. Other
 * URLs fall through to the default mock implementation.
 */
const deferred = new Map<string, Array<(respond: (body: unknown) => void) => void>>()
let fetchMock: ReturnType<typeof vi.fn>
let defaultHandler: (url: string) => Response

/** Hold the NEXT request for a URL substring until `settle(body)`. */
function holdResponse(urlPart: string): { settle: (body: unknown) => void } {
  let respond: (body: unknown) => void = () => undefined
  const queue = deferred.get(urlPart) ?? []
  queue.push((r) => {
    respond = r
  })
  deferred.set(urlPart, queue)
  return { settle: (body: unknown) => respond(body) }
}

beforeEach(() => {
  deferred.clear()
  defaultHandler = () => jsonResponse({ items: [] })
  fetchMock = vi.fn(async (input: unknown) => {
    const url = typeof input === 'string' ? input : String(input)
    for (const part of deferred.keys()) {
      if (!url.includes(part)) continue
      const waiter = deferred.get(part)!.shift()
      if (!waiter) continue
      return new Promise<Response>((resolve) => {
        waiter((body: unknown) => resolve(jsonResponse(body)))
      })
    }
    return defaultHandler(url)
  })
  vi.stubGlobal('fetch', fetchMock)
  useServerSessionStore.getState().resetForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Route defaults for a signed-in account. */
function stubAccount(id: string): void {
  defaultHandler = (url: string) => {
    if (url.includes('/api/auth/get-session')) {
      return jsonResponse({
        session: { token: 't' },
        user: { id, email: `${id}@test.example`, name: id.toUpperCase(), createdAt: 1 },
      })
    }
    if (url.includes('/api/v1/me')) {
      return jsonResponse({
        user: { id, email: `${id}@test.example`, name: id.toUpperCase(), createdAt: 1 },
        workspace: { id: `ws-${id}`, name: id.toUpperCase(), role: 'owner' },
      })
    }
    if (url.includes('/api/auth/sign-in/email')) return jsonResponse({ user: { id } })
    if (url.includes('/api/auth/sign-out')) return jsonResponse({ success: true })
    return jsonResponse({ items: [] })
  }
}

const chatSummary = (id: string) => ({
  id,
  title: `chat ${id}`,
  agentId: null,
  pinned: false,
  archived: false,
  activeLeafId: null,
  createdAt: 1,
  updatedAt: 1,
  messageCount: 1,
})

describe('serverSessionStore — stale async writes are fenced (F07)', () => {
  it('a delayed conversations response from account A cannot repopulate after sign-out', async () => {
    stubAccount('a')
    await useServerSessionStore.getState().signIn('a@test.example', 'pw')
    expect(useServerSessionStore.getState().status).toBe('signed-in')

    // A conversations request whose response is held back…
    const held = holdResponse('/api/v1/conversations')
    const loading = useServerSessionStore.getState().loadConversations()
    expect(useServerSessionStore.getState().conversationsLoading).toBe(true)

    // …sign-out completes while it is still in flight…
    await useServerSessionStore.getState().signOut()
    expect(useServerSessionStore.getState().status).toBe('signed-out')

    // …and only THEN does account A's response land.
    held.settle({ items: [chatSummary('old-account-chat')] })
    await loading

    const state = useServerSessionStore.getState()
    expect(state.status).toBe('signed-out')
    expect(state.conversations).toEqual([]) // A's chats did NOT repopulate
    expect(state.conversationsLoading).toBe(false)
  })

  it('a delayed providers response cannot repopulate after sign-out', async () => {
    stubAccount('a')
    await useServerSessionStore.getState().signIn('a@test.example', 'pw')

    const held = holdResponse('/api/v1/providers')
    const loading = useServerSessionStore.getState().loadServerProviders()
    await useServerSessionStore.getState().signOut()
    held.settle([
      {
        id: 'provider-a',
        label: 'A provider',
        kind: 'openai-compatible',
        endpointUrl: 'https://a.test/v1',
        modelId: 'm',
        models: [],
        credential: {
          present: true,
          keyId: 'key-1',
          status: 'connected',
          lastCheckedAt: 1,
          lastError: null,
        },
        createdAt: 1,
        updatedAt: 1,
      },
    ])
    await loading

    const state = useServerSessionStore.getState()
    expect(state.status).toBe('signed-out')
    expect(state.serverProviders).toEqual([]) // A's providers did NOT repopulate
  })

  it('an account switch discards the previous account’s in-flight conversations', async () => {
    stubAccount('a')
    await useServerSessionStore.getState().signIn('a@test.example', 'pw')
    expect(useServerSessionStore.getState().account?.user.id).toBe('a')

    // A's conversations request is held back…
    const heldA = holdResponse('/api/v1/conversations')
    const loadingA = useServerSessionStore.getState().loadConversations()

    // …account B signs in directly (no explicit sign-out)…
    stubAccount('b')
    await useServerSessionStore.getState().signIn('b@test.example', 'pw')
    expect(useServerSessionStore.getState().account?.user.id).toBe('b')

    // …and only then does A's response land.
    heldA.settle({ items: [chatSummary('a-chat')] })
    await loadingA

    const state = useServerSessionStore.getState()
    expect(state.account?.user.id).toBe('b')
    expect(state.conversations).toEqual([]) // A's chats never leaked into B's session
  })

  it('a stale conversation detail cannot hydrate after sign-out', async () => {
    stubAccount('a')
    await useServerSessionStore.getState().signIn('a@test.example', 'pw')

    const held = holdResponse('/api/v1/conversations/conv-1')
    const opening = useServerSessionStore.getState().openServerConversation('conv-1')
    await useServerSessionStore.getState().signOut()
    held.settle({ id: 'conv-1', title: 'A chat', agentId: null, pinned: false, archived: false, activeLeafId: null, createdAt: 1, updatedAt: 1, messageCount: 1, nodes: [] })
    await opening

    const state = useServerSessionStore.getState()
    expect(state.status).toBe('signed-out')
    expect(state.openConversation).toBeNull()
    expect(state.openConversationId).toBeNull()
  })
})
