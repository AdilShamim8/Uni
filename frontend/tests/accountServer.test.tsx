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
        const payload = body as { label?: string; kind?: string; endpointUrl?: string; modelId?: string }
        const provider = {
          id: 'sp-1',
          label: payload.label ?? '',
          kind: payload.kind ?? 'openai-compatible',
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
    if (path === '/api/v1/providers/sp-1/credential' && method === 'PUT') {
      const provider = state.providers[0]
      provider.credential = { present: true, keyId: 'key-1', status: 'untested', lastCheckedAt: null, lastError: null }
      return jsonResponse(200, provider)
    }
    if (path === '/api/v1/providers/sp-1/models' && method === 'POST') {
      // The discovery route the Test button uses: tests the key AND
      // persists the discovered models on the provider row.
      const provider = state.providers[0] as {
        models: string[]
        credential: { present: boolean; keyId: string | null; status: string; lastCheckedAt: number | null; lastError: string | null }
      }
      if (!provider.credential.present) {
        return jsonResponse(200, {
          ok: false,
          message: 'No API key stored for this provider yet.',
          latencyMs: null,
          discoveredModels: null,
        })
      }
      provider.models = ['grok-3-mini', 'grok-4']
      provider.credential = { ...provider.credential, status: 'connected', lastCheckedAt: 99, lastError: null }
      return jsonResponse(200, {
        ok: true,
        message: 'Connected — the key works.',
        latencyMs: 42,
        discoveredModels: ['grok-3-mini', 'grok-4'],
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
      'Add a server provider (with a key) above first…',
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
