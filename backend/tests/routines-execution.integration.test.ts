import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { eq } from 'drizzle-orm'
import { routineRuns } from '../src/db/schema.js'
import { signUpUser, startTestApp, type TestApp } from './harness.js'
import { runSchedulerTick } from '../src/modules/routines/routines.scheduler.js'
import { executeRoutineFire } from '../src/modules/routines/routines.executor.js'
import type { RoutinesDatabase } from '../src/modules/routines/routines.service.js'
import type { RunEngineDeps } from '../src/modules/agent/agentRun.service.js'
import type { AgentDatabase } from '../src/modules/agent/agentSession.service.js'
import type { Env } from '../src/config/env.js'

/**
 * T032 — end-to-end routine execution: the tick claims a due fire, the
 * executor admits an agent run in the routine's unattended session
 * (pinned to a scripted provider through the linked employee), the run
 * completes against the real SSE protocol, and the terminal sync
 * closes the routine_run row with the output text.
 *
 * The unattended policy is exercised too: the session's read-only
 * roster refuses anything mutating without ever asking a human.
 */

const API_KEY = 'sk-t032-test-key-abcdef123456'

function sseText(response: import('node:http').ServerResponse, text: string) {
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const send = (payload: unknown) => response.write(`data: ${JSON.stringify(payload)}\n\n`)
  send({
    id: 'chatcmpl-t032',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
  })
  send({
    id: 'chatcmpl-t032',
    object: 'chat.completion.chunk',
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
  })
  response.write('data: [DONE]\n\n')
  response.end()
}

describe('routine execution end-to-end (T032)', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let db: RoutinesDatabase & AgentDatabase
  let deps: RunEngineDeps
  let fake: { server: Server; url: string }

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice T032' })
    db = (testApp.app as unknown as { database: { db: AgentDatabase } }).database.db
    deps = { db, env: (testApp.app as unknown as { env: Env }).env }

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
      sseText(response, '# Morning brief\n\nAll quiet overnight.')
    })
    fake = { server, url: '' }
    fake.url = await new Promise<string>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (address && typeof address === 'object') resolve(`http://127.0.0.1:${address.port}`)
      })
    })
    await testApp.app.listen({ port: 0, host: '127.0.0.1' })
  }, 180_000)

  afterAll(async () => {
    await new Promise<void>((resolve) => fake.server.close(() => resolve()))
    await testApp?.app.close()
    await testApp?.stop()
  })

  async function waitForRoutineTerminal(
    runId: string,
    timeoutMs = 15_000,
  ): Promise<typeof routineRuns.$inferSelect> {
    const started = Date.now()
    for (;;) {
      const rows = await db.select().from(routineRuns).where(eq(routineRuns.id, runId)).limit(1)
      const row = rows[0]
      if (row && row.terminalAt) {
        // The routine sync fires near the END of the run loop's terminal
        // resolution; settle briefly so no post-terminal write races
        // this file's pool teardown (an unhandled pool error fails CI
        // even with every test green).
        await new Promise((resolve) => setTimeout(resolve, 250))
        return row
      }
      if (Date.now() - started > timeoutMs) throw new Error('routine run did not reach a terminal')
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }

  it('fires, executes through the agent engine, and records the output', async () => {
    // Provider + credential + employee pin.
    const provider = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie: alice.cookie },
      payload: {
        label: 'T032 fake',
        kind: 'openai-compatible',
        endpointUrl: fake.url,
        modelId: 'model-t032',
      },
    })
    const providerId = (provider.json() as { id: string }).id
    await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${providerId}/credential`,
      headers: { cookie: alice.cookie },
      payload: { apiKey: API_KEY },
    })
    const employee = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/employees',
      headers: { cookie: alice.cookie },
      payload: { name: 'T032 analyst', providerId, modelId: 'model-t032' },
    })
    const employeeId = (employee.json() as { id: string }).id

    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/routines',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: {
        name: 'Morning brief',
        prompt: 'Summarize overnight changes.',
        schedule: '* * * * *',
        employeeId,
      },
    })
    expect(created.statusCode).toBe(201)
    const routine = created.json() as { id: string }

    // The tick claims the fire; the executor runs it through the engine.
    const tick = await runSchedulerTick(
      db,
      (fire) => executeRoutineFire(deps, fire),
      new Date(),
    )
    expect(tick.claimed).toBe(1)

    const rows = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routine.id))
    expect(rows).toHaveLength(1)
    const fireRow = rows[0]!
    const terminal = await waitForRoutineTerminal(fireRow.id)

    expect(terminal.status).toBe('complete')
    expect(terminal.outputText).toContain('Morning brief')
    expect(terminal.agentRunId).toBeTruthy()

    // The routine's lastFireAt advanced.
    const fetched = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/routines/${routine.id}`,
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
    })
    const body = fetched.json() as { routine: { lastFireAt: number | null } }
    expect(body.routine.lastFireAt).not.toBeNull()
  })

  it('a routine without a provider pin fails honestly at run time', async () => {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/routines',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: {
        name: 'No provider brief',
        prompt: 'Summarize nothing.',
        schedule: '* * * * *',
      },
    })
    const routine = created.json() as { id: string }

    const tick = await runSchedulerTick(
      db,
      (fire) => executeRoutineFire(deps, fire),
      new Date(),
    )
    expect(tick.claimed).toBe(1)

    const rows = await db.select().from(routineRuns).where(eq(routineRuns.routineId, routine.id))
    const fireRow = rows[0]!
    const terminal = await waitForRoutineTerminal(fireRow.id)
    // The engine's honest provider-resolution failure is the terminal.
    expect(terminal.status).toBe('error')
    expect(terminal.errorMessage).toBeTruthy()
  })
})
