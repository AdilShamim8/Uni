import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AccountSection } from '@/features/settings/AccountSection'
import { useServerSessionStore } from '@/state/serverSessionStore'

/**
 * B02 frontend integration: the Account section drives the real API
 * surface (mocked fetch with the exact backend routes) — sign-in/out
 * with session hydration, deliberate two-step import, and the
 * reload-safe read-only server conversation list.
 */

const USER = { id: 'u-1', email: 'alice@example.test', name: 'Alice', createdAt: 1_700_000_000_000 }
const ME = {
  user: USER,
  workspace: { id: 'w-1', name: 'Personal workspace', role: 'owner' },
}
const CONVERSATIONS = [
  {
    id: 'c-1',
    title: 'Server chat one',
    agentId: null,
    pinned: false,
    archived: false,
    activeLeafId: 'n-2',
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_010_000,
    messageCount: 2,
  },
]
const CONVERSATION_DETAIL = {
  ...CONVERSATIONS[0],
  nodes: [
    { id: 'n-1', parentId: null, role: 'user', status: 'complete', content: 'Hello server', createdAt: 1, feedback: null },
    { id: 'n-2', parentId: 'n-1', role: 'assistant', status: 'complete', content: 'Hi from the server', createdAt: 2, feedback: null },
    { id: 'n-3', parentId: 'n-1', role: 'assistant', status: 'stopped', content: 'Older branch', createdAt: 3, feedback: null },
  ],
}

