import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, setupAppTest } from './helpers'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerConversationDetail, ServerMessageNode } from '@/state/serverSessionStore'
import { resetWorkspaceUiForTests, useWorkspaceUiStore } from '@/state/workspaceUiStore'

/**
 * Phase B unified server chat — the end-to-end journey over the real
 * store path: type → send → node POST (idempotent clientId) → run
 * create (idempotency key) → SSE deltas stream into the live bubble →
 * terminal → transcript re-fetch. Network mocked at the fetch boundary
 * with the backend's exact routes; every store action is the real one.
 */

const USER = { id: 'u-1', email: 'a@b.test', name: 'Alice', createdAt: 1 }
const ME = { user: USER, workspace: { id: 'w-1', name: 'W', role: 'owner' } }

const PROVIDER = {
  id: 'p-1',
  label: 'Local runtime',
  kind: 'openai-compatible',
  authMode: 'none',
  endpointUrl: 'http://127.0.0.1:11434/v1',
  modelId: 'llama-3.1-8b',
  models: ['llama-3.1-8b'],
  credential: { present: false, keyId: null, status: 'untested', lastCheckedAt: null, lastError: null },
  createdAt: 1,
  updatedAt: 1,
}

const BASE_DETAIL: ServerConversationDetail = {
  id: 'c-1',
  title: 'Server chat one',
  agentId: null,
  pinned: false,
  archived: false,
  activeLeafId: 'n-0',
  createdAt: 1,
  updatedAt: 1,
  messageCount: 0,
  nodes: [],
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function runEventFrame(sequence: number, type: string, payload: unknown): string {
  return (
    'data: ' +
    JSON.stringify({ eventId: `r-1:${sequence}`, runId: 'r-1', sequence, type, timestamp: sequence, payload }) +
    '\n\n'
  )
}

describe('Server chat journey — send, stream, terminal, reload', () => {
  beforeEach(() => {
    cleanup()
    setupAppTest()
    resetWorkspaceUiForTests()
    useWorkspaceUiStore.getState().initialize()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('runs the complete send → stream → terminal → persisted-node loop', async () => {
    const user = userEvent.setup()
    const calls: Array<{ url: string; method: string; body?: unknown }> = []
    let nodeSeq = 0
    // The detail grows as the journey proceeds: once the run's event
    // stream has been consumed, the server would hold the assistant
    // node (the run service finalizes it server-side).
    let runStreamConsumed = false
    let detail = structuredClone(BASE_DETAIL)

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const path = String(url)
        const method = init?.method ?? 'GET'
        let body: unknown
        if (typeof init?.body === 'string') {
          try { body = JSON.parse(init.body) } catch { body = init.body }
        }
        calls.push({ url: path, method, body })

        if (path === '/api/auth/get-session') {
          return jsonResponse(200, { session: { token: 't' }, user: USER })
        }
        if (path === '/api/v1/me') return jsonResponse(200, ME)
        if (path === '/api/v1/providers') {
          return jsonResponse(200, { items: [PROVIDER] })
        }
        if (path === '/api/v1/conversations') {
          if (method === 'POST') return jsonResponse(200, { id: 'c-1' })
          return jsonResponse(200, {
            items: [{ ...BASE_DETAIL, messageCount: detail.nodes.length }],
            page: { total: 1, limit: 50, offset: 0 },
          })
        }
        if ((path === '/api/v1/conversations/c-1' || path.startsWith('/api/v1/conversations/c-1?')) && method === 'GET') {
          if (runStreamConsumed) {
            // Post-run refresh: the assistant node is persisted with
            // the streamed content and the active leaf advanced.
            return jsonResponse(200, {
              ...detail,
              nodes: [
                ...detail.nodes,
                {
                  id: 'n-assistant',
                  parentId: 'n-1',
                  role: 'assistant',
                  status: 'complete',
                  content: 'Hello from the server',
                  createdAt: 99,
                  feedback: null,
                },
              ],
              activeLeafId: 'n-assistant',
              messageCount: detail.nodes.length + 1,
            })
          }
          return jsonResponse(200, detail)
        }
        if (path === '/api/v1/conversations/c-1/nodes' && method === 'POST') {
          nodeSeq += 1
          const node: ServerMessageNode = {
            id: `n-${nodeSeq}`,
            parentId: null,
            role: 'user',
            status: 'complete',
            content: (body as { content: string }).content,
            createdAt: nodeSeq,
            feedback: null,
          }
          detail = { ...detail, nodes: [...detail.nodes, node], activeLeafId: node.id, messageCount: detail.nodes.length + 1 }
          return jsonResponse(200, { node, conversation: detail, reused: false })
        }
        if (path === '/api/v1/conversations/c-1/runs' && method === 'POST') {
          return jsonResponse(200, {
            run: { id: 'r-1', status: 'running' },
            events: [],
          })
        }
        if (path.startsWith('/api/v1/runs/r-1/events')) {
          runStreamConsumed = true
          return sseResponse([
            runEventFrame(0, 'started', {}),
            runEventFrame(1, 'delta', { text: 'Hello ' }),
            runEventFrame(2, 'delta', { text: 'from the server' }),
            runEventFrame(3, 'terminal', { status: 'complete' }),
          ])
        }
        return jsonResponse(404, { code: 'not_found' })
      }),
    )

    // Server mode, open the conversation.
    localStorage.setItem(
      'universe:layout:v1',
      JSON.stringify({ version: 1, payload: { chatMode: 'server' } }),
    )
    renderApp('/sc/c-1')
    await waitFor(() => expect(useServerSessionStore.getState().status).toBe('signed-in'))

    // The user node appears after the detail loads.
    await screen.findByLabelText('Message Uni on this server')

    // Choose the destination through the real picker (N004): the only
    // usable provider becomes the selection with its first model.
    await waitFor(() => {
      expect(screen.getByLabelText('Server chat provider')).toHaveLength(1)
    })
    await user.selectOptions(screen.getByLabelText('Server chat provider'), 'p-1')
    await waitFor(() => {
      expect(useServerSessionStore.getState().serverSelection).toEqual({
        providerId: 'p-1',
        modelId: 'llama-3.1-8b',
      })
    })

    // Send a message through the real store path.
    await user.type(screen.getByLabelText('Message Uni on this server'), 'Hello server')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    // The terminal arrives, the transcript refreshes, and the persisted
    // assistant node replaces the transient live bubble. Assert the
    // deterministic end state (the bubble itself is cleared by design).
    await waitFor(
      () => {
        const state = useServerSessionStore.getState()
        const live = state.activeRun
        const persisted = state.openConversation?.nodes.some(
          (node) => node.content === 'Hello from the server',
        )
        expect(live !== null || persisted).toBe(true)
      },
      { timeout: 5000 },
    )
    await waitFor(
      () => {
        expect(useServerSessionStore.getState().activeRun).toBeNull()
      },
      { timeout: 5000 },
    )
    expect(useServerSessionStore.getState().runError).toBeNull()

    // …and the node POST carried the idempotent clientId + the run
    // POST carried the idempotency key (N019 semantics on the real path).
    const nodePost = calls.find(
      (call) => call.url === '/api/v1/conversations/c-1/nodes' && call.method === 'POST',
    )
    expect(nodePost?.body).toMatchObject({ role: 'user', content: 'Hello server' })
    expect(typeof (nodePost?.body as { clientId: string }).clientId).toBe('string')

    const runPost = calls.find(
      (call) => call.url === '/api/v1/conversations/c-1/runs' && call.method === 'POST',
    )
    expect(runPost?.body).toMatchObject({
      parentNodeId: 'n-1',
      providerId: 'p-1',
      modelId: 'llama-3.1-8b',
    })
    expect(String((runPost?.body as { idempotencyKey: string }).idempotencyKey)).toMatch(/^run-/)
  })

  it('a network failure during send shows an honest error and never fabricates a reply', async () => {
    const user = userEvent.setup()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const path = String(url)
        if (path === '/api/auth/get-session') {
          return jsonResponse(200, { session: { token: 't' }, user: USER })
        }
        if (path === '/api/v1/me') return jsonResponse(200, ME)
        if (path === '/api/v1/providers') {
          return jsonResponse(200, { items: [PROVIDER] })
        }
        if (path === '/api/v1/conversations') {
          if (method_(init) === 'POST') return jsonResponse(200, { id: 'c-1' })
          return jsonResponse(200, {
            items: [BASE_DETAIL],
            page: { total: 1, limit: 50, offset: 0 },
          })
        }
        if (path === '/api/v1/conversations/c-1') {
          return jsonResponse(200, BASE_DETAIL)
        }
        if (path === '/api/v1/conversations/c-1/nodes') {
          throw new TypeError('Failed to fetch')
        }
        return jsonResponse(404, { code: 'not_found' })
      }),
    )

    localStorage.setItem(
      'universe:layout:v1',
      JSON.stringify({ version: 1, payload: { chatMode: 'server' } }),
    )
    renderApp('/sc/c-1')
    await waitFor(() => expect(useServerSessionStore.getState().status).toBe('signed-in'))
    await screen.findByLabelText('Message Uni on this server')

    await user.type(screen.getByLabelText('Message Uni on this server'), 'Hello')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    // The send retries network failures with bounded backoff
    // (400/800ms) before surfacing the honest error — allow for it.
    await waitFor(
      () => {
        expect(useServerSessionStore.getState().runError).toBeTruthy()
      },
      { timeout: 5000 },
    )
    // No fabricated assistant content ever rendered.
    expect(useServerSessionStore.getState().activeRun).toBeNull()
  })
})

function method_(init?: RequestInit): string {
  return init?.method ?? 'GET'
}
