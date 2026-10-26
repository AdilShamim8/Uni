import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { employeeDtoSchema, errorEnvelopeSchema } from '@uni/contracts'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * B04 slice 4 — employee persona + memory + recall inside a streamed
 * run. A body-capturing fake provider receives the real outbound
 * request so the assertions check exactly what the provider sees:
 * the system prompt (persona + memory block) and the recall passages
 * riding in FRONT of the user's message, never inside the system.
 *
 * Also pins the regression that contract-schema validation failures
 * (thrown by @uni/contracts' own zod copy) surface as 400 validation
 * envelopes, not 500s.
 */

const API_KEY = 'sk-memory-run-key'

interface CapturedRequest {
  system?: string
  messages: Array<{ role: string; content: string }>
}

function capturingFakeProvider() {
  const captured: CapturedRequest[] = []
  const server = createServer((request, response) => {
    if (!(request.url ?? '').includes('/chat/completions')) {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'not found' }))
      return
    }
    if (request.headers.authorization !== `Bearer ${API_KEY}`) {
      response.writeHead(401, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'invalid key' }))
      return
    }
    let raw = ''
    request.on('data', (chunk: Buffer) => {
      raw += chunk.toString('utf8')
    })
    request.on('end', () => {
      try {
        const body = JSON.parse(raw) as CapturedRequest
        captured.push(body)
      } catch {
        captured.push({ messages: [] })
      }
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      })
      const send = (payload: unknown) => {
        response.write(`data: ${JSON.stringify(payload)}\n\n`)
      }
      send({
        id: 'chatcmpl-1',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content: 'Ack.' }, finish_reason: null }],
      })
      send({
        id: 'chatcmpl-1',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      })
      response.write('data: [DONE]\n\n')
      response.end()
    })
  })
  return { server, captured: () => captured }
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') resolve(`http://127.0.0.1:${address.port}`)
    })
  })
}

/** The OpenAI-compatible wire format maps the system prompt into the first message. */
function systemOf(request: CapturedRequest): string {
  const first = request.messages[0]
  if (first && first.role === 'system') return first.content
  return request.system ?? ''
}