const BACKUP = {
  kind: 'uni-workspace-backup',
  version: 1,
  savedAt: 1_700_000_000_000,
  payload: { app: { version: 1, savedAt: 1, conversations: [], preferences: {}, providers: [] } },
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Route-based fetch mock mirroring the real backend surface. */
function createFetchMock() {
  const state = {
    sessionUser: null as typeof USER | null,
    providers: [] as Array<Record<string, unknown>>,
    conversationDetail: structuredClone(CONVERSATION_DETAIL),
  }
  const calls: Array<{ url: string; method: string; body?: unknown }> = []

  const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const path = String(url)
    const method = init?.method ?? 'GET'
    let body: unknown
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body)
      } catch {
        body = init.body
      }
    }
    calls.push({ url: path, method, body })

    if (path === '/api/auth/get-session') {
      return jsonResponse(200, state.sessionUser ? { session: { token: 't' }, user: state.sessionUser } : null)
    }
    if (path === '/api/auth/sign-in/email' && method === 'POST') {
      const payload = body as { email?: string; password?: string }
      if (payload.password === 'password-123') {
        state.sessionUser = USER
        return jsonResponse(200, { user: USER })
      }
      return jsonResponse(401, { code: 'invalid_email_or_password', message: 'Email or password is incorrect.', requestId: 'r-1' })
    }
    if (path === '/api/auth/sign-up/email' && method === 'POST') {
      state.sessionUser = USER
      return jsonResponse(200, { user: USER })
    }
    if (path === '/api/auth/sign-out' && method === 'POST') {
      state.sessionUser = null
      return jsonResponse(200, { success: true })
    }
    if (path === '/api/v1/me') {
      if (!state.sessionUser) return jsonResponse(401, { code: 'unauthorized', message: 'Sign in to use the API.', requestId: 'r-2' })
      return jsonResponse(200, ME)
    }
    if (path === '/api/v1/conversations' && method === 'GET') {
      return jsonResponse(200, { items: CONVERSATIONS, nextCursor: null })
    }
    if (path === '/api/v1/conversations/c-1') {
      return jsonResponse(200, CONVERSATION_DETAIL)
    }
    if (path === '/api/v1/import/preview' && method === 'POST') {
      return jsonResponse(200, {
        checksum: 'a'.repeat(64),
        counts: { conversations: 2, messages: 5, skippedTemporary: 1 },
        errors: [],
        unsupported: ['agents', 'work', 'library', 'context', 'plugins', 'preferences'],
      })
    }
    if (path === '/api/v1/import/commit' && method === 'POST') {
      return jsonResponse(200, {
        batchId: 'b-1',
        imported: { conversations: 2, messages: 5 },
        skippedTemporary: 1,
        unsupported: ['agents', 'work'],
        idempotentReplay: false,
        conversationIdMap: { 'local-1': 'c-2', 'local-2': 'c-3' },
      })
    }
    if (path === '/api/v1/providers') {
      if (!state.sessionUser) return jsonResponse(401, { code: 'unauthorized', message: 'Sign in to use the API.', requestId: 'r-3' })
      // The real backend returns a page-shaped envelope.
      if (method === 'GET') return jsonResponse(200, { items: state.providers })
      if (method === 'POST') {
        const payload = body as { label?: string; kind?: string; endpointUrl?: string; modelId?: string; authMode?: string }
        const provider = {
          id: `sp-${state.providers.length + 1}`,
          label: payload.label ?? '',
          kind: payload.kind ?? 'openai-compatible',
          authMode: payload.authMode ?? 'none',
          endpointUrl: payload.endpointUrl ?? '',
          // Real backend: no model until the user sets one or discovery
          // persists the endpoint's list.
          modelId: payload.modelId ?? null,
          models: [] as string[],
          credential: { present: false, keyId: null, status: 'untested', lastCheckedAt: null, lastError: null },
          createdAt: 5,
          updatedAt: 5,
        }
        state.providers.push(provider)
        return jsonResponse(201, provider)
      }
    }
    if (/^\/api\/v1\/providers\/(sp-\d+)$/.test(path) && method === 'DELETE') {
      const id = (path.match(/(sp-\d+)$/) ?? [])[1] ?? ''
      const index = state.providers.findIndex((provider) => provider.id === id)
      if (index >= 0) state.providers.splice(index, 1)
      return new Response(null, { status: 204 })
    }
    if (/^\/api\/v1\/providers\/(sp-\d+)$/.test(path) && method === 'PATCH') {
      // Manual model setup (N010): PATCH persists the exact model id on
      // the provider row without touching the discovered catalog.
      const id = (path.match(/(sp-\d+)$/) ?? [])[1] ?? ''
      const provider = state.providers.find((entry) => entry.id === id)
      if (!provider) return jsonResponse(404, { code: 'not_found', message: 'Provider not found.', requestId: 'r-5' })
      const payload = body as { modelId?: string }
      if (typeof payload.modelId === 'string' && payload.modelId.length > 0) {
        provider.modelId = payload.modelId
      }
      provider.updatedAt = 50
      return jsonResponse(200, provider)
    }
    if (/^\/api\/v1\/providers\/(sp-\d+)\/credential$/.test(path) && method === 'PUT') {
      const id = (path.match(/(sp-\d+)\/credential$/) ?? [])[1] ?? ''
      const provider = state.providers.find((entry) => entry.id === id)
      if (!provider) return jsonResponse(404, { code: 'not_found', message: 'Provider not found.', requestId: 'r-4' })
      provider.credential = { present: true, keyId: 'key-1', status: 'untested', lastCheckedAt: null, lastError: null }
      provider.authMode = 'bearer'
      return jsonResponse(200, provider)
    }
    if (/^\/api\/v1\/providers\/(sp-\d+)\/models$/.test(path) && method === 'POST') {
      // The discovery route the Test button uses: tests the key AND
      // persists the discovered models on the provider row.
      const id = (path.match(/(sp-\d+)\/models$/) ?? [])[1] ?? ''
      const provider = (state.providers.find((entry) => entry.id === id) ?? state.providers[0]) as {
        id: string
        label: string
        models: string[]
        credential: { present: boolean; keyId: string | null; status: string; lastCheckedAt: number | null; lastError: string | null }
      }
      if (!provider.credential.present) {
        return jsonResponse(200, {
          ok: false,
          message: 'No API key stored for this provider yet.',
          latencyMs: null,
          discoveredModels: null,
          readiness: { reachability: 'unknown', catalog: 'unknown', credential: 'unknown', generation: 'unknown' },
        })
      }
      const discovered = provider.id === 'sp-1' ? ['grok-3-mini', 'grok-4'] : ['model-b-one', 'model-b-two']
      provider.models = discovered
      provider.credential = { ...provider.credential, status: 'connected', lastCheckedAt: 99, lastError: null }
      return jsonResponse(200, {
        ok: true,
        message: 'Connected — the key works.',
        latencyMs: 42,
        discoveredModels: discovered,
        readiness: { reachability: 'ok', catalog: 'ok', credential: 'ok', generation: 'unknown' },
      })
    }
    if (path === '/api/v1/conversations' && method === 'POST') {
      // A brand-new conversation with no nodes yet.
      return jsonResponse(201, {
        id: 'c-9',
        title: 'Fresh server chat',
        agentId: null,
        pinned: false,
        archived: false,
        activeLeafId: null,
        createdAt: 10,
        updatedAt: 10,
        messageCount: 0,
      })
    }
    if (path === '/api/v1/conversations/c-9') {
      if (state.conversationDetail.id === 'c-9') return jsonResponse(200, state.conversationDetail)
      return jsonResponse(200, {
        id: 'c-9',
        title: 'Fresh server chat',
        agentId: null,
        pinned: false,
        archived: false,
        activeLeafId: null,
        createdAt: 10,
        updatedAt: 10,
        messageCount: 0,
        nodes: [],
      })
    }
    if (/^\/api\/v1\/conversations\/c-9\/nodes$/.test(path) && method === 'POST') {
      const payload = body as { content?: string }
      const userNode = {
        id: 'n-user-1',
        parentId: null,
        role: 'user',
        status: 'complete',
        content: payload.content ?? '',
        createdAt: 11,
        feedback: null,
      }
      const assistantNode = {
        id: 'n-assist-1',
        parentId: 'n-user-1',
        role: 'assistant',
        status: 'complete',
        content: 'Server reply streamed back.',
        createdAt: 12,
        feedback: null,
      }
      state.conversationDetail = {
        id: 'c-9',
        title: 'Fresh server chat',
        agentId: null,
        pinned: false,
        archived: false,
        activeLeafId: 'n-assist-1',
        createdAt: 10,
        updatedAt: 12,
        messageCount: 2,
        nodes: [userNode, assistantNode],
      }
      return jsonResponse(201, {
        node: userNode,
        conversation: { ...state.conversationDetail, nodes: [userNode] },
        reused: false,
      })
    }
    if (/^\/api\/v1\/conversations\/c-9\/runs$/.test(path) && method === 'POST') {
      return jsonResponse(201, {
        run: {
          id: 'run-1',
          conversationId: 'c-9',
          parentNodeId: 'n-user-1',
          providerId: 'sp-1',
          providerKind: 'openai-compatible',
          providerEndpoint: 'https://api.example.test/v1',
          modelId: 'grok-test',
          status: 'running',
          outputText: '',
          usage: null,
          errorCode: null,
          errorMessage: null,
          createdAt: 12,
          updatedAt: 12,
          terminalAt: null,
        },
        events: [{ eventId: 'run-1:1', runId: 'run-1', sequence: 1, type: 'started', timestamp: 12, payload: { text: '' } }],
        reused: false,
      })
    }
    if (/^\/api\/v1\/runs\/run-1\/cancel$/.test(path) && method === 'POST') {
      return jsonResponse(200, {
        run: {
          id: 'run-1',
          conversationId: 'c-9',
          parentNodeId: 'n-user-1',
          providerId: 'sp-1',
          providerKind: 'openai-compatible',
          providerEndpoint: 'https://api.example.test/v1',
          modelId: 'grok-test',
          status: 'stopped',
          outputText: 'partial',
          usage: null,
          errorCode: null,
          errorMessage: null,
          createdAt: 12,
          updatedAt: 13,
          terminalAt: 13,
        },
      })
    }
    if (/^\/api\/v1\/runs\/run-1\/events/.test(path)) {
      const sse = [
        'data: ' + JSON.stringify({ eventId: 'run-1:1', runId: 'run-1', sequence: 1, type: 'started', timestamp: 12, payload: { text: '' } }),
        '',
        'data: ' + JSON.stringify({ eventId: 'run-1:2', runId: 'run-1', sequence: 2, type: 'delta', timestamp: 13, payload: { text: 'Server ' } }),
        '',
        'data: ' + JSON.stringify({ eventId: 'run-1:3', runId: 'run-1', sequence: 3, type: 'delta', timestamp: 14, payload: { text: 'reply streamed back.' } }),
        '',
        'data: ' + JSON.stringify({ eventId: 'run-1:4', runId: 'run-1', sequence: 4, type: 'terminal', timestamp: 15, payload: { status: 'complete' } }),
        '',
        '',
      ].join('\n')
      return new Response(sse, { status: 200, headers: { 'content-type': 'text/event-stream' } })
    }
    return jsonResponse(404, { code: 'not_found', message: 'Resource not found.', requestId: 'r-x' })
  })

  return { fetchMock, state, calls }
}

