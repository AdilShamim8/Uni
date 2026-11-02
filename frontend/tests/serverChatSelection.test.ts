import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isServerProviderUsable,
  useServerSessionStore,
  type ServerProvider,
} from '@/state/serverSessionStore'

/**
 * Deliberate server provider/model selection (U013): with multiple
 * providers configured, the EXACT chosen pair receives every run —
 * inserting, reordering, or deleting another provider never silently
 * changes the choice, and deleting the chosen provider asks for a new
 * decision instead of guessing. All HTTP is mocked.
 */

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

const CONVERSATION_ID = 'conv-1'
const NODE_ID = 'node-1'

const runPayloads: Array<Record<string, unknown>> = []
let fetchMock: ReturnType<typeof vi.fn>

function provider(overrides: Partial<ServerProvider> & { id: string }): ServerProvider {
  return {
    label: overrides.label ?? overrides.id,
    kind: 'openai-compatible',
    endpointUrl: 'https://provider.test/v1',
    modelId: null,
    models: [],
    credential: { present: true, keyId: 'key-1', status: 'connected', lastCheckedAt: 1, lastError: null },
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  } as ServerProvider
}

const PROVIDER_A = provider({ id: 'provider-a', label: 'Provider A', models: ['a-model-1', 'a-model-2'] })
const PROVIDER_B = provider({ id: 'provider-b', label: 'Provider B', models: ['b-model-1', 'b-model-2'] })

const conversationDetail = {
  id: CONVERSATION_ID,
  title: 'Chat',
  agentId: null,
  pinned: false,
  archived: false,
  activeLeafId: NODE_ID,
  createdAt: 1,
  updatedAt: 1,
  messageCount: 2,
  nodes: [
    { id: NODE_ID, parentId: null, role: 'user', status: 'complete', content: 'hi', createdAt: 1, feedback: null },
  ],
}

function stubFetchForSend(): void {
  fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input)
    if (url.endsWith('/nodes')) {
      return jsonResponse({
        node: { id: NODE_ID, parentId: null, role: 'user', status: 'complete', content: 'hi', createdAt: 1, feedback: null },
        conversation: conversationDetail,
        reused: false,
      })
    }
    if (url.includes('/runs') && init?.method === 'POST') {
      runPayloads.push(JSON.parse(String(init.body)) as Record<string, unknown>)
      return jsonResponse({
        run: {
          id: 'run-1',
          conversationId: CONVERSATION_ID,
          parentNodeId: NODE_ID,
          providerId: 'x',
          providerKind: 'openai-compatible',
          providerEndpoint: 'https://provider.test/v1',
          modelId: 'x',
          status: 'running',
          outputText: '',
          usage: null,
          errorCode: null,
          errorMessage: null,
          createdAt: 1,
          updatedAt: 1,
          terminalAt: null,
        },
        events: [],
        reused: false,
      })
    }
    if (url.includes('/events')) {
      const terminal = JSON.stringify({
        eventId: 'run-1:1',
        runId: 'run-1',
        sequence: 1,
        type: 'terminal',
        timestamp: 2,
        payload: { status: 'complete' },
      })
      return new Response(`data: ${terminal}\n\n`, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }
    if (url.includes(`/conversations/${CONVERSATION_ID}`)) return jsonResponse(conversationDetail)
    if (url.includes('/conversations')) return jsonResponse({ items: [] })
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
}