describe('runs — employee persona, memory block, recall wiring', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let fake: ReturnType<typeof capturingFakeProvider>
  let fakeUrl: string

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Memory Run' })
    fake = capturingFakeProvider()
    fakeUrl = await listen(fake.server)
  }, 180_000)

  afterAll(async () => {
    await new Promise<void>((resolve) => fake.server.close(() => resolve()))
    await testApp.stop()
  })

  /** Create a fresh provider+credential and return its id (self-contained per test). */
  async function createProvider(cookie: string): Promise<string> {
    const provider = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie },
      payload: {
        label: 'Memory Fake',
        kind: 'openai-compatible',
        endpointUrl: `${fakeUrl}/v1`,
        modelId: 'model-alpha',
      },
    })
    expect(provider.statusCode).toBe(201)
    const providerDto = provider.json() as { id: string }
    const credential = await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${providerDto.id}/credential`,
      headers: { cookie },
      payload: { apiKey: API_KEY },
    })
    expect(credential.statusCode).toBe(200)
    return providerDto.id
  }

  async function createConversationWithNode(cookie: string, title: string, message: string, agentId?: string) {
    const conversation = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { cookie },
      payload: agentId ? { title, agentId } : { title },
    })
    expect(conversation.statusCode).toBe(201)
    const conversationDto = conversation.json() as { conversation: { id: string }; id: string }
    const conversationId = conversationDto.conversation?.id ?? conversationDto.id
    const node = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/nodes`,
      headers: { cookie },
      payload: { role: 'user', content: message, parentId: null, clientId: `node-${Math.random()}` },
    })
    expect(node.statusCode).toBe(201)
    const nodeDto = node.json() as { node: { id: string } }
    return { conversationId, nodeId: nodeDto.node.id }
  }

  async function startRun(cookie: string, conversationId: string, nodeId: string, providerId: string, key: string) {
    const started = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/runs`,
      headers: { cookie },
      payload: { parentNodeId: nodeId, providerId, idempotencyKey: key },
    })
    return started
  }

  async function waitForTerminal(cookie: string, runId: string): Promise<void> {
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      const response = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/runs/${runId}`,
        headers: { cookie },
      })
      expect(response.statusCode).toBe(200)
      const run = response.json() as { status: string }
      if (['complete', 'stopped', 'repetition_stopped', 'error'].includes(run.status)) return
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(`run ${runId} never reached a terminal state`)
  }

  it('sends persona + memory block as the system and recall in front of the user message', async () => {
    const providerId = await createProvider(alice.cookie)

    const employeeResponse = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/employees',
      headers: { cookie: alice.cookie },
      payload: {
        name: 'Scout',
        description: 'Research helper',
        instructions: 'You are Scout, a terse research assistant.',
      },
    })
    expect(employeeResponse.statusCode).toBe(201)
    const employee = employeeDtoSchema.parse(employeeResponse.json())

    await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/employees/${employee.id}/memory`,
      headers: { cookie: alice.cookie },
      payload: { text: '- 2026-03-01 · The quarterly budget review is scheduled for April' },
    })
    await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/employees/${employee.id}/memory`,
      headers: { cookie: alice.cookie },
      payload: { text: 'Prefers answers as bullet points' },
    })

    const { conversationId, nodeId } = await createConversationWithNode(
      alice.cookie,
      'Memory run',
      'What is the quarterly budget review schedule?',
      employee.id,
    )

    const before = fake.captured().length
    const started = await startRun(alice.cookie, conversationId, nodeId, providerId, 'mem-run-key-1')
    expect(started.statusCode).toBe(201)
    const startedDto = started.json() as { run: { id: string } }
    await waitForTerminal(alice.cookie, startedDto.run.id)

    const captured = fake.captured().slice(before)
    expect(captured.length).toBeGreaterThanOrEqual(1)
    const request = captured[captured.length - 1]!
    const system = systemOf(request)

    // System: persona REPLACES the base prompt; memory block joins it.
    expect(system).toContain('You are Scout, a terse research assistant.')
    expect(system).toContain('Known facts and preferences')
    expect(system).toContain('quarterly budget review is scheduled for April')
    expect(system).toContain('Prefers answers as bullet points')
    expect(system).not.toContain('You are Uni, a helpful assistant.')

    // The user message carries recall passages in FRONT, and the
    // original message survives after the close marker.
    const userMessage = request.messages.filter((m) => m.role === 'user').pop()
    expect(userMessage).toBeTruthy()
    expect(userMessage!.content.startsWith('Recalled for this message')).toBe(true)
    expect(userMessage!.content).toContain('[end of recalled passages — the message follows]')
    expect(userMessage!.content.endsWith('What is the quarterly budget review schedule?')).toBe(true)
    // Recall NEVER rides in the system prompt.
    expect(system).not.toContain('Recalled for this message')
  })

  it('degrades honestly to the base prompt for conversations without a server employee', async () => {
    const providerId = await createProvider(alice.cookie)
    const { conversationId, nodeId } = await createConversationWithNode(
      alice.cookie,
      'Plain run',
      'Just a plain question',
    )

    const before = fake.captured().length
    const started = await startRun(alice.cookie, conversationId, nodeId, providerId, 'plain-run-key-1')
    expect(started.statusCode).toBe(201)
    const startedDto = started.json() as { run: { id: string } }
    await waitForTerminal(alice.cookie, startedDto.run.id)

    const captured = fake.captured().slice(before)
    const request = captured[captured.length - 1]!
    expect(systemOf(request)).toBe('You are Uni, a helpful assistant.')
    const userMessage = request.messages.filter((m) => m.role === 'user').pop()
    expect(userMessage!.content).toBe('Just a plain question')
  })

  it('surfaces contract-schema validation failures as 400 envelopes, not 500s', async () => {
    const providerId = await createProvider(alice.cookie)
    const { conversationId, nodeId } = await createConversationWithNode(
      alice.cookie,
      'Validation run',
      'A message',
    )
    // providerId: null violates the contract schema (string, not null) —
    // historically this escaped as a 500 because the error came from
    // @uni/contracts' own zod copy and instanceof failed across copies.
    const invalid = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/runs`,
      headers: { cookie: alice.cookie },
      payload: { parentNodeId: nodeId, providerId: null, idempotencyKey: 'invalid-key-1' },
    })
    expect(invalid.statusCode).toBe(400)
    const envelope = errorEnvelopeSchema.parse(invalid.json())
    expect(envelope.code).toBe('validation_error')
    // Paths and messages only — never raw user values.
    expect(JSON.stringify(invalid.json())).toContain('providerId')

    // Sanity: a valid run on the same conversation still works.
    const valid = await startRun(alice.cookie, conversationId, nodeId, providerId, 'valid-key-1')
    expect(valid.statusCode).toBe(201)
  })
})