describe('Account section — server session and deliberate import', () => {
  let mock: ReturnType<typeof createFetchMock>

  beforeEach(() => {
    mock = createFetchMock()
    vi.stubGlobal('fetch', mock.fetchMock)
    localStorage.clear()
    useServerSessionStore.getState().resetForTests()
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    useServerSessionStore.getState().resetForTests()
  })

  it('shows the sign-in form when signed out, with the session hydrated as absent', async () => {
    render(<AccountSection />)
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument()
    expect(screen.queryByText(/Chats on this account/i)).toBeNull()
  })

  it('signs in through the real routes and hydrates the workspace', async () => {
    render(<AccountSection />)
    await screen.findByRole('button', { name: 'Sign in' })

    await userEvent.type(screen.getByLabelText(/Email/i), 'alice@example.test')
    await userEvent.type(screen.getByLabelText(/Password/i), 'password-123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByText(/Signed in — alice@example.test/i)).toBeInTheDocument()
    expect(screen.getByText(/Personal workspace · owner/i)).toBeInTheDocument()

    const signInCall = mock.calls.find((call) => call.url === '/api/auth/sign-in/email')
    expect(signInCall?.body).toEqual({ email: 'alice@example.test', password: 'password-123' })
  })

  it('shows the honest error envelope message on bad credentials', async () => {
    render(<AccountSection />)
    await screen.findByRole('button', { name: 'Sign in' })

    await userEvent.type(screen.getByLabelText(/Email/i), 'alice@example.test')
    await userEvent.type(screen.getByLabelText(/Password/i), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/Email or password is incorrect/i)
    expect(screen.queryByText(/Signed in —/i)).toBeNull()
  })

  it('lists server conversations after sign-in and opens one read-only', async () => {
    render(<AccountSection />)
    await screen.findByRole('button', { name: 'Sign in' })

    await userEvent.type(screen.getByLabelText(/Email/i), 'alice@example.test')
    await userEvent.type(screen.getByLabelText(/Password/i), 'password-123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    // The conversation list appears (re-fetched after sign-in).
    const listButton = await screen.findByRole('button', { name: /Server chat one/i })
    expect(screen.getByText(/Server conversations \(1\)/i)).toBeInTheDocument()

    // Opening it fetches the detail and renders the read-only tree.
    await userEvent.click(listButton)
    expect(await screen.findByLabelText('Server conversation Server chat one')).toBeInTheDocument()
    expect(screen.getByText('Hello server')).toBeInTheDocument()
    expect(screen.getByText('Hi from the server')).toBeInTheDocument()
    expect(screen.getByText('Older branch')).toBeInTheDocument()
    expect(screen.getByText(/other branch/i)).toBeInTheDocument()
    expect(screen.getByText(/Server execution/i)).toBeInTheDocument()
  })

  it('adds a server provider, then chats end-to-end over the streamed run', async () => {
    render(<AccountSection />)
    await screen.findByRole('button', { name: 'Sign in' })
    await userEvent.type(screen.getByLabelText(/Email/i), 'alice@example.test')
    await userEvent.type(screen.getByLabelText(/Password/i), 'password-123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/Signed in — alice@example.test/i)).toBeInTheDocument()

    // Add a server provider (create + credential + refresh).
    await userEvent.click(await screen.findByRole('button', { name: /Add provider/i }))
    await userEvent.type(screen.getByLabelText(/^Label/i), 'xAI test')
    await userEvent.type(screen.getByLabelText(/API key/i), 'sk-server-key')
    await userEvent.click(screen.getByRole('button', { name: /Save provider \+ key/i }))

    expect(await screen.findByText('xAI test')).toBeInTheDocument()
    expect(await screen.findByText('Key saved')).toBeInTheDocument()
    const createProviderCall = mock.calls.find(
      (call) => call.url === '/api/v1/providers' && call.method === 'POST',
    )
    const credentialCall = mock.calls.find((call) => call.url === '/api/v1/providers/sp-1/credential')
    expect(createProviderCall).toBeTruthy()
    expect(credentialCall).toBeTruthy()
    // The key is sent exactly once, to the credential route.
    expect(
      mock.calls.filter((call) => JSON.stringify(call.body ?? '').includes('sk-server-key')),
    ).toHaveLength(1)

    // Test the provider — discovery persists the models server chat needs.
    await userEvent.click(screen.getByRole('button', { name: 'Test' }))
    expect(await screen.findByText(/Connected — the key works/i)).toBeInTheDocument()

    // Create a server conversation.
    await userEvent.type(
      screen.getByLabelText('New server conversation title'),
      'Fresh server chat',
    )
    await userEvent.click(screen.getByRole('button', { name: 'New' }))

    // Send a message: user node + run + streamed reply.
    const composer = await screen.findByLabelText('Message the server assistant')
    await userEvent.type(composer, 'Hello from the account surface')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))

    // The streamed deltas render, then the refreshed conversation carries
    // the persisted assistant node.
    expect(await screen.findByText('Server reply streamed back.')).toBeInTheDocument()
    expect(await screen.findByText('Hello from the account surface')).toBeInTheDocument()

    const nodeCall = mock.calls.find(
      (call) => /^\/api\/v1\/conversations\/c-9\/nodes$/.test(call.url) && call.method === 'POST',
    )
    const runCall = mock.calls.find(
      (call) => /^\/api\/v1\/conversations\/c-9\/runs$/.test(call.url) && call.method === 'POST',
    )
    const streamCall = mock.calls.find((call) => call.url.includes('/api/v1/runs/run-1/events'))
    expect(nodeCall?.body).toMatchObject({ role: 'user', content: 'Hello from the account surface' })
    expect(runCall?.body).toMatchObject({ parentNodeId: 'n-user-1', providerId: 'sp-1' })
    expect(streamCall).toBeTruthy()
  })

  it('tests a provider through the discovery route and shows the honest result', async () => {
    render(<AccountSection />)
    await screen.findByRole('button', { name: 'Sign in' })
    await userEvent.type(screen.getByLabelText(/Email/i), 'alice@example.test')
    await userEvent.type(screen.getByLabelText(/Password/i), 'password-123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/Signed in — alice@example.test/i)).toBeInTheDocument()

    // Add a provider without typing a model id (the default happy path).
    await userEvent.click(await screen.findByRole('button', { name: /Add provider/i }))
    await userEvent.type(screen.getByLabelText(/^Label/i), 'xAI test')
    await userEvent.type(screen.getByLabelText(/API key/i), 'sk-server-key')
    await userEvent.click(screen.getByRole('button', { name: /Save provider \+ key/i }))
    expect(await screen.findByText('xAI test')).toBeInTheDocument()

    // Before the test: no model on the row, so no model-for-chat line.
    expect(screen.queryByText(/Model for server chat/i)).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Test' }))

    // The Test button hits the discovery route (test + persist models).
    const discoverCall = mock.calls.find((call) => call.url === '/api/v1/providers/sp-1/models')
    expect(discoverCall?.method).toBe('POST')

    // The outcome is shown verbatim — never silent on success.
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent('Connected — the key works.')
    expect(status).toHaveTextContent('42 ms')
    expect(status).toHaveTextContent('2 models discovered (grok-3-mini, grok-4)')

    // The refreshed provider row names the model server chat will use.
    expect(await screen.findByText(/Model for server chat/i)).toHaveTextContent('grok-3-mini')
    expect(screen.getByText(/first discovered model/i)).toBeInTheDocument()

    // The stale-avoidance check: the plain test route is NOT what the
    // button calls (it would not persist models).
    expect(mock.calls.some((call) => call.url === '/api/v1/providers/sp-1/test')).toBe(false)
  })

  it('shows an honest hint instead of a fake reply when no server provider has a key', async () => {
    render(<AccountSection />)
    await screen.findByRole('button', { name: 'Sign in' })
    await userEvent.type(screen.getByLabelText(/Email/i), 'alice@example.test')
    await userEvent.type(screen.getByLabelText(/Password/i), 'password-123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/Signed in — alice@example.test/i)).toBeInTheDocument()

    // No provider added: open a conversation — the composer explains
    // instead of inventing a reply.
    await userEvent.type(
      screen.getByLabelText('New server conversation title'),
      'No provider chat',
    )
    await userEvent.click(screen.getByRole('button', { name: 'New' }))
    const composer = await screen.findByLabelText('Message the server assistant')
    expect(composer).toHaveAttribute(
      'placeholder',
      'Add a server provider (key or keyless local) above first…',
    )
  })

  it('signing out clears all server-derived state from the browser', async () => {
    render(<AccountSection />)
    await screen.findByRole('button', { name: 'Sign in' })

    await userEvent.type(screen.getByLabelText(/Email/i), 'alice@example.test')
    await userEvent.type(screen.getByLabelText(/Password/i), 'password-123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByText(/Server chat one/i)

    // Sign out.
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument()

    // The prior user's conversations and account are gone from the store.
    const state = useServerSessionStore.getState()
    expect(state.status).toBe('signed-out')
    expect(state.account).toBeNull()
    expect(state.conversations).toHaveLength(0)
    expect(state.openConversation).toBeNull()
    expect(mock.calls.some((call) => call.url === '/api/auth/sign-out')).toBe(true)
  })

  it('imports a backup file deliberately: preview, then confirm', async () => {
    render(<AccountSection />)
    await screen.findByRole('button', { name: 'Sign in' })

    await userEvent.type(screen.getByLabelText(/Email/i), 'alice@example.test')
    await userEvent.type(screen.getByLabelText(/Password/i), 'password-123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    await screen.findByText(/Import local workspace/i)

    const file = new File([JSON.stringify(BACKUP)], 'uni-workspace-backup.json', {
      type: 'application/json',
    })
    await userEvent.upload(screen.getByLabelText(/Backup file/i), file)

    // Preview shows counts and the honest unsupported-section note.
    expect(await screen.findByText(/Ready to import 2 chats \(5 messages\)/i)).toBeInTheDocument()
    expect(screen.getByText(/1 temporary chats will be skipped/i)).toBeInTheDocument()
    expect(screen.getByText(/Not imported yet \(later milestones\):/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Import to my workspace' }))

    expect(await screen.findByText(/Imported 2 chats \(5 messages\)/i)).toBeInTheDocument()
    expect(screen.getByText(/Your local copy is untouched/i)).toBeInTheDocument()

    const previewCall = mock.calls.find((call) => call.url === '/api/v1/import/preview')
    const commitCall = mock.calls.find((call) => call.url === '/api/v1/import/commit')
    expect(previewCall?.body).toEqual(BACKUP)
    expect(commitCall?.body).toEqual(BACKUP)
  })

  it('sends to the explicitly selected provider and model, immune to profile ordering (N004)', async () => {
    render(<AccountSection />)
    await screen.findByRole('button', { name: 'Sign in' })
    await userEvent.type(screen.getByLabelText(/Email/i), 'alice@example.test')
    await userEvent.type(screen.getByLabelText(/Password/i), 'password-123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/Signed in — alice@example.test/i)).toBeInTheDocument()

    // Provider A (sp-1): keyed, discovered.
    await userEvent.click(await screen.findByRole('button', { name: /Add provider/i }))
    await userEvent.type(screen.getByLabelText(/^Label/i), 'Provider A')
    await userEvent.type(screen.getByLabelText(/API key/i), 'sk-a')
    await userEvent.click(screen.getByRole('button', { name: /Save provider \+ key/i }))
    expect(await screen.findByText('Provider A')).toBeInTheDocument()

    // Provider B (sp-2): keyed, discovered.
    await userEvent.click(await screen.findByRole('button', { name: /Add provider/i }))
    await userEvent.type(screen.getByLabelText(/^Label/i), 'Provider B')
    await userEvent.type(screen.getByLabelText(/API key/i), 'sk-b')
    await userEvent.click(screen.getByRole('button', { name: /Save provider \+ key/i }))
    expect(await screen.findByText('Provider B')).toBeInTheDocument()

    // Test both providers so both have discovered models.
    const testButtons = await screen.findAllByRole('button', { name: 'Test' })
    for (const button of testButtons) await userEvent.click(button)
    await screen.findByText(/2 models discovered/i)

    // A conversation must be open for the destination picker to exist.
    await userEvent.type(screen.getByLabelText('New server conversation title'), 'Selection chat')
    await userEvent.click(screen.getByRole('button', { name: 'New' }))

    // Explicitly choose Provider B's second model in the picker.
    const providerSelect = await screen.findByLabelText('Server chat provider')
    await userEvent.selectOptions(providerSelect, 'sp-2')
    const modelSelect = await screen.findByLabelText('Server chat model')
    await userEvent.selectOptions(modelSelect, 'model-b-two')

    const composer = await screen.findByLabelText('Message the server assistant')
    await userEvent.type(composer, 'go to B')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText('Server reply streamed back.')).toBeInTheDocument()

    // The run went to the EXACT selected provider and model — not the
    // first credentialed one.
    const runCall = mock.calls.find(
      (call) => /^\/api\/v1\/conversations\/c-9\/runs$/.test(call.url) && call.method === 'POST',
    )
    expect(runCall?.body).toMatchObject({ providerId: 'sp-2', modelId: 'model-b-two' })

    // Adding another profile never changes the chosen destination.
    await userEvent.click(await screen.findByRole('button', { name: /Add provider/i }))
    await userEvent.type(screen.getByLabelText(/^Label/i), 'Provider C')
    await userEvent.type(screen.getByLabelText(/API key/i), 'sk-c')
    await userEvent.click(screen.getByRole('button', { name: /Save provider \+ key/i }))
    expect((await screen.findAllByText('Provider C')).length).toBeGreaterThan(0)
    expect(useServerSessionStore.getState().serverSelection).toEqual({
      providerId: 'sp-2',
      modelId: 'model-b-two',
    })
  })

  it('deleting the chosen provider leaves an explicit unavailable state with no fallback (N005)', async () => {
    render(<AccountSection />)
    await screen.findByRole('button', { name: 'Sign in' })
    await userEvent.type(screen.getByLabelText(/Email/i), 'alice@example.test')
    await userEvent.type(screen.getByLabelText(/Password/i), 'password-123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/Signed in — alice@example.test/i)).toBeInTheDocument()

    // Two keyed providers.
    for (const label of ['Provider A', 'Provider B']) {
      await userEvent.click(await screen.findByRole('button', { name: /Add provider/i }))
      await userEvent.type(screen.getByLabelText(/^Label/i), label)
      await userEvent.type(screen.getByLabelText(/API key/i), `sk-${label.slice(-1).toLowerCase()}`)
      await userEvent.click(screen.getByRole('button', { name: /Save provider \+ key/i }))
      expect(await screen.findByText(label)).toBeInTheDocument()
    }
    const testButtons = await screen.findAllByRole('button', { name: 'Test' })
    for (const button of testButtons) await userEvent.click(button)
    await screen.findByText(/2 models discovered/i)

    // Default selection: the first usable provider (sp-1).
    expect(useServerSessionStore.getState().serverSelection?.providerId).toBe('sp-1')

    // Open a conversation so the destination picker is visible.
    await userEvent.type(screen.getByLabelText('New server conversation title'), 'After delete')
    await userEvent.click(screen.getByRole('button', { name: 'New' }))
    await screen.findByLabelText('Message the server assistant')

    // Delete the CHOSEN provider through the confirm dialog.
    await userEvent.click(screen.getByRole('button', { name: 'Delete provider Provider A' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Delete provider' }))

    // The selection is gone — an explicit unavailable notice is shown,
    // with no automatic fallback to Provider B (sp-2).
    expect(
      await screen.findByText(/selected provider was removed — server chat is unavailable/i),
    ).toBeInTheDocument()
    expect(useServerSessionStore.getState().serverSelection).toBeNull()
    expect(localStorage.getItem('universe:server-selection:v1:w-1')).toBeNull()

    // A send does NOT reach any provider: honest error, no run created.
    const composer = screen.getByLabelText('Message the server assistant')
    await userEvent.type(composer, 'should not send')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(await screen.findByText(/Choose a provider and model for server chat/i)).toBeInTheDocument()
    const runCalls = mock.calls.filter(
      (call) => /conversations\/c-9\/runs$/.test(call.url) && call.method === 'POST',
    )
    expect(runCalls).toHaveLength(0)
  })

  it('sets a manual model on a provider whose discovery found nothing (N010)', async () => {
    render(<AccountSection />)
    await screen.findByRole('button', { name: 'Sign in' })
    await userEvent.type(screen.getByLabelText(/Email/i), 'alice@example.test')
    await userEvent.type(screen.getByLabelText(/Password/i), 'password-123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/Signed in — alice@example.test/i)).toBeInTheDocument()

    // A keyed provider whose discovery never ran (or found nothing): no
    // model on the row, so the manual affordance is the honest path.
    await userEvent.click(await screen.findByRole('button', { name: /Add provider/i }))
    await userEvent.type(screen.getByLabelText(/^Label/i), 'Local runtime')
    await userEvent.type(screen.getByLabelText(/API key/i), 'sk-local')
    await userEvent.click(screen.getByRole('button', { name: /Save provider \+ key/i }))
    expect(await screen.findByText('Local runtime')).toBeInTheDocument()
    expect(screen.queryByText(/Model for server chat/i)).toBeNull()

    // Manual setup: type an exact id and set it on the provider row.
    await userEvent.click(await screen.findByRole('button', { name: /Set model manually/i }))
    await userEvent.type(screen.getByLabelText(/Model id for Local runtime/i), 'qwen3-30b-a3b')
    await userEvent.click(screen.getByRole('button', { name: 'Set model' }))

    // The PATCH carried exactly the typed id.
    const patchCall = mock.calls.find(
      (call) => call.url === '/api/v1/providers/sp-1' && call.method === 'PATCH',
    )
    expect(patchCall).toBeTruthy()
    expect(patchCall?.body).toEqual({ modelId: 'qwen3-30b-a3b' })

    // The row names the manual model, and (no selection existed, provider
    // usable) it became the explicit destination.
    expect(await screen.findByText(/Model for server chat/i)).toHaveTextContent('qwen3-30b-a3b')
    expect(useServerSessionStore.getState().serverSelection).toEqual({
      providerId: 'sp-1',
      modelId: 'qwen3-30b-a3b',
    })
  })

  it('manual model setup on a non-selected provider never moves the selection (N010/N004)', async () => {
    render(<AccountSection />)
    await screen.findByRole('button', { name: 'Sign in' })
    await userEvent.type(screen.getByLabelText(/Email/i), 'alice@example.test')
    await userEvent.type(screen.getByLabelText(/Password/i), 'password-123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/Signed in — alice@example.test/i)).toBeInTheDocument()

    // Provider A: tested, discovers models, becomes the default selection.
    await userEvent.click(await screen.findByRole('button', { name: /Add provider/i }))
    await userEvent.type(screen.getByLabelText(/^Label/i), 'Provider A')
    await userEvent.type(screen.getByLabelText(/API key/i), 'sk-a')
    await userEvent.click(screen.getByRole('button', { name: /Save provider \+ key/i }))
    expect(await screen.findByText('Provider A')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Test' })[0]!)
    await screen.findByText(/2 models discovered/i)
    expect(useServerSessionStore.getState().serverSelection).toEqual({
      providerId: 'sp-1',
      modelId: 'grok-3-mini',
    })

    // Provider B: keyed, no discovery — set a manual model on ITS row.
    await userEvent.click(await screen.findByRole('button', { name: /Add provider/i }))
    await userEvent.type(screen.getByLabelText(/^Label/i), 'Provider B')
    await userEvent.type(screen.getByLabelText(/API key/i), 'sk-b')
    await userEvent.click(screen.getByRole('button', { name: /Save provider \+ key/i }))
    expect(await screen.findByText('Provider B')).toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: /Set model manually/i }))
    await userEvent.type(screen.getByLabelText(/Model id for Provider B/i), 'model-b-manual')
    await userEvent.click(screen.getByRole('button', { name: 'Set model' }))

    const patchCall = mock.calls.find(
      (call) => call.url === '/api/v1/providers/sp-2' && call.method === 'PATCH',
    )
    expect(patchCall?.body).toEqual({ modelId: 'model-b-manual' })

    // The destination still addresses Provider A exactly (N004): setting
    // a model on another provider's row is configuration, not selection.
    expect(useServerSessionStore.getState().serverSelection).toEqual({
      providerId: 'sp-1',
      modelId: 'grok-3-mini',
    })
    const modelLines = await screen.findAllByText(/Model for server chat/i)
    expect(modelLines.some((line) => line.textContent?.includes('model-b-manual'))).toBe(true)
  })

  it('types a model id directly in the destination picker (N010)', async () => {
    render(<AccountSection />)
    await screen.findByRole('button', { name: 'Sign in' })
    await userEvent.type(screen.getByLabelText(/Email/i), 'alice@example.test')
    await userEvent.type(screen.getByLabelText(/Password/i), 'password-123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByText(/Signed in — alice@example.test/i)).toBeInTheDocument()

    // A tested provider with a discovered catalog is the default
    // destination; the picker offers its models.
    await userEvent.click(await screen.findByRole('button', { name: /Add provider/i }))
    await userEvent.type(screen.getByLabelText(/^Label/i), 'xAI test')
    await userEvent.type(screen.getByLabelText(/API key/i), 'sk-x')
    await userEvent.click(screen.getByRole('button', { name: /Save provider \+ key/i }))
    expect(await screen.findByText('xAI test')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Test' })[0]!)
    await screen.findByText(/2 models discovered/i)

    await userEvent.type(screen.getByLabelText('New server conversation title'), 'Manual model')
    await userEvent.click(screen.getByRole('button', { name: 'New' }))
    const modelSelect = await screen.findByLabelText('Server chat model')
    expect(modelSelect).toHaveValue('grok-3-mini')

    // The catalog does not list the model the user wants — type it.
    await userEvent.selectOptions(modelSelect, '__manual__')
    await userEvent.type(screen.getByLabelText('Model id for server chat'), 'grok-4-fast-reasoning')
    await userEvent.click(screen.getByRole('button', { name: 'Set model' }))

    const patchCall = mock.calls.find(
      (call) => call.url === '/api/v1/providers/sp-1' && call.method === 'PATCH',
    )
    expect(patchCall?.body).toEqual({ modelId: 'grok-4-fast-reasoning' })

    // The destination now addresses the manually-typed model exactly,
    // and the picker keeps it selectable (labeled as manually set).
    expect(useServerSessionStore.getState().serverSelection).toEqual({
      providerId: 'sp-1',
      modelId: 'grok-4-fast-reasoning',
    })
    expect(await screen.findByLabelText('Server chat model')).toHaveValue('grok-4-fast-reasoning')
    expect(
      screen.getByRole('option', { name: /grok-4-fast-reasoning — set manually/i }),
    ).toBeInTheDocument()
  })

  it('marks a replayed import honestly instead of claiming new records', async () => {
    render(<AccountSection />)
    await screen.findByRole('button', { name: 'Sign in' })

    await userEvent.type(screen.getByLabelText(/Email/i), 'alice@example.test')
    await userEvent.type(screen.getByLabelText(/Password/i), 'password-123')
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }))

    // Simulate the server responding with an idempotent replay while
    // keeping every other route intact.
    const original = mock.fetchMock.getMockImplementation()
    mock.fetchMock.mockImplementation(async (url: string | URL, init?: RequestInit) => {
      if (String(url) === '/api/v1/import/commit') {
        return jsonResponse(200, {
          batchId: 'b-existing',
          imported: { conversations: 1, messages: 3 },
          skippedTemporary: 0,
          unsupported: [],
          idempotentReplay: true,
          conversationIdMap: { 'local-1': 'c-9' },
        })
      }
      return original ? original(url, init) : jsonResponse(404, {})
    })

    const file = new File([JSON.stringify(BACKUP)], 'uni-workspace-backup.json', {
      type: 'application/json',
    })
    await userEvent.upload(screen.getByLabelText(/Backup file/i), file)
    await screen.findByText(/Ready to import/i)
    await userEvent.click(screen.getByRole('button', { name: 'Import to my workspace' }))

    expect(await screen.findByText(/already imported — nothing was duplicated/i)).toBeInTheDocument()
  })
})
