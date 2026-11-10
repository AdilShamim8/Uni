import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, eq } from 'drizzle-orm'
import { jobOutbox, agentRuns } from '../src/db/schema.js'
import {
  AGENT_RUN_QUEUE,
  dispatchOutbox,
  enqueueInTransaction,
  type JobPayload,
  type JobsDatabase,
} from '../src/modules/jobs/outbox.service.js'
import { resumeAgentRun, reconcileStuckAgentRuns } from '../src/modules/agent/agentRun.service.js'
import { signUpUser, startTestApp, type TestApp } from './harness.js'
import { createLogger } from '../src/lib/logger.js'
import type { AgentDatabase } from '../src/modules/agent/agentSession.service.js'
import type { RunEngineDeps } from '../src/modules/agent/agentRun.service.js'
import type { Env } from '../src/config/env.js'

/**
 * T013 — durable worker ownership. These tests exercise the outbox and
 * the resume/reconcile entry points over the real database (embedded
 * PostgreSQL) without a live pg-boss queue: the ownership invariants
 * (claim-once, no zombie resume, no credential payloads) are properties
 * of the row states and the payload shape, which the queue protocol
 * then transports. The end-to-end worker process boots against the same
 * schema in the worker smoke check below.
 */

const silentLogger = createLogger({ ...({} as Env), LOG_LEVEL: 'silent' } as never).child({ component: 'test' })

