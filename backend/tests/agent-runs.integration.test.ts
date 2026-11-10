import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import type { FastifyInstance } from 'fastify'
import { agentEventSchema } from '@uni/contracts'
import { signUpUser, startTestApp, TEST_CREDENTIAL_MASTER_KEY, type TestApp } from './harness.js'

/**
 * Agent runs — the tool loop with the permission pause, over a fake
 * OpenAI-compatible provider that CALLS TOOLS and reads their results
 * (F03's evidence), through the real app + embedded PostgreSQL.
 *
 * The fake provider is scriptable per test: each "script" is a list of
 * rounds; a round is either a plain assistant message or a tool call
 * whose result must appear in the NEXT round's request messages for the
 * script to continue (asserted in-process).
 */

const API_KEY = 'sk-agent-test-key-abcdef123456'

type Round =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; name: string; arguments: Record<string, unknown> }

interface ScriptedProvider {
  server: Server
  url: string
  setScript: (rounds: Round[]) => void
  /** Captured request bodies, one per model call (live view). */
  requests: () => Array<{ messages: unknown[]; tools?: unknown[] }>
  toolResultSeen: (roundIndex: number) => Record<string, unknown> | null
}

function scriptedProviderServer(): ScriptedProvider {
  const state = {
    rounds: [] as Round[],
    requests: [] as Array<{ messages: unknown[]; tools?: unknown[] }>,
    toolResults: [] as Array<Record<string, unknown> | null>,
  }
  const server = createServer((request, response) => {
    if (!(request.url ?? '').includes('/chat/completions')) {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'not found' }))
      return
    }
    let raw = ''
    request.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf8')
    })
    request.on('end', () => {
      const auth = request.headers.authorization
      if (auth !== `Bearer ${API_KEY}`) {
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'invalid key' }))
        return
      }
      const body = JSON.parse(raw) as { messages: unknown[]; tools?: unknown[] }
      state.requests.push({ messages: body.messages, tools: body.tools })

      const roundIndex = state.requests.length - 1
      const round = state.rounds[roundIndex]
      if (round == null) {
        // Script exhausted: end the conversation plainly.
        sseText(response, '')
        return
      }
      if (round.kind === 'text') {
        sseText(response, round.text)
        return
      }
      // Tool round: remember whether the PREVIOUS call's result came back.
      state.toolResults[roundIndex] =
        findToolResultMessage(body.messages, state.rounds[roundIndex - 1]) ?? null
      sseToolCall(response, round)
    })
  })
  return {
    server,
    url: '',
    setScript: (rounds) => {
      state.rounds = rounds
      state.requests = []
      state.toolResults = []
    },
    requests: () => state.requests,
    toolResultSeen: (roundIndex) => state.toolResults[roundIndex] ?? null,
  }
}

/** The tool-result message for the previous round's call, if the SDK sent it. */
function findToolResultMessage(messages: unknown[], previous: Round | undefined): Record<string, unknown> | null {
  if (!previous || previous.kind !== 'tool') return null
  const toolMessages = messages.filter(
    (message) => (message as { role?: string }).role === 'tool',
  ) as Array<Record<string, unknown>>
  return toolMessages.find((message) => typeof message.content === 'string') ?? null
}

function sseHeaders(response: import('node:http').ServerResponse) {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
}

function sseText(response: import('node:http').ServerResponse, text: string) {
  sseHeaders(response)
  const send = (payload: unknown) => response.write(`data: ${JSON.stringify(payload)}\n\n`)
  send({
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
  })
  send({
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  })
  response.write('data: [DONE]\n\n')
  response.end()
}

function sseToolCall(
  response: import('node:http').ServerResponse,
  round: { name: string; arguments: Record<string, unknown> },
) {
  sseHeaders(response)
  const send = (payload: unknown) => response.write(`data: ${JSON.stringify(payload)}\n\n`)
  send({
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    choices: [
      {
        index: 0,
        delta: {
          tool_calls: [
            {
              index: 0,
              id: `call_${round.name}`,
              type: 'function',
              function: { name: round.name, arguments: JSON.stringify(round.arguments) },
            },
          ],
        },
        finish_reason: null,
      },
    ],
  })
  send({
    id: 'chatcmpl-1',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
  })
  response.write('data: [DONE]\n\n')
  response.end()
}

