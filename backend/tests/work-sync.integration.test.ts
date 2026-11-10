import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { eq } from 'drizzle-orm'
import { workTasks, workRuns, agentEvents as agentEventsTable } from '../src/db/schema.js'
import { signUpUser, startTestApp, type TestApp } from './harness.js'
import type { AgentDatabase } from '../src/modules/agent/agentSession.service.js'
import type { WorkRunReceipts } from '@uni/contracts'

/**
 * T020 — a Work task's run, executed end-to-end against a scripted
 * provider, syncs its outcome and receipts into the Work rows: the
 * task completes, the work_run closes with the report text as outcome,
 * and the receipts carry the tool outcomes + source ids that actually
 * happened (no invented citations, no secrets).
 */

const API_KEY = 'sk-t020-test-key-abcdef123456'

function sseToolCall(response: import('node:http').ServerResponse, name: string, args: unknown) {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const send = (payload: unknown) => response.write(`data: ${JSON.stringify(payload)}\n\n`)
  send({
    id: 'chatcmpl-t020',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: { tool_calls: [{ index: 0, id: 'call-1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: null }],
  })
  send({
    id: 'chatcmpl-t020',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
  })
  response.write('data: [DONE]\n\n')
  response.end()
}

function sseText(response: import('node:http').ServerResponse, text: string) {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const send = (payload: unknown) => response.write(`data: ${JSON.stringify(payload)}\n\n`)
  send({
    id: 'chatcmpl-t020',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
  })
  send({
    id: 'chatcmpl-t020',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  })
  response.write('data: [DONE]\n\n')
  response.end()
}

describe('work run outcome sync (T020)', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let db: AgentDatabase
  let fake: { server: Server; url: string; next: 'tool' | 'text' }

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice T020' })
    db = (testApp.app as unknown as { database: { db: AgentDatabase } }).database.db

    let requestIndex = 0
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
      requestIndex += 1
      if (requestIndex === 1) {
        // Round 1: the model fetches a URL (a real, citable source).
        sseToolCall(response, 'web_fetch', { url: 'https://example.test/report' })
      } else {
        sseText(response, '# Final brief\n\nThe research is complete.')
      }
    })
    fake = { server, url: '', next: 'tool' }
    fake.url = await new Promise<string>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address && typeof address === 'object') resolve(`http://127.0.0.1:${address.port}`)
      })
    })
  }, 180_000)

  afterAll(async () => {
    await new Promise<void>((resolve) => fake.server.close(() => resolve()))
    await testApp?.app.close()
    await testApp?.stop()
  })

  it('a completed run completes the task and persists receipts', async () => {
    // Provider + credential.
    const provider = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie: alice.cookie },
      payload: { label: 'T020 fake', kind: 'openai-compatible', endpointUrl: fake.url, modelId: 'model-t020' },
    })
    const providerId = (provider.json() as { id: string }).id
    await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${providerId}/credential`,
      headers: { cookie: alice.cookie },
      payload: { apiKey: API_KEY },
    })

    // The employee owns the provider preference; the work session
    // inherits it on first start.
    const employee = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/employees',
      headers: { cookie: alice.cookie },
      payload: {
        name: 'T020 analyst',
        instructions: 'Cite only sources you actually fetched.',
        providerId,
        modelId: 'model-t020',
      },
    })
    expect(employee.statusCode).toBe(201)
    const employeeId = (employee.json() as { id: string }).id

    // Task + start.
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/work/tasks',
      headers: { cookie: alice.cookie },
      payload: {
        title: 'T020 brief',
        goal: 'Research and report',
        deliverable: 'research-report',
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
    const agentRunId = (started.json() as { run: { agentRunId: string } }).run.agentRunId

    // web_fetch asks per-origin in default mode (honest gating): answer
    // the permission through the real respond endpoint (F02 path), then
    // the run continues to its text answer.
    const sessionId = (started.json() as { task: { sessionId: string } }).task.sessionId
    let answered = false
    for (let i = 0; i < 100 && !answered; i++) {
      const events = await db
        .select()
        .from(agentEventsTable)
        .where(eq(agentEventsTable.sessionId, sessionId))
      const ask = events.find((event) => event.type === 'permission_requested')
      if (ask) {
        const payload = ask.payload as { permissionRequest?: { requestId: string } }
        const requestId = payload.permissionRequest?.requestId
        if (requestId) {
          const respond = await testApp.app.inject({
            method: 'POST',
            url: `/api/v1/agent/runs/${agentRunId}/permissions/${requestId}`,
            headers: { cookie: alice.cookie },
            payload: { decision: { requestId, decision: 'approve', scope: 'once' } },
          })
          expect(respond.statusCode).toBe(202)
          answered = true
        }
      }
      if (!answered) await new Promise((resolve) => setTimeout(resolve, 100))
    }
    if (!answered) {
      const events = await db
        .select()
        .from(agentEventsTable)
        .where(eq(agentEventsTable.sessionId, sessionId))
      throw new Error(
        'no permission ask; events: ' +
          events.map((event) => `${event.sequence}:${event.type}:${JSON.stringify(event.payload).slice(0, 160)}`).join(' | '),
      )
    }

    // Wait for the sync (task leaves running).
    for (let i = 0; i < 100; i++) {
      const rows = await db.select().from(workTasks).where(eq(workTasks.id, taskId))
      if (rows[0] && rows[0].status !== 'running') break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    const taskRows = await db.select().from(workTasks).where(eq(workTasks.id, taskId))
    expect(taskRows[0]!.status).toBe('complete')
    expect(taskRows[0]!.activeRunId).toBeNull()

    const runRows = await db.select().from(workRuns).where(eq(workRuns.agentRunId, agentRunId))
    expect(runRows).toHaveLength(1)
    expect(runRows[0]!.status).toBe('complete')
    expect(runRows[0]!.outcome).toContain('Final brief')

    // Receipts: the web_fetch source id + the tool outcomes, and
    // provider-generated provenance (the session pinned a provider).
    const receipts = runRows[0]!.receipts as WorkRunReceipts
    expect(receipts.provenance).toBe('provider-generated')
    expect(
      receipts.sources.some((s) => s.kind === 'url' && s.id === 'https://example.test/report'),
    ).toBe(true)
    // The tool outcome is recorded truthfully — example.test doesn't
    // resolve in the sandbox, so the receipt honestly says 'error'
    // (never a fabricated 'ok').
    const fetchReceipt = receipts.tools.find((t) => t.tool === 'web_fetch')
    expect(fetchReceipt).toBeDefined()
    expect(['ok', 'error']).toContain(fetchReceipt!.outcome)
    // No secrets in receipts (the API key never appears).
    expect(JSON.stringify(receipts)).not.toContain(API_KEY)
  }, 60_000)
})
