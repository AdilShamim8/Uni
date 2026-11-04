import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { runDtoSchema } from '@uni/contracts'
import { runs } from '../src/db/schema.js'
import { createDatabase } from '../src/db/client.js'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * N021 — durable creation-rate accounting. The per-minute run-creation
 * limit is counted from the runs table itself (created_at, DB clock)
 * inside the admission transaction — the record other processes and a
 * restarted process both see. The old accounting was a process-local
 * Map: creations made by another process (or before a restart) were
 * invisible, so each process admitted a full extra budget.
 *
 * Each test uses its OWN workspace (fresh user) so windows are
 * independent. "Other-process creations" are modeled by seeding run
 * rows directly in the database — exactly what another process (or the
 * same process before a restart) leaves behind.
 */

const API_KEY = 'sk-rate-test-key-abcdef123456'

describe('durable creation-rate accounting (N021)', () => {
  let testApp: TestApp
  let fake: { server: Server; url: string }
  let database: ReturnType<typeof createDatabase>

  beforeAll(async () => {
    testApp = await startTestApp()

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
        id: 'chatcmpl-rate',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content: 'rate reply' }, finish_reason: null }],
      })
      send({
        id: 'chatcmpl-rate',
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
  }, 180_000)

  afterAll(async () => {
    if (fake) await new Promise<void>((resolve) => fake.server.close(() => resolve()))
    if (database) await database.pool.end()
    await testApp?.app.close()
    await testApp?.stop()
  })

  interface Workspace {
    cookie: string
    workspaceId: string
    providerId: string
    conversationId: string
    parentNodeId: string
  }

  /** Fresh user → own workspace with a keyed provider and one node. */
  async function setupWorkspace(name: string): Promise<Workspace> {
    const user = await signUpUser(testApp.app, { name })
    const session = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: user.cookie },
    })
    const workspaceId = (session.json() as { workspace: { id: string } }).workspace.id
    const provider = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie: user.cookie },
      payload: {
        label: `Rate fake ${name}`,
        kind: 'openai-compatible',
        endpointUrl: fake.url,
        modelId: 'model-alpha',
      },
    })
    expect(provider.statusCode).toBe(201)
    const providerId = (provider.json() as { id: string }).id
    const setKey = await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${providerId}/credential`,
      headers: { cookie: user.cookie },
      payload: { apiKey: API_KEY },
    })
    expect(setKey.statusCode).toBe(200)
    const conversation = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { cookie: user.cookie },
      payload: { title: `Rate test ${name}` },
    })
    expect(conversation.statusCode).toBe(201)
    const conversationId = (conversation.json() as { id: string }).id
    const node = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/nodes`,
      headers: { cookie: user.cookie },
      payload: { role: 'user', content: `Rate probe ${name}`, status: 'complete' },
    })
    expect(node.statusCode).toBe(201)
    return {
      cookie: user.cookie,
      workspaceId,
      providerId,
      conversationId,
      parentNodeId: (node.json() as { node: { id: string } }).node.id,
    }
  }

  /**
   * Seed finished run rows as "another process's creations": completed,
   * terminal, zero active — only the creation TIMESTAMP matters.
   */
  async function seedCreations(
    workspace: Workspace,
    count: number,
    createdAt: Date,
  ): Promise<void> {
    const values = Array.from({ length: count }, () => ({
      id: randomUUID(),
      workspaceId: workspace.workspaceId,
      conversationId: workspace.conversationId,
      parentNodeId: workspace.parentNodeId,
      providerId: workspace.providerId,
      providerKind: 'openai-compatible',
      providerEndpoint: fake.url,
      modelId: 'model-alpha',
      status: 'complete',
      outputText: 'seeded',
      usage: null,
      idempotencyKey: null,
      requestFingerprint: null,
      errorCode: null,
      errorMessage: null,
      createdAt,
      updatedAt: createdAt,
      terminalAt: createdAt,
    }))
    await database.db.insert(runs).values(values)
  }

  function createRun(
    workspace: Workspace,
    idempotencyKey: string,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    return testApp.app
      .inject({
        method: 'POST',
        url: `/api/v1/conversations/${workspace.conversationId}/runs`,
        headers: { cookie: workspace.cookie },
        payload: {
          parentNodeId: workspace.parentNodeId,
          providerId: workspace.providerId,
          idempotencyKey,
        },
      })
      .then((response) => ({ status: response.statusCode, body: response.json() as Record<string, unknown> }))
  }

  it('creations made outside this process\u2019s memory count toward the limit', async () => {
    const workspace = await setupWorkspace('OutsideProcess')
    // Another process (or this one before a restart) already created 60
    // runs this minute — the old Map could not see any of them.
    await seedCreations(workspace, 60, new Date())

    const outcome = await createRun(workspace, 'rate-outside-1')
    expect(outcome.status).toBe(429)
    expect(outcome.body.code).toBe('rate_limited')
    expect(outcome.body.message).toBe('Too many runs started. Wait a moment and try again.')

    // Durable state agrees: the rejected create inserted nothing.
    const rows = await database.db
      .select({ id: runs.id })
      .from(runs)
      .where(eq(runs.workspaceId, workspace.workspaceId))
    expect(rows.length).toBe(60)
  })

  it('API-created runs fill the same window: the 60th passes, the 61st is typed 429', async () => {
    const workspace = await setupWorkspace('ApiWindow')
    await seedCreations(workspace, 59, new Date())

    const sixtieth = await createRun(workspace, 'rate-window-60')
    expect(sixtieth.status).toBe(201)
    expect(sixtieth.body.reused).toBe(false)

    const sixtyFirst = await createRun(workspace, 'rate-window-61')
    expect(sixtyFirst.status).toBe(429)
    expect(sixtyFirst.body.code).toBe('rate_limited')
  })

  it('creations older than the trailing minute age out of the window', async () => {
    const workspace = await setupWorkspace('AgedOut')
    // 60 creations, but 61+ seconds old — outside the window.
    await seedCreations(workspace, 60, new Date(Date.now() - 61_000))

    const outcome = await createRun(workspace, 'rate-aged-1')
    expect(outcome.status).toBe(201)
    expect(runDtoSchema.parse(outcome.body.run).status).toBeTruthy()
  })

  it('an idempotent replay at a full window is never rate-limited', async () => {
    const workspace = await setupWorkspace('ReplayAtFull')
    const first = await createRun(workspace, 'rate-replay-key')
    expect(first.status).toBe(201)

    // Fill the rest of the window (the first run already counts).
    await seedCreations(workspace, 59, new Date())

    // Retrying the SAME send must replay its run — a retry is not a
    // new creation and must not be blocked by the rate it already paid.
    const replay = await createRun(workspace, 'rate-replay-key')
    expect(replay.status).toBe(200)
    expect(replay.body.reused).toBe(true)
    expect((replay.body.run as { id: string }).id).toBe((first.body.run as { id: string }).id)

    // A genuinely NEW send at the now-full window is still limited.
    const next = await createRun(workspace, 'rate-replay-next')
    expect(next.status).toBe(429)
    expect(next.body.code).toBe('rate_limited')
  })
})
