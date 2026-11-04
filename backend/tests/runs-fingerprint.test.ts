import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { and, eq } from 'drizzle-orm'
import { runDtoSchema } from '@uni/contracts'
import { runs } from '../src/db/schema.js'
import { createDatabase } from '../src/db/client.js'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * Original N016 — run request fingerprinting. An idempotency key is
 * bound to the canonical EFFECTIVE request (conversation, answered user
 * node, provider, effective model). Before this fix the replay lookup
 * returned ANY stored run for the key without comparing inputs: a client
 * retrying the same key against a different conversation, message,
 * provider, or model silently received an unrelated run. Now:
 *
 *   same key + same effective request  → the one owned run, reused
 *   same key + different request       → 409 conflict, original intact
 *
 * The effective model is what the run actually used — the request's
 * explicit model or the provider default in force at creation — so
 * "explicit model-alpha" and "omitted (default = model-alpha)" are the
 * SAME request, while "omitted, default later changed" is DIFFERENT.
 *
 * Legacy rows (created before migration 0009; NULL fingerprint) derive
 * their binding from their own columns, so in-flight retries keep
 * working while changed-input retries still conflict.
 */

const API_KEY = 'sk-fingerprint-test-key-abcdef123456'

describe('run request fingerprinting (N016)', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let bob: { cookie: string }
  let fake: { server: Server; url: string; requests: () => number }
  let database: ReturnType<typeof createDatabase>
  let providerId: string
  let conversationA: { conversationId: string; nodeId: string }
  let conversationASecondNode: string
  let conversationB: { conversationId: string; nodeId: string }

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Fingerprint' })
    bob = await signUpUser(testApp.app, { name: 'Bob Fingerprint' })

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
        choices: [{ index: 0, delta: { content: 'fingerprinted reply' }, finish_reason: null }],
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

    // Alice's provider (default model model-alpha) and conversations.
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie: alice.cookie },
      payload: {
        label: 'Fingerprint fake',
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

    conversationA = await createConversationWithUserNode(alice.cookie, 'Conversation A prompt')
    conversationB = await createConversationWithUserNode(alice.cookie, 'Conversation B prompt')
    // A second user node in conversation A (a different answered message).
    const secondNode = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationA.conversationId}/nodes`,
      headers: { cookie: alice.cookie },
      payload: { role: 'user', content: 'Second message in A', status: 'complete' },
    })
    expect(secondNode.statusCode).toBe(201)
    conversationASecondNode = (secondNode.json() as { node: { id: string } }).node.id
  }, 180_000)

  afterAll(async () => {
    if (fake) await new Promise<void>((resolve) => fake.server.close(() => resolve()))
    if (database) await database.pool.end()
    await testApp?.app.close()
    await testApp?.stop()
  })

  async function createConversationWithUserNode(cookie: string, prompt: string) {
    const conversationResponse = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { cookie },
      payload: { title: 'Fingerprint test' },
    })
    expect(conversationResponse.statusCode).toBe(201)
    const conversation = conversationResponse.json() as { id: string }
    const nodeResponse = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversation.id}/nodes`,
      headers: { cookie },
      payload: { role: 'user', content: prompt, status: 'complete' },
    })
    expect(nodeResponse.statusCode).toBe(201)
    const node = (nodeResponse.json() as { node: { id: string } }).node
    return { conversationId: conversation.id, nodeId: node.id }
  }

  async function startRun(
    cookie: string,
    conversationId: string,
    parentNodeId: string,
    provider: string,
    options: { idempotencyKey?: string; modelId?: string } = {},
  ) {
    const response = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/runs`,
      headers: { cookie },
      payload: {
        parentNodeId,
        providerId: provider,
        idempotencyKey: options.idempotencyKey,
        modelId: options.modelId,
      },
    })
    return { status: response.statusCode, body: response.json() as Record<string, unknown> }
  }

  async function waitForTerminal(runId: string, cookie: string, timeoutMs = 20_000) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const response = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/runs/${runId}`,
        headers: { cookie },
      })
      expect(response.statusCode).toBe(200)
      const run = runDtoSchema.parse(response.json())
      if (['complete', 'stopped', 'repetition_stopped', 'error'].includes(run.status)) return run
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    throw new Error(`run ${runId} never reached a terminal status`)
  }

  let aliceWorkspace: string | null = null
  async function aliceWorkspaceId(): Promise<string | null> {
    if (aliceWorkspace) return aliceWorkspace
    const response = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/me',
      headers: { cookie: alice.cookie },
    })
    const body = response.json() as { workspace?: { id?: string } }
    aliceWorkspace = body.workspace?.id ?? null
    return aliceWorkspace
  }

  async function countRunsForKey(key: string): Promise<number> {
    const rows = await database.db
      .select({ id: runs.id })
      .from(runs)
      .where(and(eq(runs.idempotencyKey, key), eq(runs.workspaceId, (await aliceWorkspaceId())!)))
    return rows.length
  }

  it('replays the same key with the same effective request as one run', async () => {
    const first = await startRun(alice.cookie, conversationA.conversationId, conversationA.nodeId, providerId, {
      idempotencyKey: 'key-replay-same',
    })
    expect(first.status).toBe(201)
    expect(first.body.reused).toBe(false)
    const run = runDtoSchema.parse(first.body.run)
    await waitForTerminal(run.id, alice.cookie)
    const requestsAfterFirst = fake.requests()

    const retry = await startRun(alice.cookie, conversationA.conversationId, conversationA.nodeId, providerId, {
      idempotencyKey: 'key-replay-same',
    })
    expect(retry.status).toBe(200)
    expect(retry.body.reused).toBe(true)
    expect((retry.body.run as { id: string }).id).toBe(run.id)
    expect(await countRunsForKey('key-replay-same')).toBe(1)
    // Replay never re-invoked the provider.
    expect(fake.requests()).toBe(requestsAfterFirst)
  })

  it('conflicts when the same key answers a different message', async () => {
    const retry = await startRun(
      alice.cookie,
      conversationA.conversationId,
      conversationASecondNode,
      providerId,
      { idempotencyKey: 'key-replay-same' },
    )
    expect(retry.status).toBe(409)
    expect(retry.body.code).toBe('conflict')
    expect(typeof retry.body.message).toBe('string')
    // The original run is untouched and still the key's only binding.
    expect(await countRunsForKey('key-replay-same')).toBe(1)
  })

  it('conflicts when the same key names a different model', async () => {
    const retry = await startRun(alice.cookie, conversationA.conversationId, conversationA.nodeId, providerId, {
      idempotencyKey: 'key-replay-same',
      modelId: 'model-beta',
    })
    expect(retry.status).toBe(409)
    expect(retry.body.code).toBe('conflict')
  })

  it('conflicts when the same key targets a different conversation', async () => {
    const retry = await startRun(alice.cookie, conversationB.conversationId, conversationB.nodeId, providerId, {
      idempotencyKey: 'key-replay-same',
    })
    expect(retry.status).toBe(409)
    expect(retry.body.code).toBe('conflict')
  })

  it('treats an explicit model equal to the default as the SAME effective request', async () => {
    // Created WITHOUT an explicit model (effective = provider default
    // model-alpha); retried WITH the explicit same model — same binding.
    const first = await startRun(alice.cookie, conversationB.conversationId, conversationB.nodeId, providerId, {
      idempotencyKey: 'key-effective-model',
    })
    expect(first.status).toBe(201)
    const run = runDtoSchema.parse(first.body.run)
    await waitForTerminal(run.id, alice.cookie)

    const retry = await startRun(alice.cookie, conversationB.conversationId, conversationB.nodeId, providerId, {
      idempotencyKey: 'key-effective-model',
      modelId: 'model-alpha',
    })
    expect(retry.status).toBe(200)
    expect(retry.body.reused).toBe(true)
    expect((retry.body.run as { id: string }).id).toBe(run.id)
  })

  it('conflicts when the provider default changed since the stored run', async () => {
    const patched = await testApp.app.inject({
      method: 'PATCH',
      url: `/api/v1/providers/${providerId}`,
      headers: { cookie: alice.cookie },
      payload: { modelId: 'model-gamma' },
    })
    expect(patched.statusCode).toBe(200)

    // Same literal request (no explicit model) — but the EFFECTIVE model
    // is now model-gamma, not the model-alpha the stored run executed.
    const retry = await startRun(alice.cookie, conversationB.conversationId, conversationB.nodeId, providerId, {
      idempotencyKey: 'key-effective-model',
    })
    expect(retry.status).toBe(409)
    expect(retry.body.code).toBe('conflict')
  })

  it('keeps keys workspace-scoped: another workspace creates its own run with the same key', async () => {
    // Bob has his own provider + conversation; the same key string must
    // not collide with Alice's binding (unique index is per workspace).
    const bobProvider = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie: bob.cookie },
      payload: {
        label: 'Bob fingerprint fake',
        kind: 'openai-compatible',
        endpointUrl: fake.url,
        modelId: 'model-bob',
      },
    })
    expect(bobProvider.statusCode).toBe(201)
    const bobProviderId = (bobProvider.json() as { id: string }).id
    const bobSetKey = await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${bobProviderId}/credential`,
      headers: { cookie: bob.cookie },
      payload: { apiKey: API_KEY },
    })
    expect(bobSetKey.statusCode).toBe(200)
    const bobConversation = await createConversationWithUserNode(bob.cookie, 'Bob prompt')

    const created = await startRun(bob.cookie, bobConversation.conversationId, bobConversation.nodeId, bobProviderId, {
      idempotencyKey: 'key-replay-same',
    })
    expect(created.status).toBe(201)
    expect(created.body.reused).toBe(false)
    // Alice's binding is untouched — her run remains the only one in her
    // workspace for this key.
    expect(await countRunsForKey('key-replay-same')).toBe(1)
  })

  it('derives the binding for legacy rows (NULL fingerprint) from their own columns', async () => {
    // Simulate a pre-migration run row: fingerprint NULL, terminal state,
    // bound to conversation B's node with the provider's current default
    // (model-gamma after the PATCH above).
    const legacyRunId = `legacy-${Date.now()}`
    await database.db.insert(runs).values({
      id: legacyRunId,
      workspaceId: (await aliceWorkspaceId())!,
      conversationId: conversationB.conversationId,
      parentNodeId: conversationB.nodeId,
      providerId,
      providerKind: 'openai-compatible',
      providerEndpoint: fake.url,
      modelId: 'model-gamma',
      status: 'complete',
      outputText: 'legacy output',
      idempotencyKey: 'key-legacy-null-fingerprint',
      requestFingerprint: null,
      terminalAt: new Date(),
    })

    // Same effective request (no explicit model; provider default is
    // model-gamma) → replays the legacy run instead of conflicting.
    const replay = await startRun(alice.cookie, conversationB.conversationId, conversationB.nodeId, providerId, {
      idempotencyKey: 'key-legacy-null-fingerprint',
    })
    expect(replay.status).toBe(200)
    expect(replay.body.reused).toBe(true)
    expect((replay.body.run as { id: string }).id).toBe(legacyRunId)

    // Different effective request (explicit different model) → conflict,
    // proving legacy rows still enforce the binding.
    const conflict = await startRun(
      alice.cookie,
      conversationB.conversationId,
      conversationB.nodeId,
      providerId,
      { idempotencyKey: 'key-legacy-null-fingerprint', modelId: 'model-beta' },
    )
    expect(conflict.status).toBe(409)
    expect(conflict.body.code).toBe('conflict')
  })

  it('stores the fingerprint on every keyed run row', async () => {
    const created = await startRun(alice.cookie, conversationA.conversationId, conversationA.nodeId, providerId, {
      idempotencyKey: 'key-stored-fingerprint',
      modelId: 'model-gamma',
    })
    expect(created.status).toBe(201)
    const run = runDtoSchema.parse(created.body.run)
    await waitForTerminal(run.id, alice.cookie)
    const rows = await database.db
      .select({ fingerprint: runs.requestFingerprint })
      .from(runs)
      .where(eq(runs.id, run.id))
    expect(rows[0]?.fingerprint).toMatch(/^[0-9a-f]{64}$/)
  })
})
