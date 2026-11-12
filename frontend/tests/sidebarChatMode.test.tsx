import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, setupAppTest } from './helpers'
import { useServerSessionStore } from '@/state/serverSessionStore'
import { resetWorkspaceUiForTests, useWorkspaceUiStore } from '@/state/workspaceUiStore'

/**
 * Phase B unified server chat surface — the sidebar's chat section:
 * the explicit Local/Server mode toggle (signed-in sessions only),
 * server conversation list, server new-chat action, and the honest
 * signed-out behavior (toggle hidden, local list, local new-chat).
 *
 * The session flows through the real fetch path (mocked at the network
 * boundary with the backend's exact routes) so the App's mount-time
 * initialize() reaches the same signed-in state the product would.
 */

const USER = { id: 'u-1', email: 'a@b.test', name: 'Alice', createdAt: 1 }
const ME = { user: USER, workspace: { id: 'w-1', name: 'W', role: 'owner' } }
const CONVERSATIONS = [
  {
    id: 'c-1',
    title: 'Server chat one',
    agentId: null,
    pinned: false,
    archived: false,
    activeLeafId: 'n-2',
    createdAt: 1,
    updatedAt: 2,
    messageCount: 4,
  },
]

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/** Backend route mock: signed-in session with one conversation. */
function stubServerSession(signedIn = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      const path = String(url)
      if (path === '/api/auth/get-session') {
        return jsonResponse(
          200,
          signedIn ? { session: { token: 't' }, user: USER } : null,
        )
      }
      if (path === '/api/v1/me') {
        return signedIn ? jsonResponse(200, ME) : jsonResponse(401, { code: 'unauthorized' })
      }
      if (path === '/api/v1/conversations') {
        return jsonResponse(200, { items: CONVERSATIONS, page: { total: 1, limit: 50, offset: 0 } })
      }
      return jsonResponse(404, { code: 'not_found' })
    }),
  )
}

function persistChatMode(mode: 'local' | 'server'): void {
  localStorage.setItem(
    'universe:layout:v1',
    JSON.stringify({ version: 1, payload: { chatMode: mode } }),
  )
}

async function signInSettled(): Promise<void> {
  await waitFor(() => {
    expect(useServerSessionStore.getState().status).toBe('signed-in')
  })
}

describe('Sidebar — chat surface mode', () => {
  beforeEach(() => {
    cleanup()
    setupAppTest()
    resetWorkspaceUiForTests()
    useWorkspaceUiStore.getState().initialize()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('signed out: no mode toggle, local chat list, local new chat', async () => {
    stubServerSession(false)
    renderApp('/chat')
    await waitFor(() => {
      expect(useServerSessionStore.getState().status).toBe('signed-out')
    })

    expect(screen.queryByRole('radiogroup', { name: /local or server/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New chat' })).toBeInTheDocument()
    expect(screen.queryByText('Server chats')).not.toBeInTheDocument()
  })

  it('signed in: the mode toggle appears and defaults to Local', async () => {
    stubServerSession(true)
    renderApp('/chat')
    await signInSettled()

    expect(screen.getByRole('radiogroup', { name: /local or server/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Local' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Server' })).toHaveAttribute('aria-checked', 'false')
  })

  it('server mode: lists server conversations in the sidebar', async () => {
    stubServerSession(true)
    persistChatMode('server')
    renderApp('/sc')
    await signInSettled()

    // Both the sidebar section and the page heading say "Server chats"
    // at /sc — assert the sidebar list itself through its row button.
    // The conversation appears in the sidebar list AND the page index —
    // both are real surfaces; assert presence, not count.
    expect((await screen.findAllByRole('button', { name: /Server chat one/ })).length).toBeGreaterThan(0)
  })

  it('server mode: New chat creates a server conversation; temporary stays local-only', async () => {
    stubServerSession(true)
    persistChatMode('server')
    renderApp('/sc')
    await signInSettled()

    const create = vi.fn(async () => 'c-new')
    useServerSessionStore.setState({ newServerConversation: create })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'New chat' }))
    expect(create).toHaveBeenCalled()
    // Server chats persist by contract — the temporary control is honest.
    expect(screen.queryByRole('button', { name: 'New temporary chat' })).not.toBeInTheDocument()
  })

  it('the toggle switches mode and the sidebar follows', async () => {
    stubServerSession(true)
    renderApp('/chat')
    await signInSettled()

    const user = userEvent.setup()
    await user.click(screen.getByRole('radio', { name: 'Server' }))
    expect(useWorkspaceUiStore.getState().chatMode).toBe('server')
    expect((await screen.findAllByRole('button', { name: /Server chat one/ })).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('radio', { name: 'Local' }))
    expect(useWorkspaceUiStore.getState().chatMode).toBe('local')
    await waitFor(() => {
      expect(screen.queryAllByRole('button', { name: /Server chat one/ }).length).toBe(0)
    })
  })
})

describe('Sidebar — sign-out resets the chat mode', () => {
  beforeEach(() => {
    cleanup()
    setupAppTest()
    resetWorkspaceUiForTests()
    useWorkspaceUiStore.getState().initialize()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('explicit sign-out returns the surface to local mode', async () => {
    // Signed-in session in server mode.
    stubServerSession(true)
    persistChatMode('server')
    renderApp('/sc')
    await signInSettled()
    expect(useWorkspaceUiStore.getState().chatMode).toBe('server')

    // Sign out through the real store path (mocked network).
    useServerSessionStore.getState().signOut()
    await waitFor(() => {
      expect(useServerSessionStore.getState().status).toBe('signed-out')
    })
    await waitFor(() => {
      expect(useWorkspaceUiStore.getState().chatMode).toBe('local')
    })
  })

  it('an unreachable backend at startup keeps the persisted preference', async () => {
    // No fetch mock: every request fails like an offline backend.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    persistChatMode('server')
    renderApp('/sc')
    await waitFor(() => {
      expect(useServerSessionStore.getState().status).toBe('signed-out')
    })
    expect(useWorkspaceUiStore.getState().chatMode).toBe('server')
  })
})
