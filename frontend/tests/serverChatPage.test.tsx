import { describe, expect, it, vi, beforeEach } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ServerChatPage } from '@/features/chat/server/ServerChatPage'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerConversationDetail } from '@/state/serverSessionStore'

/**
 * Phase B unified server chat surface — the routed page: signed-out
 * prompt, index view (conversation list + first-chat action), and the
 * open-conversation view (transcript + composer + reload). Store
 * actions are mocked at the boundary; the transcript and composer
 * have their own suites against real rendering.
 */

const DETAIL: ServerConversationDetail = {
  id: 'c-1',
  title: 'Server chat one',
  agentId: null,
  pinned: false,
  archived: false,
  activeLeafId: 'n-2',
  createdAt: 1,
  updatedAt: 2,
  messageCount: 2,
  nodes: [
    { id: 'n-1', parentId: null, role: 'user', status: 'complete', content: 'Hello server', createdAt: 1, feedback: null },
    { id: 'n-2', parentId: 'n-1', role: 'assistant', status: 'complete', content: 'Hi from the server', createdAt: 2, feedback: null },
  ],
}

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
    messageCount: 2,
  },
]

function renderServerChat(path: string): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/sc" element={<ServerChatPage />} />
        <Route path="/sc/:conversationId" element={<ServerChatPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ServerChatPage', () => {
  beforeEach(() => {
    cleanup()
    vi.restoreAllMocks()
    useServerSessionStore.setState({
      status: 'signed-in',
      account: { user: { id: 'u-1', email: 'a@b.test', name: 'A', createdAt: 1 }, workspace: { id: 'w-1', name: 'W', role: 'owner' } },
      error: null,
      conversations: [],
      conversationsLoading: false,
      openConversation: null,
      openConversationId: null,
      openConversationLoading: false,
      loadConversations: vi.fn(async () => {}),
      openServerConversation: vi.fn(async () => {}),
      newServerConversation: vi.fn(async () => 'c-1'),
    })
  })

  it('shows the signed-out prompt when no session exists', () => {
    useServerSessionStore.setState({ status: 'signed-out' })
    renderServerChat('/sc')
    expect(screen.getByText('Server chats need an account')).toBeInTheDocument()
  })

  it('index view: offers the first conversation when the list is empty', async () => {
    const user = userEvent.setup()
    const create = vi.fn(async () => 'c-9')
    useServerSessionStore.setState({ newServerConversation: create })
    renderServerChat('/sc')

    expect(screen.getByText('No server conversations yet.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start the first one' }))
    expect(create).toHaveBeenCalled()
  })

  it('index view: lists conversations and navigates on click', async () => {
    const user = userEvent.setup()
    useServerSessionStore.setState({ conversations: CONVERSATIONS })
    renderServerChat('/sc')

    const row = screen.getByRole('button', { name: /Server chat one/ })
    await user.click(row)
    // Navigation within the in-memory router lands on /sc/c-1; the
    // effect then asks the store to open that conversation.
    await waitFor(() => {
      const open = useServerSessionStore.getState().openServerConversation
      expect(open).toHaveBeenCalledWith('c-1')
    })
  })

  it('open view: renders the transcript title and reload control', async () => {
    const open = vi.fn(async () => {})
    useServerSessionStore.setState({
      conversations: CONVERSATIONS,
      openConversation: DETAIL,
      openConversationId: 'c-1',
      openServerConversation: open,
    })
    renderServerChat('/sc/c-1')

    expect(screen.getByText('Server chat one')).toBeInTheDocument()
    expect(screen.getByText('Hello server')).toBeInTheDocument()
    expect(screen.getByLabelText('Message Uni on this server')).toBeInTheDocument()

    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Reload conversation' }))
    expect(open).toHaveBeenCalledWith('c-1')
  })

  it('shows the honest error when the server reports one', () => {
    useServerSessionStore.setState({ error: 'Could not load conversations' })
    renderServerChat('/sc')
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load conversations')
  })
})

describe('ServerChatPage — app route registration', () => {
  beforeEach(() => {
    cleanup()
    vi.restoreAllMocks()
    useServerSessionStore.setState({
      status: 'signed-out',
      resetForTests: useServerSessionStore.getState().resetForTests,
    } as never)
  })

  it('the /sc route renders the server chat surface inside the app shell', async () => {
    // Full App render: fetch to the auth endpoint fails in jsdom (no
    // server), which the store treats as signed-out — the honest
    // prompt proves the route reached the server surface.
    const { renderApp } = await import('./helpers')
    renderApp('/sc')
    await waitFor(() => {
      expect(screen.getByText('Server chats need an account')).toBeInTheDocument()
    })
  })
})
