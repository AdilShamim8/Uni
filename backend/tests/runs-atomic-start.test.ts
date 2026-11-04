import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { eq, sql } from 'drizzle-orm'
import { runDtoSchema } from '@uni/contracts'
import { runEvents, runs } from '../src/db/schema.js'
import { createDatabase } from '../src/db/client.js'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * N022 — the run row and its started event commit as ONE transaction.
 * Before the fix the started event was a separate post-commit
 * transaction: a failure between the two left a committed `running`
 * row with ZERO events, no provider invocation, and no live handle —
 * the client saw a 500 and the same-key retry replayed an orphan that
 * read-back reconciliation then marked interrupted (the send was
 * lost).
 *
 * The failure is injected for real: a BEFORE INSERT trigger on
 * run_event raises, so the event insert fails exactly as a transient
 * DB fault would. With the atomic transaction the WHOLE create rolls
 * back — no run row, no events; a retry after recovery creates
 * fresh. Without it, the orphan row survives the 500.
 */

const API_KEY = 'sk-atomic-start-test-key-abcdef123'

describe('atomic run creation + started event (N022)', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let fake: { server: Server; url: string }
  let database: ReturnType<typeof createDatabase>
  let providerId: string
  let conversationId: string
  let parentNodeId: string
  let workspaceId: string

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice AtomicStart' })

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
      const send = (payload: unknown) => response.write(`data: ${JSON.stringify(payload)}\n\n`)
      send({
        id: 'chatcmpl-atomic',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content: 'atomic reply' }, finish_reason: null }],
      })
      send({
        id: 'chatcmpl-atomic',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      })
      response.write('data: [DONE]\n\n')
      response.end()
    })
    fake = { server, url: '' }
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
    workspaceId = (session.json() as { workspace: { id: string } }).workspace.id

    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie: alice.cookie },
      payload: {
        label: 'Atomic fake',
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

    const conversation = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { cookie: alice.cookie },
      payload: { title: 'Atomic start test' },
    })
    expect(conversation.statusCode).toBe(201)
    conversationId = (conversation.json() as { id: string }).id
    const node = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/nodes`,
      headers: { cookie: alice.cookie },
      payload: { role: 'user', content: 'Atomic probe', status: 'complete' },
    })
    expect(node.statusCode).toBe(201)
    parentNodeId = (node.json() as { node: { id: string } }).node.id
  }, 180_000)

  afterAll(async () => {
    if (fake) await new Promise<void>((resolve) => fake.server.close(() => resolve()))
    if (database) await database.pool.end()
    await testApp?.app.close()
    await testApp?.stop()
  })

  function createRun(idempotencyKey: string) {
    return testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/runs`,
      headers: { cookie: alice.cookie },
      payload: { parentNodeId, providerId, idempotencyKey },
    })
  }

  async function runsInWorkspace(): Promise<number> {
    return (
      await database.db.select({ id: runs.id }).from(runs).where(eq(runs.workspaceId, workspaceId))
    ).length
  }

  it('a failed event insert rolls the whole create back — no orphaned run row', async () => {
    // Inject a real event-insert failure (trigger raises on run_event).
    await database.db.execute(sql`CREATE OR REPLACE FUNCTION n022_fail() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'injected failure (N022 test)';
        END;
      $$ LANGUAGE plpgsql`)
    await database.db.execute(sql`CREATE TRIGGER n022_fail_run_event
        BEFORE INSERT ON run_event
        FOR EACH ROW EXECUTE FUNCTION n022_fail()`)
    try {
      const response = await createRun('atomic-start-fail-1')
      expect(response.statusCode).toBe(500)

      // THE invariant: the create is all-or-nothing. The run row must
      // NOT survive its own lifecycle start (pre-fix: a running row
      // with zero events and no handle survived the 500).
      expect(await runsInWorkspace()).toBe(0)
      const events = await database.db.select().from(runEvents)
      expect(events.length).toBe(0)

      // Recover and retry with the SAME key: a fresh create, not a
      // replay of an orphan (pre-fix: 200 reused of the stuck row).
      await database.db.execute(sql`DROP TRIGGER n022_fail_run_event ON run_event`)
      const retry = await createRun('atomic-start-fail-1')
      expect(retry.statusCode).toBe(201)
      expect((retry.json() as { reused?: boolean }).reused).toBe(false)
      const run = runDtoSchema.parse((retry.json() as { run: unknown }).run)
      expect(run.status).toBeTruthy()
    } finally {
      // Belt and braces: never leave the trigger behind for other tests.
      await database.db
        .execute(sql`DROP TRIGGER IF EXISTS n022_fail_run_event ON run_event`)
        .catch(() => undefined)
    }
  })

  it('a committed run always carries its started event at sequence 1 (create and replay)', async () => {
    const response = await createRun('atomic-start-ok-1')
    expect(response.statusCode).toBe(201)
    const body = response.json() as {
      run: { id: string }
      events: Array<{ sequence: number; type: string }>
    }
    expect(body.events.map((event) => event.type)).toContain('started')
    expect(body.events.find((event) => event.type === 'started')?.sequence).toBe(1)

    // The same-key replay returns the identical lifecycle start.
    const replay = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/runs`,
      headers: { cookie: alice.cookie },
      payload: { parentNodeId, providerId, idempotencyKey: 'atomic-start-ok-1' },
    })
    expect(replay.statusCode).toBe(200)
    const replayBody = replay.json() as {
      run: { id: string }
      reused: boolean
      events: Array<{ sequence: number; type: string }>
    }
    expect(replayBody.reused).toBe(true)
    expect(replayBody.run.id).toBe(body.run.id)
    expect(replayBody.events.find((event) => event.type === 'started')?.sequence).toBe(1)

    // Durable state: exactly one started event, sequence 1, first row.
    const stored = await database.db
      .select()
      .from(runEvents)
      .where(eq(runEvents.runId, body.run.id))
      .orderBy(runEvents.sequence)
    expect(stored[0]?.sequence).toBe(1)
    expect(stored[0]?.type).toBe('started')
    expect(stored.filter((event) => event.type === 'started')).toHaveLength(1)
  })
})
