import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createServer, type Server } from 'node:http'
import { createNodeRequestSchema, createRunResponseSchema } from '@uni/contracts'
import { runEvents, runs } from '../src/db/schema.js'
import { createDatabase } from '../src/db/client.js'
import { appendEvent } from '../src/modules/runs/runs.service.js'
import { signUpUser, startTestApp, TEST_CREDENTIAL_MASTER_KEY, type TestApp } from './harness.js'

/**
 * F003 (shipped as "[N016]", relabeled 2026-11-04) — atomic per-run event sequence assignment. appendEvent assigns
 * each event's sequence with max + 1; before the fix, the read and the
 * insert were separate statements, so two concurrent appenders for the
 * same run could read the same max and collide on the (runId, sequence)
 * primary key — the loser threw a unique violation (surfacing as a
 * provider_error after the provider succeeded) or was silently
 * swallowed by the flush chain. The fix wraps read + insert in one
 * transaction holding a per-run advisory lock. Original N016 (request
 * fingerprinting) is separate and lives in runs-fingerprint.test.ts.
 *
 * This suite attacks the guarantee DIRECTLY at the service boundary:
 * many genuinely concurrent appendEvent calls for the same run, no
 * cooperative serialization from the runner. Before the fix this test
 * fails with unique-violation rejections; after it, every call lands
 * with a distinct, contiguous sequence.
 */

const API_KEY = 'sk-atomic-test-key-abcdef123456'

describe('run event sequence atomicity (F003)', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let fake: { server: Server; url: string }
  let database: ReturnType<typeof createDatabase>

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Atomic' })
    const server = createServer((request, response) => {
      // Discovery catalog; generation never runs in this suite.
      if ((request.url ?? '').includes('/models')) {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ data: [{ id: 'model-atomic' }] }))
        return
      }
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'not found' }))
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
  }, 180_000)

  afterAll(async () => {
    if (fake) await new Promise<void>((resolve) => fake.server.close(() => resolve()))
    await database?.pool?.end().catch(() => undefined)
    await testApp?.app.close()
    await testApp?.stop()
  })

  async function createCompletedRun(): Promise<string> {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie: alice.cookie },
      payload: {
        label: 'Atomic fake',
        kind: 'openai-compatible',
        endpointUrl: fake.url,
        modelId: 'model-atomic',
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

    const conversationResponse = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { cookie: alice.cookie },
      payload: { title: 'Atomic run' },
    })
    expect(conversationResponse.statusCode).toBe(201)
    const conversation = conversationResponse.json() as { id: string }
    const nodeBody = createNodeRequestSchema.parse({
      role: 'user',
      content: 'Say something for the atomic test.',
      status: 'complete',
    })
    const nodeResponse = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversation.id}/nodes`,
      headers: { cookie: alice.cookie },
      payload: nodeBody,
    })
    expect(nodeResponse.statusCode).toBe(201)
    const node = (nodeResponse.json() as { node: { id: string } }).node

    const runResponse = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversation.id}/runs`,
      headers: { cookie: alice.cookie },
      payload: {
        parentNodeId: node.id,
        providerId: provider.id,
        idempotencyKey: `atomic-${Math.random().toString(36).slice(2)}`,
      },
    })
    expect(runResponse.statusCode).toBe(201)
    const run = createRunResponseSchema.parse(runResponse.json())

    // Wait for the runner to finish (the fake has no completions route,
    // so the run terminal-errors quickly) — the suite's own appends
    // must not race the runner's terminal event.
    const deadline = Date.now() + 20_000
    for (;;) {
      const poll = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/runs/${run.run.id}`,
        headers: { cookie: alice.cookie },
      })
      expect(poll.statusCode).toBe(200)
      const status = (poll.json() as { status: string }).status
      if (status === 'complete' || status === 'stopped' || status === 'error' || status === 'repetition_stopped') {
        break
      }
      if (Date.now() > deadline) throw new Error(`run ${run.run.id} never reached a terminal state`)
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    return run.run.id
  }

  it('assigns unique contiguous sequences under truly concurrent appends', async () => {
    const runId = await createCompletedRun()
    const before = await database.db.select().from(runEvents).where(eq(runEvents.runId, runId))
    const baseline = before.length

    // 16 concurrent appenders for the SAME run — no cooperative
    // ordering, exactly the racing shape the fix must survive.
    const CONCURRENT = 16
    const settled = await Promise.allSettled(
      Array.from({ length: CONCURRENT }, (_, index) =>
        appendEvent(database.db, runId, 'delta', { text: `concurrent-${index}` }),
      ),
    )

    // Every append succeeded — none lost, none rejected with a PK
    // collision (the pre-fix failure mode).
    const rejected = settled.filter((outcome) => outcome.status === 'rejected')
    expect(rejected).toEqual([])
    const events = settled.map((outcome) =>
      outcome.status === 'fulfilled' ? outcome.value : null,
    )
    expect(events.every((event) => event !== null)).toBe(true)

    // Sequences are exactly baseline+1 … baseline+16 — distinct AND
    // contiguous, no gaps, no duplicates.
    const sequences = events
      .map((event) => event?.sequence ?? 0)
      .sort((a, b) => a - b)
    expect(sequences).toEqual(
      Array.from({ length: CONCURRENT }, (_, index) => baseline + index + 1),
    )

    // The durable rows agree: baseline + 16 rows, unique sequences.
    const after = await database.db.select().from(runEvents).where(eq(runEvents.runId, runId))
    expect(after.length).toBe(baseline + CONCURRENT)
    expect(new Set(after.map((row) => row.sequence)).size).toBe(after.length)
  })

  it('keeps different runs independent — no cross-run lock convoy', async () => {
    // Two runs appending concurrently must BOTH make progress; the
    // advisory lock is per-run, so run A's appends never block run B's.
    const runA = await createCompletedRun()
    const runB = await createCompletedRun()

    const outcomes = await Promise.allSettled([
      ...Array.from({ length: 8 }, (_, index) =>
        appendEvent(database.db, runA, 'delta', { text: `a-${index}` }),
      ),
      ...Array.from({ length: 8 }, (_, index) =>
        appendEvent(database.db, runB, 'delta', { text: `b-${index}` }),
      ),
    ])
    expect(outcomes.every((outcome) => outcome.status === 'fulfilled')).toBe(true)

    for (const [runId, expected] of [
      [runA, 8],
      [runB, 8],
    ] as const) {
      const rows = await database.db.select().from(runEvents).where(eq(runEvents.runId, runId))
      // started + terminal from the run itself, plus the 8 appends.
      expect(rows.length).toBe(expected + 2)
      const sequences = rows.map((row) => row.sequence).sort((a, b) => a - b)
      expect(new Set(sequences).size).toBe(sequences.length)
    }
  })

  it('leaves the run row untouched by raw event appends', async () => {
    // Appending events directly must never mutate the run's own status
    // — the runner owns that transition atomically in finalize().
    const runId = await createCompletedRun()
    const runBefore = (await database.db.select().from(runs).where(eq(runs.id, runId)))[0]
    await appendEvent(database.db, runId, 'delta', { text: 'side append' })
    const runAfter = (await database.db.select().from(runs).where(eq(runs.id, runId)))[0]
    expect(runAfter?.status).toBe(runBefore?.status)
    expect(runAfter?.terminalAt?.getTime()).toBe(runBefore?.terminalAt?.getTime())
  })
})
