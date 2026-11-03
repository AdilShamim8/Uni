import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { eq } from 'drizzle-orm'
import { runDtoSchema } from '@uni/contracts'
import { runs } from '../src/db/schema.js'
import { createDatabase } from '../src/db/client.js'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * N017 — conflict-safe concurrent run creation. Two same-key create
 * requests that both pass the idempotency lookup (no row yet) race at
 * the (workspace_id, idempotency_key) unique index. Before the fix the
 * loser's insert THREW the Postgres unique violation (an empty
 * `.returning()` was never how the race manifests), which surfaced as a
 * raw 500 — and under different-input races the loser had no defined
 * behavior at all.
 *
 * After the fix: Postgres blocks the loser's insert until the winner
 * COMMITS, then raises 23505; the loser catches it, reads the winner's
 * committed row, and either reuses it (same effective request — one
 * run, ONE provider invocation) or fails with a typed 409 (different
 * request). No raw 500 is possible on a same-key race.
 *
 * Requests are fired genuinely concurrently through the real HTTP app;
 * the fake provider counts invocations to prove single execution.
 */

const API_KEY = 'sk-concurrent-test-key-abcdef123456'

describe('concurrent run creation (N017)', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let fake: { server: Server; url: string; requests: () => number }
  let database: ReturnType<typeof createDatabase>
  let providerId: string
  let parentNodeA: string
  let parentNodeB: string
  let conversationId: string

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Concurrent' })

    let providerRequests = 0
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
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      const send = (payload: unknown) => response.write(`data: ${JSON.stringify(payload)}\n\n`)
      send({
        id: 'chatcmpl-1',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content: 'concurrent reply' }, finish_reason: null }],
      })
      send({
        id: 'chatcmpl-1',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      })
      response.write('data: [DONE]\n\n')
      response.end()
    })
    fake = { server, url: '', requests: () => providerRequests }
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

    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie: alice.cookie },
      payload: {
        label: 'Concurrent fake',
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
      payload: { title: 'Concurrent test' },
    })
    expect(conversationResponse.statusCode).toBe(201)
    conversationId = (conversationResponse.json() as { id: string }).id
    for (const content of ['Message A', 'Message B']) {
      const nodeResponse = await testApp.app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conversationId}/nodes`,
        headers: { cookie: alice.cookie },
        payload: { role: 'user', content, status: 'complete' },
      })
      expect(nodeResponse.statusCode).toBe(201)
      const node = (nodeResponse.json() as { node: { id: string } }).node
      if (content === 'Message A') parentNodeA = node.id
      else parentNodeB = node.id
    }
  }, 180_000)

  afterAll(async () => {
    if (fake) await new Promise<void>((resolve) => fake.server.close(() => resolve()))
    if (database) await database.pool.end()
    await testApp?.app.close()
    await testApp?.stop()
  })

  interface CreateOutcome {
    status: number
    runId: string | null
    reused: boolean | null
    code: string | null
    parentNodeId: string
  }

  async function fireConcurrent(
    idempotencyKey: string,
    requests: Array<{ parentNodeId: string; modelId?: string }>,
  ): Promise<CreateOutcome[]> {
    const outcomes = await Promise.all(
      requests.map(async ({ parentNodeId, modelId }) => {
        const response = await testApp.app.inject({
          method: 'POST',
          url: `/api/v1/conversations/${conversationId}/runs`,
          headers: { cookie: alice.cookie },
          payload: { parentNodeId, providerId, idempotencyKey, modelId },
        })
        const body = response.json() as {
          run?: { id?: string }
          reused?: boolean
          code?: string
        }
        return {
          status: response.statusCode,
          runId: body.run?.id ?? null,
          reused: body.reused ?? null,
          code: body.code ?? null,
          parentNodeId,
        }
      }),
    )
    return outcomes
  }

  async function waitForTerminal(runId: string, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const response = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/runs/${runId}`,
        headers: { cookie: alice.cookie },
      })
      expect(response.statusCode).toBe(200)
      const run = runDtoSchema.parse(response.json())
      if (['complete', 'stopped', 'repetition_stopped', 'error'].includes(run.status)) return run
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(`run ${runId} never reached a terminal status`)
  }

  it('simultaneous identical requests yield one run and one provider invocation', async () => {
    const requestsBefore = fake.requests()
    const outcomes = await fireConcurrent('key-concurrent-identical', [
      { parentNodeId: parentNodeA },
      { parentNodeId: parentNodeA },
      { parentNodeId: parentNodeA },
      { parentNodeId: parentNodeA },
      { parentNodeId: parentNodeA },
      { parentNodeId: parentNodeA },
      { parentNodeId: parentNodeA },
      { parentNodeId: parentNodeA },
    ])

    // No raw 500 — every same-key outcome is a create or a typed reuse.
    for (const outcome of outcomes) {
      expect([200, 201]).toContain(outcome.status)
      expect(outcome.code).toBeNull()
    }

    const runIds = new Set(outcomes.map((outcome) => outcome.runId))
    expect(runIds.size).toBe(1)
    const creators = outcomes.filter((outcome) => outcome.status === 201)
    expect(creators.length).toBe(1)
    expect(creators[0]?.reused).toBe(false)
    const reusers = outcomes.filter((outcome) => outcome.status === 200)
    expect(reusers.length).toBe(7)
    for (const reuser of reusers) expect(reuser.reused).toBe(true)

    const winnerRunId = creators[0]!.runId!
    await waitForTerminal(winnerRunId)
    // Exactly one provider invocation — the seven losers never executed.
    expect(fake.requests() - requestsBefore).toBe(1)

    // The run row exists exactly once for this key.
    const rows = await database.db.select({ id: runs.id }).from(runs).where(eq(runs.id, winnerRunId))
    expect(rows.length).toBe(1)
  })

  it('simultaneous same-key requests with different inputs: one winner, typed conflicts', async () => {
    const requestsBefore = fake.requests()
    const outcomes = await fireConcurrent('key-concurrent-mixed', [
      { parentNodeId: parentNodeA },
      { parentNodeId: parentNodeA },
      { parentNodeId: parentNodeA },
      { parentNodeId: parentNodeB },
      { parentNodeId: parentNodeB },
      { parentNodeId: parentNodeB },
    ])

    // No raw 500 anywhere: every outcome is create/reuse or a typed 409.
    for (const outcome of outcomes) {
      expect([200, 201, 409]).toContain(outcome.status)
    }

    const successes = outcomes.filter((outcome) => outcome.status === 200 || outcome.status === 201)
    const conflicts = outcomes.filter((outcome) => outcome.status === 409)
    expect(successes.length).toBe(3)
    expect(conflicts.length).toBe(3)

    // All successes are the SAME run answering the SAME parent.
    const runIds = new Set(successes.map((outcome) => outcome.runId))
    expect(runIds.size).toBe(1)
    const winningParent = successes[0]!.parentNodeId
    for (const success of successes) expect(success.parentNodeId).toBe(winningParent)
    expect(successes.filter((outcome) => outcome.status === 201).length).toBe(1)

    // Every conflict is the OTHER parent, with the stable conflict code.
    const losingParent = winningParent === parentNodeA ? parentNodeB : parentNodeA
    for (const conflict of conflicts) {
      expect(conflict.parentNodeId).toBe(losingParent)
      expect(conflict.code).toBe('conflict')
      expect(conflict.runId).toBeNull()
    }

    await waitForTerminal(successes[0]!.runId!)
    // Only the winning input executed.
    expect(fake.requests() - requestsBefore).toBe(1)
  })

  it('concurrent requests with different keys never falsely conflict', async () => {
    const requestsBefore = fake.requests()
    const [first, second] = await Promise.all([
      testApp.app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conversationId}/runs`,
        headers: { cookie: alice.cookie },
        payload: { parentNodeId: parentNodeA, providerId, idempotencyKey: 'key-different-1' },
      }),
      testApp.app.inject({
        method: 'POST',
        url: `/api/v1/conversations/${conversationId}/runs`,
        headers: { cookie: alice.cookie },
        payload: { parentNodeId: parentNodeB, providerId, idempotencyKey: 'key-different-2' },
      }),
    ])

    expect(first.statusCode).toBe(201)
    expect(second.statusCode).toBe(201)
    const firstRun = runDtoSchema.parse((first.json() as { run: unknown }).run)
    const secondRun = runDtoSchema.parse((second.json() as { run: unknown }).run)
    expect(firstRun.id).not.toBe(secondRun.id)

    await waitForTerminal(firstRun.id)
    await waitForTerminal(secondRun.id)
    expect(fake.requests() - requestsBefore).toBe(2)
  })
})
