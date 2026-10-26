import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { and, eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import {
  conversationDetailDtoSchema,
  createNodeRequestSchema,
  createRunResponseSchema,
  runDtoSchema,
  runEventSchema,
} from '@uni/contracts'
import { conversationNodes, runs } from '../src/db/schema.js'
import { createDatabase } from '../src/db/client.js'
import { signUpUser, startTestApp, TEST_CREDENTIAL_MASTER_KEY, type TestApp } from './harness.js'

/**
 * B03 slice 2 — streamed chat runs: create → execute against a local
 * fake provider → SSE event delivery → durable replay → cancel →
 * repetition guard → honest errors → workspace isolation.
 */

const API_KEY = 'sk-run-test-key-abcdef123456'

type FakeMode = 'normal' | 'slow' | 'loop' | 'error'

interface FakeProvider {
  server: Server
  url: string
  setMode: (mode: FakeMode) => void
  disconnects: () => number
}

function fakeProviderServer(): FakeProvider {
  let mode: FakeMode = 'normal'
  let disconnects = 0
  const server = createServer((request, response) => {
    if (!(request.url ?? '').includes('/chat/completions')) {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'not found' }))
      return
    }
    request.on('close', () => {
      disconnects += 1
    })

    const auth = request.headers.authorization
    if (auth !== `Bearer ${API_KEY}`) {
      response.writeHead(401, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'invalid key' }))
      return
    }

    if (mode === 'error') {
      response.writeHead(500, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: { message: 'boom from provider' } }))
      return
    }

    response.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
    })

    const send = (payload: unknown) => {
      response.write(`data: ${JSON.stringify(payload)}\n\n`)
    }
    const delta = (text: string) =>
      send({ id: 'chatcmpl-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })
    const finish = () => {
      send({ id: 'chatcmpl-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
      // OpenAI-compatible streams carry usage at the chunk top level.
      send({
        id: 'chatcmpl-1',
        object: 'chat.completion.chunk',
        choices: [],
        usage: { prompt_tokens: 12, completion_tokens: 7 },
      })
      response.write('data: [DONE]\n\n')
      response.end()
    }

    if (mode === 'normal') {
      for (const chunk of ['Live ', 'server ', 'reply ', 'from ', 'Uni.']) delta(chunk)
      finish()
      return
    }
    if (mode === 'loop') {
      // The recorded Ollama phrase loop that the vendored guard stops.
      // Sent fast and without a cap: the guard fires at ~16k chars, long
      // before this would end naturally, and the abort closes the socket.
      const phrase = ' Done, I will output it.'
      const timer = setInterval(() => {
        for (let index = 0; index < 12; index += 1) delta(phrase)
      }, 5)
      request.on('close', () => clearInterval(timer))
      return
    }
    if (mode === 'slow') {
      let sent = 0
      const timer = setInterval(() => {
        if (sent >= 120) {
          clearInterval(timer)
          finish()
          return
        }
        delta(`chunk-${sent} `)
        sent += 1
      }, 50)
      request.on('close', () => clearInterval(timer))
    }
  })
  return {
    server,
    url: '',
    setMode: (next) => {
      mode = next
    },
    disconnects: () => disconnects,
  }
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') resolve(`http://127.0.0.1:${address.port}`)
    })
  })
}

interface SseResult {
  events: Array<Record<string, unknown>>
  raw: string
}

/** Read an SSE endpoint over real HTTP until it closes. */
async function readSse(baseUrl: string, path: string, cookie: string): Promise<SseResult> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { cookie, accept: 'text/event-stream' },
  })
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toContain('text/event-stream')
  const body = await response.text()
  const events: Array<Record<string, unknown>> = []
  for (const frame of body.split('\n\n')) {
    const dataLine = frame
      .split('\n')
      .find((line) => line.startsWith('data: '))
    if (!dataLine) continue
    try {
      events.push(JSON.parse(dataLine.slice(6)))
    } catch {
      /* keepalive or non-JSON frame */
    }
  }
  return { events, raw: body }
}