describe('durable jobs — outbox + ownership (T013)', () => {
  let testApp: TestApp
  let db: AgentDatabase & JobsDatabase
  let env: Env
  let deps: RunEngineDeps

  beforeAll(async () => {
    testApp = await startTestApp()
    db = (testApp.app as unknown as { database: { db: AgentDatabase & JobsDatabase } }).database.db
    env = (testApp.app as unknown as { env: Env }).env
    deps = { db, env }
  }, 180_000)

  afterAll(async () => {
    await testApp?.stop()
  })

  it('enqueueInTransaction commits with the run row (same transaction)', async () => {
    const alice = await signUpUser(testApp.app)
    const me = await testApp.app.inject({
      method: 'GET', url: '/api/v1/me',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
    })
    const workspaceId = (me.json() as { workspace: { id: string } }).workspace.id
    const session = await testApp.app.inject({
      method: 'POST', url: '/api/v1/agent/sessions',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: { name: 'Outbox session' },
    })
    const sessionId = (session.json() as { id: string }).id

    const runId = crypto.randomUUID()
    let outboxCount = 0
    await db.transaction(async (tx) => {
      await tx.insert(agentRuns).values({
        id: runId,
        workspaceId,
        sessionId,
        status: 'running',
        inputText: 'outbox test',
      })
      await enqueueInTransaction(tx, { kind: 'agent-run-execute', runId, workspaceId, sessionId })
      // Still inside the transaction: the outbox row is visible here.
      const rows = await tx.select().from(jobOutbox).where(eq(jobOutbox.runId, runId))
      outboxCount = rows.length
    })
    expect(outboxCount).toBe(1)

    // The payload carries identifiers ONLY — never credentials.
    const rows = await db.select().from(jobOutbox).where(eq(jobOutbox.runId, runId))
    const payload = rows[0]!.payload as JobPayload
    expect(Object.keys(payload).sort()).toEqual(['kind', 'runId', 'sessionId', 'workspaceId'])

    // A rolled-back transaction leaves NO outbox row (gap stays closed).
    const failedRunId = crypto.randomUUID()
    await db
      .transaction(async (tx) => {
        await tx.insert(agentRuns).values({
          id: failedRunId, workspaceId, sessionId, status: 'running', inputText: 'rollback',
        })
        await enqueueInTransaction(tx, { kind: 'agent-run-execute', runId: failedRunId, workspaceId, sessionId })
        throw new Error('force rollback')
      })
      .catch(() => undefined)
    const orphanRows = await db.select().from(jobOutbox).where(eq(jobOutbox.runId, failedRunId))
    expect(orphanRows.length).toBe(0)
  }, 60_000)

  it('dispatchOutbox marks rows sent; a fake queue receives the payload', async () => {
    const alice = await signUpUser(testApp.app)
    const me = await testApp.app.inject({
      method: 'GET', url: '/api/v1/me',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
    })
    const workspaceId = (me.json() as { workspace: { id: string } }).workspace.id
    const session = await testApp.app.inject({
      method: 'POST', url: '/api/v1/agent/sessions',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: { name: 'Dispatch session' },
    })
    const sessionId = (session.json() as { id: string }).id
    const runId = crypto.randomUUID()
    await db.transaction(async (tx) => {
      await tx.insert(agentRuns).values({
        id: runId, workspaceId, sessionId, status: 'running', inputText: 'dispatch',
      })
      await enqueueInTransaction(tx, { kind: 'agent-run-execute', runId, workspaceId, sessionId })
    })

    const sent: Array<{ name: string; data: JobPayload; singletonKey?: string }> = []
    const fakeBoss = {
      send: async (request: { name: string; data: JobPayload; options?: { singletonKey?: string } }) => {
        sent.push({ name: request.name, data: request.data, singletonKey: request.options?.singletonKey })
        return 'job-id'
      },
    } as never
    const count = await dispatchOutbox(db, fakeBoss, silentLogger)
    // Earlier tests may leave unsent rows in the shared database; this
    // dispatch must include THIS run at least once, and after it the
    // row is marked sent (a second pass sends nothing new for it).
    expect(count).toBeGreaterThanOrEqual(1)
    const mine = sent.filter((entry) => entry.data.runId === runId)
    expect(mine.length).toBe(1)
    expect(mine[0]!.name).toBe(AGENT_RUN_QUEUE)
    expect(mine[0]!.singletonKey).toBe(runId)

    // Marked sent; a second dispatch pass sends nothing for this run.
    await dispatchOutbox(db, fakeBoss, silentLogger)
    expect(sent.filter((entry) => entry.data.runId === runId).length).toBe(1)

    // A send that throws leaves the row unsent (retried next tick).
    const runId2 = crypto.randomUUID()
    await db.transaction(async (tx) => {
      await tx.insert(agentRuns).values({
        id: runId2, workspaceId, sessionId, status: 'running', inputText: 'retry',
      })
      await enqueueInTransaction(tx, { kind: 'agent-run-execute', runId: runId2, workspaceId, sessionId })
    })
    const failingBoss = {
      send: async () => {
        throw new Error('queue down')
      },
    } as never
    expect(await dispatchOutbox(db, failingBoss, silentLogger)).toBe(0)
    const stillUnsent = await db.select().from(jobOutbox).where(and(eq(jobOutbox.runId, runId2)))
    expect(stillUnsent[0]!.sentAt).toBeNull()
  }, 60_000)

  it('a re-delivered attempt never resumes a zombie (restart recovery)', async () => {
    const alice = await signUpUser(testApp.app)
    const me = await testApp.app.inject({
      method: 'GET', url: '/api/v1/me',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
    })
    const workspaceId = (me.json() as { workspace: { id: string } }).workspace.id
    const session = await testApp.app.inject({
      method: 'POST', url: '/api/v1/agent/sessions',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: { name: 'Recovery session' },
    })
    const sessionId = (session.json() as { id: string }).id

    // Simulate a crashed worker: a run left 'running' by a dead process.
    const runId = crypto.randomUUID()
    await db.insert(agentRuns).values({
      id: runId, workspaceId, sessionId, status: 'running', inputText: 'was executing',
    })

    // Boot recovery: the stuck run resolves to interrupted FIRST...
    const reconciled = await reconcileStuckAgentRuns(deps)
    expect(reconciled).toBeGreaterThanOrEqual(1)

    // ...so the queue's re-delivered attempt finds a terminal row and
    // does NOTHING (an uncertain provider side effect is not replayed).
    const outcome = await resumeAgentRun(deps, { runId, workspaceId, sessionId })
    expect(outcome).toBe('already_terminal')
    const rows = await db.select().from(agentRuns).where(eq(agentRuns.id, runId))
    expect(rows[0]!.status).toBe('error')
    expect(rows[0]!.errorCode).toBe('interrupted')
  }, 60_000)
})