beforeEach(() => {
  runPayloads.length = 0
  stubFetchForSend()
  useServerSessionStore.getState().resetForTests()
  useServerSessionStore.setState({
    status: 'signed-in',
    openConversationId: CONVERSATION_ID,
    openConversation: conversationDetail,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('serverChatSelection — the exact chosen pair receives the run (U013)', () => {
  it('sends with the explicitly selected provider and model, not the first', async () => {
    useServerSessionStore.setState({ serverProviders: [PROVIDER_A, PROVIDER_B] })
    useServerSessionStore.getState().setServerChatSelection('provider-b', 'b-model-2')

    const ok = await useServerSessionStore.getState().sendServerMessage('hi')
    expect(ok).toBe(true)
    expect(runPayloads).toHaveLength(1)
    expect(runPayloads[0]?.providerId).toBe('provider-b')
    expect(runPayloads[0]?.modelId).toBe('b-model-2')
  })

  it('inserting or reordering other providers never changes the choice', async () => {
    useServerSessionStore.setState({ serverProviders: [PROVIDER_A, PROVIDER_B] })
    useServerSessionStore.getState().setServerChatSelection('provider-b', 'b-model-1')

    // A new provider appears BEFORE the chosen one in the list.
    const PROVIDER_C = provider({ id: 'provider-c', label: 'Provider C', models: ['c-model-1'] })
    useServerSessionStore.setState({ serverProviders: [PROVIDER_C, PROVIDER_A, PROVIDER_B] })
    await useServerSessionStore.getState().sendServerMessage('hi')
    expect(runPayloads[0]?.providerId).toBe('provider-b')

    // Another (unrelated) provider is deleted.
    useServerSessionStore.setState({ serverProviders: [PROVIDER_C, PROVIDER_B] })
    await useServerSessionStore.getState().sendServerMessage('again')
    expect(runPayloads[1]?.providerId).toBe('provider-b')
    expect(runPayloads[1]?.modelId).toBe('b-model-1')
  })

  it('deleting the chosen provider asks for a new decision — no silent fallback', async () => {
    useServerSessionStore.setState({ serverProviders: [PROVIDER_A, PROVIDER_B] })
    useServerSessionStore.getState().setServerChatSelection('provider-b', 'b-model-1')
    useServerSessionStore.setState({ serverProviders: [PROVIDER_A] })

    const ok = await useServerSessionStore.getState().sendServerMessage('hi')
    expect(ok).toBe(false)
    expect(runPayloads).toHaveLength(0)
    expect(useServerSessionStore.getState().runError).toContain('no longer exists')
    expect(useServerSessionStore.getState().serverChatSelection).toBeNull()
  })

  it('an unusable selected provider is an explicit error, not a silent switch', async () => {
    const untested = provider({ id: 'provider-x', label: 'Untested', models: ['x-1'], credential: { present: false, keyId: null, status: 'untested', lastCheckedAt: null, lastError: null } })
    useServerSessionStore.setState({ serverProviders: [PROVIDER_A, untested] })
    useServerSessionStore.getState().setServerChatSelection('provider-x', 'x-1')

    const ok = await useServerSessionStore.getState().sendServerMessage('hi')
    expect(ok).toBe(false)
    expect(runPayloads).toHaveLength(0)
    expect(useServerSessionStore.getState().runError).toContain('not connected')
  })

  it('without a selection the first usable provider serves the send (existing fallback)', async () => {
    useServerSessionStore.setState({ serverProviders: [PROVIDER_A, PROVIDER_B] })
    const ok = await useServerSessionStore.getState().sendServerMessage('hi')
    expect(ok).toBe(true)
    expect(runPayloads[0]?.providerId).toBe('provider-a')
    expect(runPayloads[0]?.modelId).toBe('a-model-1')
  })

  it('a no-auth provider marked connected is usable (U012 interplay)', () => {
    const keyless = provider({
      id: 'provider-local',
      models: ['local-model'],
      credential: { present: false, keyId: null, status: 'connected', lastCheckedAt: 2, lastError: null },
    })
    expect(isServerProviderUsable(keyless)).toBe(true)
    expect(isServerProviderUsable(provider({ id: 'provider-untested', credential: { present: false, keyId: null, status: 'untested', lastCheckedAt: null, lastError: null } }))).toBe(false)
  })

  it('the selection is cleared on sign-out with the rest of the server-derived state', async () => {
    useServerSessionStore.setState({ serverProviders: [PROVIDER_A] })
    useServerSessionStore.getState().setServerChatSelection('provider-a', 'a-model-1')
    expect(useServerSessionStore.getState().serverChatSelection).not.toBeNull()
    await useServerSessionStore.getState().signOut()
    expect(useServerSessionStore.getState().serverChatSelection).toBeNull()
  })
})
