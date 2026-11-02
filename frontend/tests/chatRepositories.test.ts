import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/state/store'
import { useServerSessionStore } from '@/state/serverSessionStore'
import { chatRepositoryFor } from '@/services/chat/repository'
import { localChatRepository } from '@/services/chat/localChatRepository'
import type { Conversation, MessageNode } from '@/domain/types'

/**
 * Workspace mode and repository dispatch (U021): the main UI reads and
 * writes ONE selected backend per operation. Switching mode changes
 * only where subsequent operations go — it can never copy data or
 * split a write between the local browser store and the server store.
 */

const apiCalls: string[] = []

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

function serverSummary(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title: `Server ${id}`,
    agentId: null,
    pinned: false,
    archived: false,
    activeLeafId: null,
    createdAt: 1,
    updatedAt: 2,
    messageCount: 0,
    ...overrides,
  }
}

beforeEach(() => {
  apiCalls.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : String(input)
      apiCalls.push(`${init?.method ?? 'GET'} ${url}`)
      if (url.endsWith('/conversations') && init?.method === 'POST') {
        return jsonResponse(serverSummary('srv-1', JSON.parse(String(init.body))))
      }
      if (url.endsWith('/conversations')) return jsonResponse({ items: [serverSummary('srv-1')] })
      if (/\/conversations\/srv-1$/.test(url) && init?.method === 'PATCH') {
        return jsonResponse(serverSummary('srv-1', JSON.parse(String(init.body))))
      }
      if (/\/conversations\/srv-1$/.test(url) && init?.method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      if (/\/conversations\/srv-1$/.test(url)) {
        return jsonResponse({
          ...serverSummary('srv-1', { messageCount: 2, activeLeafId: 'n2' }),
          nodes: [
            { id: 'n1', parentId: null, role: 'user', status: 'complete', content: 'hi', createdAt: 1, feedback: null },
            { id: 'n2', parentId: 'n1', role: 'assistant', status: 'complete', content: 'hello', createdAt: 2, feedback: null },
            { id: 'n2b', parentId: 'n1', role: 'assistant', status: 'stopped', content: 'variant', createdAt: 3, feedback: null },
          ],
        })
      }
      return jsonResponse({})
    }),
  )
  useAppStore.setState({
    conversations: {},
    activeConversationId: null,
    workspaceMode: 'local',
  })
  useServerSessionStore.getState().resetForTests()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('local repository (U021)', () => {
  it('serves conversation operations from the browser store only — no network', async () => {
    const repository = chatRepositoryFor('local')
    expect(repository.mode).toBe('local')
    expect(repository.ready).toBe(true)

    const created = await repository.createConversation('Local chat')
    expect(created.title).toBe('Local chat')
    const stored = useAppStore.getState().conversations[created.id]
    expect(stored).toBeDefined()

    await repository.renameConversation(created.id, 'Renamed')
    expect(useAppStore.getState().conversations[created.id]?.title).toBe('Renamed')

    await repository.setPinned(created.id, true)
    expect(useAppStore.getState().conversations[created.id]?.pinned).toBe(true)

    await repository.setArchived(created.id, true)
    expect(useAppStore.getState().conversations[created.id]?.archived).toBe(true)

    const listed = await repository.listConversations()
    expect(listed.some((entry) => entry.id === created.id)).toBe(true)

    // Zero server calls, and the server store was never touched.
    expect(apiCalls).toEqual([])
    expect(useServerSessionStore.getState().conversations).toEqual([])

    await repository.deleteConversation(created.id)
    expect(useAppStore.getState().conversations[created.id]).toBeUndefined()
  })

  it('loadConversation preserves branching, siblings and the active leaf', async () => {
    const store = useAppStore.getState()
    const id = store.newConversation()
    const parent: MessageNode = {
      id: 'u1', parentId: null, role: 'user', content: 'hi', createdAt: 1, status: 'complete',
    }
    const variantA: MessageNode = {
      id: 'a1', parentId: 'u1', role: 'assistant', content: 'one', createdAt: 2, status: 'complete',
    }
    const variantB: MessageNode = {
      id: 'a2', parentId: 'u1', role: 'assistant', content: 'two', createdAt: 3, status: 'stopped',
    }
    useAppStore.setState({
      conversations: {
        [id]: {
          ...store.conversations[id],
          nodes: { u1: parent, a1: variantA, a2: variantB },
          activeLeafId: 'a1',
        } as Conversation,
      },
    })

    const loaded = await localChatRepository.loadConversation(id)
    expect(loaded).not.toBeNull()
    expect(loaded?.activeLeafId).toBe('a1')
    expect(loaded?.nodes).toHaveLength(3)
    // Both siblings survive hydration with their shared parent.
    const siblings = loaded?.nodes.filter((node) => node.parentId === 'u1')
    expect(siblings?.map((node) => node.id).sort()).toEqual(['a1', 'a2'])
    expect(loaded?.nodes.find((node) => node.id === 'a2')?.status).toBe('stopped')
  })
})

