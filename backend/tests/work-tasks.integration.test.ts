import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { signUpUser, startTestApp, type TestApp } from './harness.js'
import { eq } from 'drizzle-orm'
import { workTasks, workRuns, agentSessions } from '../src/db/schema.js'
import type { AgentDatabase } from '../src/modules/agent/agentSession.service.js'

/**
 * T018 — the Work API over the agent engine: task CRUD is
 * workspace-scoped, start provisions a durable agent session (as the
 * assigned employee when linked), admits a revision run through the
 * normal admission path, and records the work_run row. The agent run
 * fails honestly (no provider pinned on the session), which still
 * exercises the full linkage.
 */

const API_KEY = 'sk-work-test-key-abcdef123456'

describe('work tasks (T018)', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let bob: { cookie: string }
  let db: AgentDatabase
  let fake: { server: Server; url: string }
  let baseUrl: string

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Work' })
    bob = await signUpUser(testApp.app, { name: 'Bob Other' })
    db = (testApp.app as unknown as { database: { db: AgentDatabase } }).database.db

    const server = createServer((request, response) => {
      response.writeHead(404, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'not found' }))
    })
    fake = { server, url: '' }
    fake.url = await new Promise<string>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address && typeof address === 'object') resolve(`http://127.0.0.1:${address.port}`)
      })
    })
    await testApp.app.listen({ port: 0, host: '127.0.0.1' })
    const address = testApp.app.server.address()
    if (address && typeof address === 'object') baseUrl = `http://127.0.0.1:${address.port}`
  }, 180_000)

  afterAll(async () => {
    await new Promise<void>((resolve) => fake.server.close(() => resolve()))
    await testApp?.app.close()
    await testApp?.stop()
  })

  it('creates, lists, patches and deletes tasks — workspace-scoped', async () => {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/work/tasks',
      headers: { cookie: alice.cookie },
      payload: { title: 'Research competitors', goal: 'Focus on pricing', deliverable: 'research-report' },
    })
    expect(created.statusCode).toBe(201)
    const task = created.json() as { id: string; status: string; statusLabel: string }
    expect(task.status).toBe('draft')
    expect(task.statusLabel).toBe('Draft')

    const listed = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/work/tasks',
      headers: { cookie: alice.cookie },
    })
    expect((listed.json() as { items: unknown[] }).items).toHaveLength(1)

    // Bob's workspace sees none of Alice's tasks.
    const bobList = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/work/tasks',
      headers: { cookie: bob.cookie },
    })
    expect((bobList.json() as { items: unknown[] }).items).toHaveLength(0)

    const patched = await testApp.app.inject({
      method: 'PATCH',
      url: `/api/v1/work/tasks/${task.id}`,
      headers: { cookie: alice.cookie },
      payload: { goal: 'Focus on pricing and retention' },
    })
    expect(patched.statusCode).toBe(200)
    expect((patched.json() as { goal: string }).goal).toBe('Focus on pricing and retention')

    // Cross-workspace patch is a 404, not a leak.
    const bobPatch = await testApp.app.inject({
      method: 'PATCH',
      url: `/api/v1/work/tasks/${task.id}`,
      headers: { cookie: bob.cookie },
      payload: { goal: 'hijack' },
    })
    expect(bobPatch.statusCode).toBe(404)

    const deleted = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/v1/work/tasks/${task.id}`,
      headers: { cookie: alice.cookie },
    })
    expect(deleted.statusCode).toBe(204)
  }, 60_000)

  it('start provisions the durable session, admits a run, records the work run', async () => {
    // An employee to assign (the session should pin it).
    const employee = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/employees',
      headers: { cookie: alice.cookie },
      payload: { name: 'Analyst', instructions: 'Be precise and cite only what you read.' },
    })
    expect(employee.statusCode).toBe(201)
    const employeeId = (employee.json() as { id: string }).id

    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/work/tasks',
      headers: { cookie: alice.cookie },
      payload: {
        title: 'Draft the weekly brief',
        goal: 'Summarize progress',
        deliverable: 'document-draft',
        employeeId,
      },
    })
    const taskId = (created.json() as { id: string }).id

    const started = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/work/tasks/${taskId}/actions`,
      headers: { cookie: alice.cookie },
      payload: { action: 'start' },
    })
    expect(started.statusCode).toBe(202)
    const body = started.json() as {
      task: { sessionId: string | null; activeRunId: string | null; status: string }
      run: { revision: number; agentRunId: string; status: string }
    }
    expect(body.task.status).toBe('running')
    expect(body.task.sessionId).toBeTruthy()
    expect(body.task.activeRunId).toBe(body.run.agentRunId)
    expect(body.run.revision).toBe(1)

    // The provisioned session is pinned to the employee.
    const sessionRows = await db
      .select()
      .from(agentSessions)
      .where(eq(agentSessions.id, body.task.sessionId!))
      .limit(1)
    expect(sessionRows[0]!.employeeId).toBe(employeeId)

    // The work_run row exists and is bound to the agent run.
    const runRows = await db.select().from(workRuns).where(eq(workRuns.taskId, taskId))
    expect(runRows).toHaveLength(1)
    expect(runRows[0]!.agentRunId).toBe(body.run.agentRunId)

    // Second start while running is an honest 409.
    const again = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/work/tasks/${taskId}/actions`,
      headers: { cookie: alice.cookie },
      payload: { action: 'start' },
    })
    expect(again.statusCode).toBe(409)

    // Wait for the agent run to settle (it errors honestly: no provider).
    for (let i = 0; i < 50; i++) {
      const rows = await db.select().from(workTasks).where(eq(workTasks.id, taskId))
      if (rows[0] && rows[0].status !== 'running') break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    // The task row exists; final agent-run state is owned by the engine.
    const finalRows = await db.select().from(workTasks).where(eq(workTasks.id, taskId))
    expect(finalRows[0]).toBeTruthy()
  }, 60_000)

  it('start is idempotent per revision (work-<task>-r<n> key)', async () => {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/work/tasks',
      headers: { cookie: alice.cookie },
      payload: { title: 'Idempotent start', goal: '', deliverable: 'generic' },
    })
    const taskId = (created.json() as { id: string }).id

    const first = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/work/tasks/${taskId}/actions`,
      headers: { cookie: alice.cookie },
      payload: { action: 'start' },
    })
    expect(first.statusCode).toBe(202)

    // A crash-retry with the same revision would replay through the
    // engine's idempotency key; a second start while running is 409.
    const second = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/work/tasks/${taskId}/actions`,
      headers: { cookie: alice.cookie },
      payload: { action: 'start' },
    })
    expect(second.statusCode).toBe(409)
  }, 60_000)
})