/** Read SSE events until a terminal event arrives (bounded wait). */
async function readSseUntilTerminal(
  baseUrl: string,
  path: string,
  cookie: string,
): Promise<SseResult> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { cookie, accept: 'text/event-stream' },
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
          events.push(event)
          if ((event.type as string) === 'terminal') {
            await reader.cancel()
            return { events, raw: '' }
          }
        } catch {
          /* keepalive */
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
  return { events, raw: '' }
}

describe('runs — streamed execution, events, cancel, guard', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let bob: { cookie: string }
  let fake: FakeProvider
  let baseUrl: string

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Runs' })
    bob = await signUpUser(testApp.app, { name: 'Bob Runs' })
    fake = fakeProviderServer()
    fake.url = await listen(fake.server)
    await testApp.app.listen({ port: 0, host: '127.0.0.1' })
    const address = testApp.app.server.address()
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`
    }
  }, 180_000)

  afterAll(async () => {
    await new Promise<void>((resolve) => fake.server.close(() => resolve()))
    await testApp.app.close()
    await testApp.stop()
  })

  async function createProviderAndCredential(cookie: string): Promise<string> {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie },
      payload: {
        label: 'Run fake',
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
    return provider.id
  }

  async function createConversationWithUserNode(cookie: string, prompt = 'Say something live.') {
    const conversationResponse = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { cookie },
      payload: { title: 'Run test' },
    })
    expect(conversationResponse.statusCode).toBe(201)
    const conversation = conversationResponse.json() as { id: string }
    const nodeBody = createNodeRequestSchema.parse({
      role: 'user',
      content: prompt,
      status: 'complete',
    })
    const nodeResponse = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversation.id}/nodes`,
      headers: { cookie },
      payload: nodeBody,
    })
    expect(nodeResponse.statusCode).toBe(201)
    const node = (nodeResponse.json() as { node: { id: string } }).node
    return { conversationId: conversation.id, nodeId: node.id }
  }

  async function startRun(
    cookie: string,
    conversationId: string,
    parentNodeId: string,
    providerId: string,
    idempotencyKey?: string,
  ) {
    const response = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/runs`,
      headers: { cookie },
      payload: { parentNodeId, providerId, idempotencyKey },
    })
    return { response, body: response.json() as Record<string, unknown> }
  }

  async function waitForRunStatus(runId: string, cookie: string, statuses: string[], timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const response = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/runs/${runId}`,
        headers: { cookie },
      })
      expect(response.statusCode).toBe(200)
      const run = runDtoSchema.parse(response.json())
      if (statuses.includes(run.status)) return run
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(`run ${runId} never reached ${statuses.join('|')}`)
  }

  it('creates, streams, and completes a run end to end', async () => {
    fake.setMode('normal')
    const providerId = await createProviderAndCredential(alice.cookie)
    const { conversationId, nodeId } = await createConversationWithUserNode(alice.cookie)

    const { response, body } = await startRun(alice.cookie, conversationId, nodeId, providerId, 'e2e-key-1')
    expect(response.statusCode).toBe(201)
    const created = createRunResponseSchema.parse(body)
    expect(created.reused).toBe(false)
    expect(created.run.status).toBe('running')
    expect(created.events.map((event) => event.type)).toEqual(['started'])

    // Live SSE: started (replayed) + deltas + usage + terminal complete.
    const sse = await readSseUntilTerminal(baseUrl, `/api/v1/runs/${created.run.id}/events?after=0`, alice.cookie)
    const types = sse.events.map((event) => event.type)
    expect(types[0]).toBe('started')
    expect(types).toContain('delta')
    expect(types).toContain('usage')
    const terminal = sse.events.find((event) => event.type === 'terminal')
    expect((terminal?.payload as Record<string, unknown>)?.status).toBe('complete')

    const finalRun = await waitForRunStatus(created.run.id, alice.cookie, ['complete'])
    expect(finalRun.outputText).toContain('Live server reply')
    expect(finalRun.terminalAt).not.toBeNull()

    // The transcript gained a truthful assistant node (reload-visible).
    const detail = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${conversationId}`,
      headers: { cookie: alice.cookie },
    })
    const parsed = conversationDetailDtoSchema.parse(detail.json())
    const assistant = parsed.nodes.find((node) => node.role === 'assistant')
    expect(assistant?.status).toBe('complete')
    expect(assistant?.content).toContain('Live server reply')
    expect(assistant?.parentId).toBe(nodeId)

    // Durable replay after the fact returns the same ordered events.
    const replay = await readSse(baseUrl, `/api/v1/runs/${created.run.id}/events?after=0`, alice.cookie)
    expect(replay.events.map((event) => event.type)).toEqual(types)
    const partial = await readSse(baseUrl, `/api/v1/runs/${created.run.id}/events?after=1`, alice.cookie)
    expect(partial.events.every((event) => (event.sequence as number) > 1)).toBe(true)
    for (const event of replay.events) runEventSchema.parse(event)
  })

  it('is idempotent: the same key returns the same run without re-executing', async () => {
    fake.setMode('normal')
    const providerId = await createProviderAndCredential(alice.cookie)
    const { conversationId, nodeId } = await createConversationWithUserNode(alice.cookie)

    const first = await startRun(alice.cookie, conversationId, nodeId, providerId, 'idem-key-1')
    expect(first.response.statusCode).toBe(201)
    const createdRun = (first.body as { run: { id: string } }).run.id
    await waitForRunStatus(createdRun, alice.cookie, ['complete'])

    const second = await startRun(alice.cookie, conversationId, nodeId, providerId, 'idem-key-1')
    expect(second.response.statusCode).toBe(200)
    const reused = createRunResponseSchema.parse(second.body)
    expect(reused.reused).toBe(true)
    expect(reused.run.id).toBe(createdRun)
    expect(reused.run.status).toBe('complete')

    // Only one assistant node was added to the conversation.
    const detail = conversationDetailDtoSchema.parse(
      (
        await testApp.app.inject({
          method: 'GET',
          url: `/api/v1/conversations/${conversationId}`,
          headers: { cookie: alice.cookie },
        })
      ).json(),
    )
    expect(detail.nodes.filter((node) => node.role === 'assistant')).toHaveLength(1)
  })

  it('cancels a running run: durable stopping with partial output', async () => {
    fake.setMode('slow')
    const providerId = await createProviderAndCredential(alice.cookie)
    const { conversationId, nodeId } = await createConversationWithUserNode(alice.cookie)

    const { body } = await startRun(alice.cookie, conversationId, nodeId, providerId, undefined)
    const runId = (body as { run: { id: string } }).run.id
    await new Promise((resolve) => setTimeout(resolve, 400))

    const cancel = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/runs/${runId}/cancel`,
      headers: { cookie: alice.cookie },
    })
    expect(cancel.statusCode).toBe(200)
    expect((cancel.json() as { run: { status: string } }).run.status).toMatch(/stopped|cancelling/)

    const stopped = await waitForRunStatus(runId, alice.cookie, ['stopped'])
    expect(stopped.terminalAt).not.toBeNull()
    // Partial output was preserved (chunks streamed before cancel).
    expect(stopped.outputText).toMatch(/chunk-\d/)

    // The transcript node records the honest stopped state.
    const detail = conversationDetailDtoSchema.parse(
      (
        await testApp.app.inject({
          method: 'GET',
          url: `/api/v1/conversations/${conversationId}`,
          headers: { cookie: alice.cookie },
        })
      ).json(),
    )
    const assistant = detail.nodes.find((node) => node.role === 'assistant')
    expect(assistant?.status).toBe('stopped')

    // Cancelling again is a no-op (idempotent).
    const again = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/runs/${runId}/cancel`,
      headers: { cookie: alice.cookie },
    })
    expect(again.statusCode).toBe(200)
    expect((again.json() as { run: { status: string } }).run.status).toBe('stopped')
  })

  it('stops repetitive output honestly (vendored guard) instead of calling it complete', async () => {
    fake.setMode('loop')
    const providerId = await createProviderAndCredential(alice.cookie)
    const { conversationId, nodeId } = await createConversationWithUserNode(alice.cookie)

    const { body } = await startRun(alice.cookie, conversationId, nodeId, providerId, undefined)
    const runId = (body as { run: { id: string } }).run.id

    const ended = await waitForRunStatus(
      runId,
      alice.cookie,
      ['repetition_stopped', 'error', 'complete', 'stopped'],
      30_000,
    )
    expect(ended.status).toBe('repetition_stopped')
    expect(ended.outputText.length).toBeGreaterThan(0)

    const detail = conversationDetailDtoSchema.parse(
      (
        await testApp.app.inject({
          method: 'GET',
          url: `/api/v1/conversations/${conversationId}`,
          headers: { cookie: alice.cookie },
        })
      ).json(),
    )
    const assistant = detail.nodes.find((node) => node.role === 'assistant')
    expect(assistant?.status).toBe('stopped')
    expect(assistant?.statusPrefix).toContain('repetitive')
  }, 60_000)

  it('records provider failures as error, never complete', async () => {
    fake.setMode('error')
    const providerId = await createProviderAndCredential(alice.cookie)
    const { conversationId, nodeId } = await createConversationWithUserNode(alice.cookie)

    const { body } = await startRun(alice.cookie, conversationId, nodeId, providerId, undefined)
    const runId = (body as { run: { id: string } }).run.id
    const failed = await waitForRunStatus(runId, alice.cookie, ['error'])
    expect(failed.errorCode).toBeTruthy()
    expect(failed.errorMessage).toBeTruthy()
    expect(failed.status).not.toBe('complete')

    const detail = conversationDetailDtoSchema.parse(
      (
        await testApp.app.inject({
          method: 'GET',
          url: `/api/v1/conversations/${conversationId}`,
          headers: { cookie: alice.cookie },
        })
      ).json(),
    )
    const assistant = detail.nodes.find((node) => node.role === 'assistant')
    expect(assistant?.status).toBe('error')
  })

  it('enforces workspace isolation on create, read, events, and cancel', async () => {
    fake.setMode('normal')
    const providerId = await createProviderAndCredential(alice.cookie)
    const { conversationId, nodeId } = await createConversationWithUserNode(alice.cookie)

    // Bob cannot start a run in Alice's conversation.
    const crossCreate = await startRun(bob.cookie, conversationId, nodeId, providerId, undefined)
    expect(crossCreate.response.statusCode).toBe(404)

    const { body } = await startRun(alice.cookie, conversationId, nodeId, providerId, 'iso-key')
    const runId = (body as { run: { id: string } }).run.id

    const crossRun = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/runs/${runId}`,
      headers: { cookie: bob.cookie },
    })
    expect(crossRun.statusCode).toBe(404)

    const crossEvents = await fetch(`${baseUrl}/api/v1/runs/${runId}/events?after=0`, {
      headers: { cookie: bob.cookie },
    })
    expect(crossEvents.status).toBe(404)
    await crossEvents.text()

    const crossCancel = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/runs/${runId}/cancel`,
      headers: { cookie: bob.cookie },
    })
    expect(crossCancel.statusCode).toBe(404)

    // Alice's own provider cannot be used by Bob for a run.
    const bobConversation = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { cookie: bob.cookie },
      payload: { title: 'Bob run test' },
    })
    const bobConversationId = (bobConversation.json() as { id: string }).id
    const bobNode = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${bobConversationId}/nodes`,
      headers: { cookie: bob.cookie },
      payload: { role: 'user', content: 'hi', status: 'complete' },
    })
    const bobNodeId = (bobNode.json() as { node: { id: string } }).node.id
    const crossProvider = await startRun(bob.cookie, bobConversationId, bobNodeId, providerId, undefined)
    expect(crossProvider.response.statusCode).toBe(404)
    await waitForRunStatus(runId, alice.cookie, ['complete'])
  })

  it('enforces the per-workspace concurrency limit', async () => {
    fake.setMode('slow')
    const providerId = await createProviderAndCredential(alice.cookie)
    const first = await createConversationWithUserNode(alice.cookie, 'one')
    const second = await createConversationWithUserNode(alice.cookie, 'two')
    const third = await createConversationWithUserNode(alice.cookie, 'three')

    const runOne = await startRun(alice.cookie, first.conversationId, first.nodeId, providerId, undefined)
    const runTwo = await startRun(alice.cookie, second.conversationId, second.nodeId, providerId, undefined)
    expect(runOne.response.statusCode).toBe(201)
    expect(runTwo.response.statusCode).toBe(201)

    const runThree = await startRun(alice.cookie, third.conversationId, third.nodeId, providerId, undefined)
    expect(runThree.response.statusCode).toBe(429)

    for (const run of [runOne, runTwo]) {
      const runId = (run.body as { run: { id: string } }).run.id
      await testApp.app.inject({
        method: 'POST',
        url: `/api/v1/runs/${runId}/cancel`,
        headers: { cookie: alice.cookie },
      })
      await waitForRunStatus(runId, alice.cookie, ['stopped'])
    }
  })

  it('reconciles runs orphaned by a server restart as interrupted (never complete)', async () => {
    // Simulate a restart: insert a running run directly with no live handle.
    fake.setMode('normal')
    const providerId = await createProviderAndCredential(alice.cookie)
    const { conversationId, nodeId } = await createConversationWithUserNode(alice.cookie)

    const { body } = await startRun(alice.cookie, conversationId, nodeId, providerId, 'restart-key')
    const runId = (body as { run: { id: string } }).run.id
    await waitForRunStatus(runId, alice.cookie, ['complete', 'stopped'])

    // Forge an orphaned running row (what a crash would leave behind).
    const database = createDatabase(testApp.databaseUrl)
    try {
      await database.db
        .update(runs)
        .set({ status: 'running', terminalAt: null })
        .where(and(eq(runs.id, runId)))
      // Also remove its events so the read path sees a fresh tail.
      const stale = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/runs/${runId}`,
        headers: { cookie: alice.cookie },
      })
      expect(stale.statusCode).toBe(200)
      const reconciled = runDtoSchema.parse(stale.json())
      expect(reconciled.status).toBe('error')
      expect(reconciled.errorCode).toBe('interrupted')

      // The assistant node for the original run is untouched (one node).
      const detail = conversationDetailDtoSchema.parse(
        (
          await testApp.app.inject({
            method: 'GET',
            url: `/api/v1/conversations/${conversationId}`,
            headers: { cookie: alice.cookie },
          })
        ).json(),
      )
      const assistantNodes = detail.nodes.filter((node) => node.role === 'assistant')
      expect(assistantNodes.length).toBe(1)
      const dbNodes = await database.db
        .select({ id: conversationNodes.id })
        .from(conversationNodes)
        .where(eq(conversationNodes.conversationId, conversationId))
      expect(dbNodes.length).toBe(detail.nodes.length)
    } finally {
      await database.pool.end()
    }
  })

  it('rejects runs against a provider without a stored credential', async () => {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie: alice.cookie },
      payload: {
        label: 'No credential',
        kind: 'openai-compatible',
        endpointUrl: fake.url,
        modelId: 'model-alpha',
      },
    })
    const provider = created.json() as { id: string }
    const { conversationId, nodeId } = await createConversationWithUserNode(alice.cookie)
    const { response } = await startRun(alice.cookie, conversationId, nodeId, provider.id, undefined)
    expect(response.statusCode).toBe(400)
    expect(response.body).toContain('credential')
  })
})