describe('server repository (U021)', () => {
  it('requires a signed-in account before any operation — no local fallback writes', async () => {
    const repository = chatRepositoryFor('server')
    expect(repository.ready).toBe(false)
    await expect(repository.createConversation('Nope')).rejects.toThrow('signed-in account')
    // Nothing was written locally as a side effect.
    expect(Object.keys(useAppStore.getState().conversations)).toEqual([])
    expect(apiCalls).toEqual([])
  })

  it('serves operations from the server API only — the local store is never touched', async () => {
    useServerSessionStore.setState({ status: 'signed-in' })
    const repository = chatRepositoryFor('server')
    expect(repository.ready).toBe(true)

    const localBefore = useAppStore.getState().conversations

    const created = await repository.createConversation('Server chat')
    expect(created.id).toBe('srv-1')
    expect(apiCalls.some((call) => call.includes('POST') && call.includes('/conversations'))).toBe(true)

    await repository.renameConversation('srv-1', 'Renamed on server')
    await repository.setPinned('srv-1', true)
    await repository.setArchived('srv-1', true)
    await repository.listConversations()
    await repository.deleteConversation('srv-1')

    // The local browser store is byte-for-byte unchanged.
    expect(useAppStore.getState().conversations).toBe(localBefore)
    // Every call went to the server API.
    expect(apiCalls.length).toBeGreaterThanOrEqual(5)
    expect(apiCalls.every((call) => call.includes('/api/v1/conversations'))).toBe(true)
  })

  it('maps server trees with parents, variants, statuses and the active leaf', async () => {
    useServerSessionStore.setState({ status: 'signed-in' })
    const repository = chatRepositoryFor('server')
    const loaded = await repository.loadConversation('srv-1')
    expect(loaded?.activeLeafId).toBe('n2')
    expect(loaded?.nodes).toHaveLength(3)
    const siblings = loaded?.nodes.filter((node) => node.parentId === 'n1')
    expect(siblings?.map((node) => node.id).sort()).toEqual(['n2', 'n2b'])
    expect(loaded?.nodes.find((node) => node.id === 'n2b')?.status).toBe('stopped')
  })
})

describe('mode switching (U021)', () => {
  it('changes only where subsequent operations go — never copies or splits writes', async () => {
    const store = useAppStore.getState()

    // Local write.
    store.setWorkspaceMode('local')
    const localCreated = await chatRepositoryFor('local').createConversation('Local only')
    expect(apiCalls).toEqual([])

    // Switch to server: the local write stays local, nothing is copied.
    store.setWorkspaceMode('server')
    useServerSessionStore.setState({ status: 'signed-in' })
    const serverCreated = await chatRepositoryFor('server').createConversation('Server only')
    expect(serverCreated.id).toBe('srv-1')
    expect(useAppStore.getState().conversations[localCreated.id]).toBeDefined()
    // The server write did not leak into the local store.
    expect(Object.keys(useAppStore.getState().conversations)).toEqual([localCreated.id])
    // And the local write never reached the API.
    expect(apiCalls.filter((call) => call.includes('POST'))).toHaveLength(1)

    // Switch back: server data is untouched by a local delete.
    store.setWorkspaceMode('local')
    await chatRepositoryFor('local').deleteConversation(localCreated.id)
    expect(apiCalls.filter((call) => call.includes('DELETE'))).toEqual([])
  })

  it('the mode is session-scoped and defaults to local', () => {
    expect(useAppStore.getState().workspaceMode).toBe('local')
    useAppStore.getState().setWorkspaceMode('server')
    expect(useAppStore.getState().workspaceMode).toBe('server')
    useAppStore.getState().setWorkspaceMode('local')
  })
})
