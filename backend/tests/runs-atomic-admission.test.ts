import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { and, eq, inArray } from 'drizzle-orm'
import { runs } from '../src/db/schema.js'
import { createDatabase } from '../src/db/client.js'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * N020 — atomic active-run admission. The workspace concurrency cap is
 * enforced by ONE transaction (advisory-lock guarded count + insert),
 * so simultaneous creates serialize and the cap can never be
 * oversubscribed. Before the fix the count ran as a separate statement
 * before the insert: concurrent creates all counted the same active
 * set, all passed the cap, and all inserted.
 *
 * The fake provider HOLDS its SSE streams open (one delta, no [DONE],
 * no end) so admitted runs stay `running` for the whole test — the
 * admission window is not shortened by fast completions. Requests are
 * fired genuinely concurrently through the real HTTP app.
 */

const API_KEY = 'sk-admission-test-key-abcdef123456'

interface HeldResponse {
  response: import('node:http').ServerResponse
  released: boolean
}

describe('atomic active-run admission (N020)', () => {
  let testApp: TestApp
  let alice: { cookie: string; userId: string; email: string }
  let bob: { cookie: string }
  let aliceWorkspaceId: string
  let fake: { server: Server; url: string; requests: () => number; releaseAll: () => void }
  let database: ReturnType<typeof createDatabase>
  let providerId: string
  let conversationId: string
  const parentNodes: string[] = []

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Admission' })
    bob = await signUpUser(testApp.app, { name: 'Bob OtherWorkspace' })

    let providerRequests = 0
    const held: HeldResponse[] = []
    const server = createServer((request, response) => {
      if (!(request.url ?? '').includes('/chat/completions')) {
        response.writeHead(404, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'not found' }))
        return
      }
      providerRequests += 1
      if (request.headers.authorization !== `Bearer ${API_KEY}`) {
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'invalid key' }))
        return
      }
      // 200 + one delta, then HOLD the stream open: the run stays
      // `running` until the test releases it, keeping the admission
      // window fully open for every concurrent creator.
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      response.write(
        `data: ${JSON.stringify({
          id: 'chatcmpl-admission',
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: 'held ' }, finish_reason: null }],
        })}\n\n`,
      )
      held.push({ response, released: false })
    })
    fake = {
      server,
      url: '',
      requests: () => providerRequests,
      releaseAll: () => {
        for (const entry of held) {
          if (entry.released) continue
          entry.released = true
          entry.response.write(`data: ${JSON.stringify({
            id: 'chatcmpl-admission',
            object: 'chat.completion.chunk',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          })}\n\n`)
          entry.response.write('data: [DONE]\n\n')
          entry.response.end()
        }
      },
    }
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address && typeof address === 'object') {
          fake.url = `http://127.0.0.1:${address.port}`
        }
        resolve()
      })
    })
    database = createDatabase(testApp.databaseUrl)

    const session = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: alice.cookie },
    })
    expect(session.statusCode).toBe(200)
    aliceWorkspaceId = (session.json() as { workspace: { id: string } }).workspace.id

    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie: alice.cookie },
      payload: {
        label: 'Admission fake',
        kind: 'openai-compatible',
        endpointUrl: fake.url,
        modelId: 'model-alpha',
      },
    })
    expect(created.statusCode).toBe(201)
    providerId = (created.json() as { id: string }).id
    const setKey = await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${providerId}/credential`,
      headers: { cookie: alice.cookie },
      payload: { apiKey: API_KEY },
    })
    expect(setKey.statusCode).toBe(200)

    const conversationResponse = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { cookie: alice.cookie },
      payload: { title: 'Admission test' },
    })
    expect(conversationResponse.statusCode).toBe(201)
    conversationId = (conversationResponse.json() as { id: string }).id
    for (let index = 0; index < 8; index += 1) {
      const nodeResponse = await testApp.app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conversationId}/nodes`,
        headers: { cookie: alice.cookie },
        payload: { role: 'user', content: `Admission probe ${index}`, status: 'complete' },
      })
      expect(nodeResponse.statusCode).toBe(201)
      parentNodes.push((nodeResponse.json() as { node: { id: string } }).node.id)
    }
  }, 180_000)

  afterAll(async () => {
    if (fake) fake.releaseAll()
    if (fake) await new Promise<void>((resolve) => fake.server.close(() => resolve()))
    if (database) await database.pool.end()
    await testApp?.app.close()
    await testApp?.stop()
  })

  it('simultaneous creates never oversubscribe the workspace cap', async () => {
    const requestsBefore = fake.requests()

    // Wait for exactly `expected` provider invocations: an admitted
    // run ALWAYS invokes the provider (execution starts with the
    // create response), but the HTTP call lands a beat after the row
    // is durable — polling keeps this deterministic.
    const waitForProviderRequests = async (expected: number): Promise<void> => {
      const deadline = Date.now() + 5_000
      while (Date.now() < deadline) {
        if (fake.requests() - requestsBefore >= expected) return
        await new Promise((resolve) => setTimeout(resolve, 25))
      }
      throw new Error(
        `provider invoked ${fake.requests() - requestsBefore} times, expected ${expected}`,
      )
    }

    const outcomes = await Promise.all(
      parentNodes.map(async (parentNodeId, index) => {
        const response = await testApp.app.inject({
          method: 'POST',
          url: `/api/v1/conversations/${conversationId}/runs`,
          headers: { cookie: alice.cookie },
          payload: {
            parentNodeId,
            providerId,
            idempotencyKey: `admission-${index}`,
          },
        })
        const body = response.json() as { run?: { id?: string }; code?: string }
        return {
          status: response.statusCode,
          runId: body.run?.id ?? null,
          code: body.code ?? null,
        }
      }),
    )

    // Every outcome is an admitted create or a typed rate limit —
    // never a 500, never an untyped rejection.
    for (const outcome of outcomes) {
      expect([201, 429]).toContain(outcome.status)
    }
    const rejected = outcomes.filter((outcome) => outcome.status === 429)
    for (const outcome of rejected) {
      expect(outcome.code).toBe('rate_limited')
      expect(outcome.runId).toBeNull()
    }

    // The cap (RUN_MAX_CONCURRENT_PER_WORKSPACE = 2 in the test env)
    // is enforced exactly: precisely two creators win.
    const admitted = outcomes.filter((outcome) => outcome.status === 201)
    expect(admitted.length).toBe(2)
    expect(new Set(admitted.map((outcome) => outcome.runId)).size).toBe(2)

    // Exactly the admitted runs invoked the provider — the rejected
    // six never reached execution.
    await waitForProviderRequests(2)

    // The durable state agrees: two running rows for this workspace,
    // and no other statuses slipped in.
    const activeRows = await database.db
      .select({ id: runs.id, status: runs.status })
      .from(runs)
      .where(
        and(eq(runs.workspaceId, aliceWorkspaceId), inArray(runs.status, ['running', 'cancelling'])),
      )
    expect(activeRows.length).toBe(2)
    expect(
      new Set(activeRows.map((row) => row.id)),
    ).toEqual(new Set(admitted.map((outcome) => outcome.runId)))
  })

  it('a different workspace is not blocked by this workspace\u2019s full cap', async () => {
    // Alice's workspace is at its cap (two held-open runs above).
    // Bob's create must sail through: the advisory lock is scoped to
    // the workspace, and so is the count.
    const providerResponse = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie: bob.cookie },
      payload: {
        label: 'Bob fake',
        kind: 'openai-compatible',
        endpointUrl: fake.url,
        modelId: 'model-alpha',
      },
    })
    expect(providerResponse.statusCode).toBe(201)
    const bobProviderId = (providerResponse.json() as { id: string }).id
    const bobKey = await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${bobProviderId}/credential`,
      headers: { cookie: bob.cookie },
      payload: { apiKey: API_KEY },
    })
    expect(bobKey.statusCode).toBe(200)
    const bobConversation = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { cookie: bob.cookie },
      payload: { title: 'Bob conversation' },
    })
    expect(bobConversation.statusCode).toBe(201)
    const bobConversationId = (bobConversation.json() as { id: string }).id
    const bobNode = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${bobConversationId}/nodes`,
      headers: { cookie: bob.cookie },
      payload: { role: 'user', content: 'From the other workspace', status: 'complete' },
    })
    expect(bobNode.statusCode).toBe(201)
    const bobParentNodeId = (bobNode.json() as { node: { id: string } }).node.id

    const response = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${bobConversationId}/runs`,
      headers: { cookie: bob.cookie },
      payload: {
        parentNodeId: bobParentNodeId,
        providerId: bobProviderId,
        idempotencyKey: 'bob-admission-1',
      },
    })
    expect(response.statusCode).toBe(201)
    expect((response.json() as { reused?: boolean }).reused).toBe(false)
  })

  it('an idempotent replay of an admitted run bypasses admission (never a 429)', async () => {
    // Alice is at her cap; replaying one of her two running runs with
    // the SAME key and the SAME effective request must replay it —
    // the retry of an in-flight send is not a NEW admission.
    const existing = await database.db
      .select({ id: runs.id, idempotencyKey: runs.idempotencyKey, parentNodeId: runs.parentNodeId })
      .from(runs)
      .where(and(eq(runs.workspaceId, aliceWorkspaceId), eq(runs.status, 'running')))
    expect(existing.length).toBeGreaterThanOrEqual(1)
    const target = existing[0]!
    expect(target.idempotencyKey).toBeTruthy()

    const response = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/runs`,
      headers: { cookie: alice.cookie },
      payload: {
        parentNodeId: target.parentNodeId,
        providerId,
        idempotencyKey: target.idempotencyKey,
      },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json() as { run?: { id?: string }; reused?: boolean }
    expect(body.reused).toBe(true)
    expect(body.run?.id).toBe(target.id)
  })
})
