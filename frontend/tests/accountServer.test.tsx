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
  const state = { sessionUser: null as typeof USER | null }
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
    if (path === '/api/v1/conversations') {
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
    expect(screen.getByText(/Read-only server copy/i)).toBeInTheDocument()
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
