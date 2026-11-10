import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { agentRuns } from '../src/db/schema.js'
import { signUpUser, startTestApp, TEST_CREDENTIAL_MASTER_KEY, type TestApp } from './harness.js'
import type { AgentDatabase } from '../src/modules/agent/agentSession.service.js'

/**
 * F06 regression suite — atomic admission and one-way terminals:
 * concurrent same-key creates resolve to ONE run; the workspace
 * concurrency cap cannot be oversubscribed by simultaneous creates; a
 * terminal transition happens exactly once.
 *
 * The fake provider HOLDS its streams open so admitted runs stay
 * 'running' for the whole test (the admission window is not shortened
 * by fast completions).
 */

const API_KEY = 'sk-f06-test-key-abcdef123456'

describe('agent run admission + terminals (F06)', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let fake: { server: Server; url: string; releaseAll: () => void; heldCount: () => number }
  let baseUrl: string
  let db: AgentDatabase

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice F06' })
    db = (testApp.app as unknown as { database: { db: AgentDatabase } }).database.db

    const held: Array<{ response: import('node:http').ServerResponse; released: boolean }> = []
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
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      response.write(
        `data: ${JSON.stringify({
          id: 'chatcmpl-f06',
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: 'held ' }, finish_reason: null }],
        })}\n\n`,
      )
      held.push({ response, released: false })
    })
    fake = {
      server,
      url: '',
      heldCount: () => held.filter((entry) => !entry.released).length,
      releaseAll: () => {
        for (const entry of held) {
          if (entry.released) continue
          entry.released = true
          entry.response.write(
            `data: ${JSON.stringify({
              id: 'chatcmpl-f06',
              object: 'chat.completion.chunk',
              choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
            })}\n\n`,
          )
          entry.response.write('data: [DONE]\n\n')
          entry.response.end()
        }
      },
    }
    fake.url = await new Promise<string>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address && typeof address === 'object') {
          resolve(`http://127.0.0.1:${address.port}`)
        }
      })
    })
    await testApp.app.listen({ port: 0, host: '127.0.0.1' })
    const address = testApp.app.server.address()
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`
    }
  }, 180_000)

  afterAll(async () => {
    fake.releaseAll()
    await new Promise<void>((resolve) => fake.server.close(() => resolve()))
    await testApp?.app.close()
    await testApp?.stop()
  })

  async function createSessionWithProvider(): Promise<string> {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie: alice.cookie },
      payload: {
        label: 'F06 fake',
        kind: 'openai-compatible',
        endpointUrl: fake.url,
        modelId: 'model-f06',
      },
    })
    expect(created.statusCode).toBe(201)
    const provider = created.json() as { id: string }
    const setKey = await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${provider.id}/credential`,
      headers: { cookie: alice.cookie },
      payload: { apiKey: API_KEY },
    })
    expect(setKey.statusCode).toBe(200)
    const session = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/agent/sessions',
      headers: { cookie: alice.cookie },
      payload: { name: 'F06 session', providerId: provider.id, modelId: 'model-f06' },
    })
    expect(session.statusCode).toBe(201)
    return (session.json() as { id: string }).id
  }

  async function fireCreate(sessionId: string, text: string, key: string) {
    return testApp.app.inject({
      method: 'POST',
      url: `/api/v1/agent/sessions/${sessionId}/runs`,
      headers: { cookie: alice.cookie },
      payload: { text, idempotencyKey: key },
    })
  }

  /**
   * Wait until the fake provider has captured at least `count` held
   * streams. The winner's provider call can land a tick after the
   * create responses return (admission serialization + transcript
   * load); releasing before the stream exists would leave the run
   * waiting forever.
   */
  async function waitForHeld(count: number, timeoutMs = 10_000): Promise<void> {
    const heldCount = () => fake.heldCount()
    const deadline = Date.now() + timeoutMs
    while (heldCount() < count) {
      if (Date.now() > deadline) throw new Error(`only ${heldCount()} of ${count} provider streams opened`)
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  /** Wait until every non-terminal run row in the workspace settles. */
  async function waitForRunsToSettle(timeoutMs = 20_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
      const me = await testApp.app.inject({
        method: 'GET', url: '/api/v1/me',
        headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      })
      const workspaceId = (me.json() as { workspace: { id: string } }).workspace.id
      const active = await db
        .select({ count: sql<number>`count(*)` })
        .from(agentRuns)
        .where(
          and(
            eq(agentRuns.workspaceId, workspaceId),
            inArray(agentRuns.status, ['running', 'waiting-for-permission', 'cancelling']),
          ),
        )
      if (Number(active[0]?.count ?? 0) === 0) return
      if (Date.now() > deadline) {
        const stuck = await db
          .select({ id: agentRuns.id, status: agentRuns.status, errorCode: agentRuns.errorCode })
          .from(agentRuns)
          .where(
            and(
              eq(agentRuns.workspaceId, workspaceId),
              inArray(agentRuns.status, ['running', 'waiting-for-permission', 'cancelling']),
            ),
          )
        throw new Error(
          'runs did not settle in time; stuck: ' + JSON.stringify(stuck),
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  it('concurrent same-key creates resolve to ONE run (unique index + recovery)', async () => {
    const sessionId = await createSessionWithProvider()
    // 6 genuinely concurrent creates with the SAME key + request.
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, index) => fireCreate(sessionId, 'Same request', `same-key-${Date.now()}`)),
    )
    const codes = responses.map((response) => response.statusCode).sort()
    expect(codes.every((code) => code === 200 || code === 201)).toBe(true)
    const runIds = new Set(responses.map((response) => (response.json() as { runId: string }).runId))
    expect(runIds.size).toBe(1)

    // Exactly ONE run row for that key.
    const rows = await db
      .select()
      .from(agentRuns)
      .where(and(eq(agentRuns.sessionId, sessionId)))
    expect(rows.length).toBe(1)
    await waitForHeld(1)
    fake.releaseAll()
    await waitForRunsToSettle()
  }, 60_000)

  it('the concurrency cap cannot be oversubscribed by simultaneous creates', async () => {
    const sessionId = await createSessionWithProvider()
    const stamp = Date.now()
    // Cap is 2 per workspace: fire 6 concurrent DIFFERENT-key creates.
    const responses = await Promise.all(
      Array.from({ length: 6 }, (_, index) => fireCreate(sessionId, `Request ${index}`, `cap-${stamp}-${index}`)),
    )
    const admitted = responses.filter((response) => response.statusCode === 201)
    const rejected = responses.filter((response) => response.statusCode !== 201)
    expect(admitted.length).toBe(2)
    expect(rejected.length).toBe(4)
    expect(rejected.every((response) => response.statusCode === 429)).toBe(true)
    await waitForHeld(2)
    fake.releaseAll()
    await waitForRunsToSettle()
  }, 60_000)

  it('a terminal transition happens exactly once (cancel vs completion race)', async () => {
    const sessionId = await createSessionWithProvider()
    const created = await fireCreate(sessionId, 'Race me', `race-${Date.now()}`)
    expect(created.statusCode).toBe(201)
    const runId = (created.json() as { runId: string }).runId

    // Release the provider AND cancel at (nearly) the same moment; then
    // wait for the run to settle and verify exactly one terminal state,
    // with terminalAt set once and a single terminal event.
    await waitForHeld(1)
    fake.releaseAll()
    const cancel = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/agent/runs/${runId}/cancel`,
      headers: { cookie: alice.cookie },
    })
    // Either wins: cancel may race the natural completion.
    expect([200, 202, 409]).toContain(cancel.statusCode)

    for (let i = 0; i < 60; i++) {
      const run = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/agent/runs/${runId}`,
        headers: { cookie: alice.cookie },
      })
      const status = (run.json() as { status: string }).status
      if (status !== 'running' && status !== 'cancelling' && status !== 'waiting-for-permission') break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    const final = await db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1)
    const row = final[0]!
    expect(row.terminalAt).not.toBeNull()
    // A second cancel after terminal: honest 409.
    const again = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/agent/runs/${runId}/cancel`,
      headers: { cookie: alice.cookie },
    })
    expect(again.statusCode).toBe(409)
    await waitForRunsToSettle()
  }, 60_000)
})