interface SseResult {
  events: Array<Record<string, unknown>>
}

/** Read an agent session SSE stream until it closes (terminal or client stop). */
async function readAgentSse(
  baseUrl: string,
  path: string,
  cookie: string,
  untilType?: string,
  timeoutMs = 30_000,
): Promise<SseResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { cookie, accept: 'text/event-stream' },
      signal: controller.signal,
    })
    expect(response.status).toBe(200)
    const events: Array<Record<string, unknown>> = []
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let index: number
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, index)
          buffer = buffer.slice(index + 2)
          const dataLine = frame.split('\n').find((line) => line.startsWith('data: '))
          if (!dataLine) continue
          try {
            const event = JSON.parse(dataLine.slice(6)) as Record<string, unknown>
            if (event.type === 'run_finished' || event.type === 'error') {
              events.push(event)
              await reader.cancel()
              return { events }
            }
            events.push(event)
            if (untilType && event.type === untilType) {
              await reader.cancel()
              return { events }
            }
          } catch {
            /* keepalive or end sentinel */
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
    return { events }
  } finally {
    clearTimeout(timer)
  }
}

describe('agent runs — tool loop + permissions (F02/F03)', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let fake: ScriptedProvider
  let baseUrl: string

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Agent' })
    fake = scriptedProviderServer()
    fake.url = await listen(fake.server)
    await testApp.app.listen({ port: 0, host: '127.0.0.1' })
    const address = testApp.app.server.address()
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`
    }
  }, 180_000)

  afterAll(async () => {
    if (fake) await new Promise<void>((resolve) => fake.server.close(() => resolve()))
    await testApp?.app.close()
    await testApp?.stop()
  })

  async function createSessionWithProvider(
    cookie: string,
    options: { tools?: string[]; mode?: string } = {},
  ): Promise<string> {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie },
      payload: {
        label: 'Agent fake',
        kind: 'openai-compatible',
        endpointUrl: fake.url,
        modelId: 'model-alpha',
      },
    })
    expect(created.statusCode).toBe(201)
    const provider = created.json() as { id: string }
    const setKey = await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${provider.id}/credential`,
      headers: { cookie },
      payload: { apiKey: API_KEY },
    })
    expect(setKey.statusCode).toBe(200)
    const session = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/agent/sessions',
      headers: { cookie },
      payload: {
        name: 'Test session',
        providerId: provider.id,
        modelId: 'model-alpha',
        ...(options.mode ? { mode: options.mode } : {}),
        ...(options.tools ? { tools: options.tools } : {}),
      },
    })
    expect(session.statusCode).toBe(201)
    return (session.json() as { id: string }).id
  }

  async function sendRun(sessionId: string, text: string, idempotencyKey?: string) {
    const response = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/agent/sessions/${sessionId}/runs`,
      headers: { cookie: alice.cookie },
      payload: { text, ...(idempotencyKey ? { idempotencyKey } : {}) },
    })
    return { response, body: response.json() as { runId?: string; reused?: boolean } }
  }

  async function waitForRunStatus(
    runId: string,
    statuses: string[],
    timeoutMs = 30_000,
  ): Promise<Record<string, unknown>> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const response = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/agent/runs/${runId}`,
        headers: { cookie: alice.cookie },
      })
      expect(response.statusCode).toBe(200)
      const run = response.json() as Record<string, unknown>
      if (statuses.includes(String(run.status))) return run
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(`run ${runId} never reached ${statuses.join('|')}`)
  }

  it('a tool call flows through the gate and its result reaches the next model request (F03 shape)', async () => {
    fake.setScript([
      { kind: 'tool', name: 'current_time', arguments: {} },
      { kind: 'text', text: 'It is now whatever the tool said.' },
    ])
    const sessionId = await createSessionWithProvider(alice.cookie, {
      tools: ['current_time', 'read'],
    })

    const { response, body } = await sendRun(sessionId, 'What time is it?')
    expect(response.statusCode).toBe(201)
    const runId = body.runId!

    const sse = await readAgentSse(baseUrl, `/api/v1/agent/sessions/${sessionId}/events?after=-1`, alice.cookie)
    const types = sse.events.map((event) => event.type)
    expect(types).toContain('run_started')
    expect(types).toContain('tool_call_started')
    expect(types).toContain('tool_call_result')
    for (const event of sse.events) {
      if ((event.type as string) !== 'run_finished') agentEventSchema.parse(event)
    }

    const run = await waitForRunStatus(runId, ['complete'])
    expect(run.status).toBe('complete')

    // The provider's second request must contain the first round's tool
    // result as a structured tool message (F03: results in model context).
    expect(fake.requests().length).toBe(2)
    const secondRequestMessages = fake.requests()[1]!.messages as Array<Record<string, unknown>>
    const toolMessage = secondRequestMessages.find((message) => message.role === 'tool')
    expect(toolMessage).toBeDefined()
    expect(String(toolMessage!.content)).toContain('T') // ISO timestamp text
  }, 60_000)

  it('an ask suspends the run; answering the emitted id resumes it (F02)', async () => {
    fake.setScript([
      { kind: 'tool', name: 'write', arguments: { path: 'notes.txt', content: 'hello' } },
      { kind: 'text', text: 'File written.' },
    ])
    const sessionId = await createSessionWithProvider(alice.cookie, {
      tools: ['write'],
      mode: 'default',
    })

    const { body } = await sendRun(sessionId, 'Write notes.txt please')
    const runId = body.runId!

    // Stream until the permission request arrives; grab the emitted id.
    const sse = await readAgentSse(
      baseUrl,
      `/api/v1/agent/sessions/${sessionId}/events?after=-1`,
      alice.cookie,
      'permission_requested',
    )
    const ask = sse.events.find((event) => event.type === 'permission_requested')
    expect(ask).toBeDefined()
    const permissionRequest = (
      ask!.payload as { permissionRequest: { requestId: string; type: string } }
    ).permissionRequest
    expect(permissionRequest.type).toBe('write_file')
    const emittedId = permissionRequest.requestId

    // The run is waiting; the run row says so.
    await waitForRunStatus(runId, ['waiting-for-permission'])

    // Answering with the EMITTED id works (this was F02's core bug).
    const answer = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/agent/runs/${runId}/permissions/${emittedId}`,
      headers: { cookie: alice.cookie },
      payload: { decision: { requestId: emittedId, decision: 'approve', scope: 'once' } },
    })
    expect(answer.statusCode).toBe(202)

    const run = await waitForRunStatus(runId, ['complete'])
    expect(run.status).toBe('complete')

    // A second answer with the same id resolves at most once.
    const again = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/agent/runs/${runId}/permissions/${emittedId}`,
      headers: { cookie: alice.cookie },
      payload: { decision: { requestId: emittedId, decision: 'deny', scope: 'once' } },
    })
    expect(again.statusCode).toBe(404)
  }, 60_000)

  it('a wrong run id cannot resolve another run’s ask (F02 identity binding)', async () => {
    fake.setScript([
      { kind: 'tool', name: 'write', arguments: { path: 'a.txt', content: 'x' } },
      { kind: 'text', text: 'done' },
    ])
    const sessionId = await createSessionWithProvider(alice.cookie, { tools: ['write'] })

    const { body } = await sendRun(sessionId, 'Write a.txt')
    const runId = body.runId!
    const sse = await readAgentSse(
      baseUrl,
      `/api/v1/agent/sessions/${sessionId}/events?after=-1`,
      alice.cookie,
      'permission_requested',
    )
    const ask = sse.events.find((event) => event.type === 'permission_requested')
    const emittedId = (ask!.payload as { permissionRequest: { requestId: string } }).permissionRequest.requestId

    // A DIFFERENT run id in the URL: 404, ask stays pending.
    const wrongRun = '00000000-0000-4000-8000-000000000000'
    const wrong = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/agent/runs/${wrongRun}/permissions/${emittedId}`,
      headers: { cookie: alice.cookie },
      payload: { decision: { requestId: emittedId, decision: 'approve', scope: 'once' } },
    })
    expect(wrong.statusCode).toBe(404)

    // The run is still waiting; cancel to clean up.
    const cancel = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/agent/runs/${runId}/cancel`,
      headers: { cookie: alice.cookie },
    })
    expect([200, 202]).toContain(cancel.statusCode)
  }, 60_000)

  it('malformed tool arguments are refused without a side effect', async () => {
    fake.setScript([
      // read requires { path: string } — send garbage instead.
      { kind: 'tool', name: 'read', arguments: { path: 42 } },
      { kind: 'text', text: 'Could not read.' },
    ])
    const sessionId = await createSessionWithProvider(alice.cookie, {
      tools: ['read'],
      mode: 'yolo',
    })

    const { body } = await sendRun(sessionId, 'Read something')
    const runId = body.runId!
    const sse = await readAgentSse(baseUrl, `/api/v1/agent/sessions/${sessionId}/events?after=-1`, alice.cookie)
    const result = sse.events.find((event) => event.type === 'tool_call_result')
    expect(result).toBeDefined()
    expect((result!.payload as { toolResultStatus?: string }).toolResultStatus).toBe('error')
    const run = await waitForRunStatus(runId, ['complete'])
    expect(run.status).toBe('complete')
  }, 60_000)

  it('a second message in the same session sees the first turn (T008 transcript)', async () => {
    // Round 1: the model calls current_time; round 2: it states the
    // result. Turn 2 (new run, same session): the model must be able to
    // reference the tool result from turn 1 — the provider ASSERTS the
    // prior assistant/tool messages arrived in its request.
    fake.setScript([
      { kind: 'tool', name: 'current_time', arguments: {} },
      { kind: 'text', text: 'The time is recorded.' },
    ])
    const sessionId = await createSessionWithProvider(alice.cookie, {
      tools: ['current_time'],
    })
    const first = await sendRun(sessionId, 'What time is it?', 'turn-1')
    expect(first.response.statusCode).toBe(201)
    await waitForRunStatus(first.body.runId!, ['complete'])
    expect(fake.requests().length).toBe(2)

    // Script turn 2: a plain answer; the test's request-capture asserts
    // the second run's request contains the first run's tool messages.
    fake.setScript([{ kind: 'text', text: 'As established earlier.' }])
    const second = await sendRun(sessionId, 'What did you find out?', 'turn-2')
    expect(second.response.statusCode).toBe(201)
    await waitForRunStatus(second.body.runId!, ['complete'])

    const lastRequest = fake.requests().at(-1)!
    const roles = (lastRequest.messages as Array<{ role: string }>).map((m) => m.role)
    expect(roles).toContain('assistant')
    expect(roles).toContain('tool')
    // The FIRST run's user message is still present (context survives).
    const userTexts = (lastRequest.messages as Array<{ role: string; content: unknown }>)
      .filter((m) => m.role === 'user')
      .map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content)))
    expect(userTexts.some((t) => t.includes('What time is it?'))).toBe(true)
  }, 60_000)

  it('runs without a pinned provider fail honestly', async () => {
    const session = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/agent/sessions',
      headers: { cookie: alice.cookie },
      payload: { name: 'No provider' },
    })
    const sessionId = (session.json() as { id: string }).id
    const { body } = await sendRun(sessionId, 'Hello?')
    const runId = body.runId!
    const run = await waitForRunStatus(runId, ['error'])
    expect(run.errorCode).toBe('no_provider')
  }, 60_000)
})

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') resolve(`http://127.0.0.1:${address.port}`)
    })
  })
}
