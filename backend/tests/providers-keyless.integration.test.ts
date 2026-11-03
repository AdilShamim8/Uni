import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import {
  conversationDetailDtoSchema,
  createNodeRequestSchema,
  createRunResponseSchema,
  errorEnvelopeSchema,
  providerDtoSchema,
  providerTestResponseSchema,
  runDtoSchema,
} from '@uni/contracts'
import { buildApp } from '../src/app.js'
import { signUpUser, startTestApp, TEST_CREDENTIAL_MASTER_KEY, type TestApp } from './harness.js'

/**
 * N001–N003 — genuine keyless provider support: explicit auth modes
 * persisted on the connection, keyless probes and keyless generation
 * that send NO dummy Authorization header, and the none/bearer/native
 * transport choices on the wire.
 */

interface RecordedRequest {
  url: string
  authorization: string | undefined
  xApiKey: string | undefined
  /** True when the client (the backend probe) destroyed the socket. */
  aborted: boolean
}

function keylessFakeProvider(): {
  server: Server
  requests: RecordedRequest[]
  url: string
  setDelayMs: (ms: number) => void
} {
  const requests: RecordedRequest[] = []
  let delayMs = 0
  const setDelayMs = (ms: number) => {
    delayMs = ms
  }
  const server = createServer((request, response) => {
    const recorded: RecordedRequest = {
      url: request.url ?? '/',
      authorization: request.headers.authorization,
      xApiKey: request.headers['x-api-key'] as string | undefined,
      aborted: false,
    }
    requests.push(recorded)
    // The reliable abort signal: the response connection closed before
    // the response finished — the client destroyed the socket.
    response.on('close', () => {
      if (!response.writableFinished) recorded.aborted = true
    })

    // A keyless local runtime: model discovery and generation answer for
    // requests WITHOUT any credential header, and reject requests that
    // carry one — so a smuggled dummy key fails loudly.
    const hasCredentialHeader =
      typeof request.headers.authorization === 'string' ||
      typeof request.headers['x-api-key'] === 'string'

    if ((request.url ?? '').includes('/models')) {
      if (hasCredentialHeader) {
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'this runtime needs no key — do not send one' }))
        return
      }
      if (delayMs > 0) {
        // Deferred answer — lets a test edit the provider while the
        // check is still in flight (the N006 late-response race).
        setTimeout(() => {
          response.writeHead(200, { 'content-type': 'application/json' })
          response.end(JSON.stringify({ data: [{ id: 'llama-local' }, { id: 'qwen-local' }] }))
        }, delayMs)
        return
      }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ data: [{ id: 'llama-local' }, { id: 'qwen-local' }] }))
      return
    }

    if ((request.url ?? '').includes('/chat/completions')) {
      if (hasCredentialHeader) {
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'this runtime needs no key — do not send one' }))
        return
      }
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
      })
      const send = (payload: unknown) => response.write(`data: ${JSON.stringify(payload)}\n\n`)
      send({
        id: 'chatcmpl-local',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content: 'Keyless ' }, finish_reason: null }],
      })
      send({
        id: 'chatcmpl-local',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: { content: 'local reply' }, finish_reason: null }],
      })
      send({
        id: 'chatcmpl-local',
        object: 'chat.completion.chunk',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      })
      response.write('data: [DONE]\n\n')
      response.end()
      return
    }

    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
  })
  return { server, requests, url: '', setDelayMs }
}

/** Anthropic-protocol gateway that authenticates with Authorization: Bearer. */
function bearerAnthropicGateway(): { server: Server; url: string; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = []
  const server = createServer((request, response) => {
    requests.push({
      url: request.url ?? '/',
      authorization: request.headers.authorization,
      xApiKey: request.headers['x-api-key'] as string | undefined,
      aborted: false,
    })
    if ((request.url ?? '').includes('/models')) {
      // Bearer accepted, x-api-key explicitly NOT accepted.
      if (request.headers.authorization === 'Bearer gw-bearer-key') {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ data: [{ id: 'claude-gw' }] }))
        return
      }
      response.writeHead(401, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'bearer auth required' }))
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
  })
  return { server, requests, url: '' }
}

function listen(server: Server): Promise<string> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address && typeof address === 'object') {
        resolve(`http://127.0.0.1:${address.port}`)
      }
    })
  })
}

describe('providers — explicit auth modes and keyless operation (N001–N003)', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let baseUrl = ''
  let keyless: ReturnType<typeof keylessFakeProvider>
  let gateway: ReturnType<typeof bearerAnthropicGateway>
  let otherEndpoint: ReturnType<typeof keylessFakeProvider>

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Keyless' })
    keyless = keylessFakeProvider()
    keyless.url = await listen(keyless.server)
    gateway = bearerAnthropicGateway()
    gateway.url = await listen(gateway.server)
    otherEndpoint = keylessFakeProvider()
    otherEndpoint.url = await listen(otherEndpoint.server)
    await testApp.app.listen({ port: 0, host: '127.0.0.1' })
    const address = testApp.app.server.address()
    if (address && typeof address === 'object') {
      baseUrl = `http://127.0.0.1:${address.port}`
    }
  }, 180_000)

  afterAll(async () => {
    if (keyless) await new Promise<void>((resolve) => keyless.server.close(() => resolve()))
    if (gateway) await new Promise<void>((resolve) => gateway.server.close(() => resolve()))
    if (otherEndpoint)
      await new Promise<void>((resolve) => otherEndpoint.server.close(() => resolve()))
    await testApp?.stop()
  })

  async function createProvider(payload: Record<string, unknown>) {
    return testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie: alice.cookie },
      payload,
    })
  }

  it('persists an explicit auth mode with a keyless-compatible default', async () => {
    const response = await createProvider({
      label: 'Local Ollama',
      kind: 'openai-compatible',
      endpointUrl: keyless.url,
      modelId: 'llama-local',
    })
    expect(response.statusCode).toBe(201)
    const provider = providerDtoSchema.parse(response.json())
    // Compatible default (N001): keyless-capable protocol → 'none'.
    expect(provider.authMode).toBe('none')
    expect(provider.credential.present).toBe(false)
  })

  it('rejects keyless Anthropic connections at the contract boundary', async () => {
    const response = await createProvider({
      label: 'Anthropic keyless',
      kind: 'anthropic',
      authMode: 'none',
      endpointUrl: gateway.url,
    })
    expect(response.statusCode).toBe(400)
    const envelope = errorEnvelopeSchema.parse(response.json())
    expect(envelope.code).toBe('validation_error')
    // The custom superRefine message surfaces in the flattened details.
    const details = JSON.stringify(envelope.details ?? {})
    expect(details).toContain('requires an API key')
  })

  it('probes and discovers models keyless with NO credential header (N002)', async () => {
    const created = await createProvider({
      label: 'Local Ollama',
      kind: 'openai-compatible',
      endpointUrl: keyless.url,
    })
    expect(created.statusCode).toBe(201)
    const provider = providerDtoSchema.parse(created.json())

    const discovery = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${provider.id}/models`,
      headers: { cookie: alice.cookie },
    })
    expect(discovery.statusCode).toBe(200)
    const result = providerTestResponseSchema.parse(discovery.json())
    expect(result.ok).toBe(true)
    expect(result.message).toContain('without a key')
    expect(result.discoveredModels).toEqual(['llama-local', 'qwen-local'])

    // The wire truth: the outbound probe carried no credential header.
    const probe = keyless.requests.find((request) => request.url.includes('/models'))
    expect(probe).toBeDefined()
    expect(probe!.authorization).toBeUndefined()
    expect(probe!.xApiKey).toBeUndefined()

    // The model list persisted on the provider row.
    const listed = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/providers',
      headers: { cookie: alice.cookie },
    })
    const items = (listed.json() as { items: unknown[] }).items
    const stored = items
      .map((item) => providerDtoSchema.parse(item))
      .find((item) => item.id === provider.id)
    expect(stored?.models).toEqual(['llama-local', 'qwen-local'])
    expect(stored?.credential.status).toBe('connected')
  })

  it('stores a key and switches the connection to its keyed transport (N001)', async () => {
    const created = await createProvider({
      label: 'Local Ollama',
      kind: 'openai-compatible',
      endpointUrl: keyless.url,
    })
    const provider = providerDtoSchema.parse(created.json())
    expect(provider.authMode).toBe('none')

    const setKey = await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${provider.id}/credential`,
      headers: { cookie: alice.cookie },
      payload: { apiKey: 'sk-local-key' },
    })
    expect(setKey.statusCode).toBe(200)
    const keyed = providerDtoSchema.parse(setKey.json())
    expect(keyed.authMode).toBe('bearer')
    expect(keyed.credential.present).toBe(true)

    // Removing the key returns the connection to genuinely keyless.
    const removeKey = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/v1/providers/${provider.id}/credential`,
      headers: { cookie: alice.cookie },
    })
    expect(removeKey.statusCode).toBe(200)
    const backToKeyless = providerDtoSchema.parse(removeKey.json())
    expect(backToKeyless.authMode).toBe('none')
    expect(backToKeyless.credential.present).toBe(false)
  })

  it('keeps an Anthropic connection on its native transport (x-api-key) when keyed', async () => {
    const created = await createProvider({
      label: 'Anthropic native',
      kind: 'anthropic',
      endpointUrl: gateway.url,
    })
    expect(created.statusCode).toBe(201)
    const provider = providerDtoSchema.parse(created.json())
    // Compatible default for a keyed-only protocol: its native transport.
    expect(provider.authMode).toBe('native')

    const setKey = await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${provider.id}/credential`,
      headers: { cookie: alice.cookie },
      payload: { apiKey: 'ant-native-key' },
    })
    const keyed = providerDtoSchema.parse(setKey.json())
    expect(keyed.authMode).toBe('native')
  })

  it('honors an explicit bearer mode on an Anthropic-protocol gateway (N001)', async () => {
    const created = await createProvider({
      label: 'Bearer gateway',
      kind: 'anthropic',
      authMode: 'bearer',
      endpointUrl: gateway.url,
    })
    expect(created.statusCode).toBe(201)
    const provider = providerDtoSchema.parse(created.json())
    expect(provider.authMode).toBe('bearer')

    const setKey = await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${provider.id}/credential`,
      headers: { cookie: alice.cookie },
      payload: { apiKey: 'gw-bearer-key' },
    })
    expect(setKey.statusCode).toBe(200)
    const keyed = providerDtoSchema.parse(setKey.json())
    // Storing a key keeps the explicit choice when it is already the
    // stored mode for that protocol family... bearer stays bearer.
    expect(keyed.authMode).toBe('bearer')

    const test = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${provider.id}/test`,
      headers: { cookie: alice.cookie },
    })
    expect(test.statusCode).toBe(200)
    const result = providerTestResponseSchema.parse(test.json())
    expect(result.ok).toBe(true)

    // Wire truth: Authorization: Bearer, NOT x-api-key.
    const probe = gateway.requests.find((request) => request.url.includes('/models'))
    expect(probe?.authorization).toBe('Bearer gw-bearer-key')
    expect(probe?.xApiKey).toBeUndefined()
  })

  it('generates keyless: a run against a keyless provider sends no credential header (N002)', async () => {
    // 1. Keyless provider with a model.
    const created = await createProvider({
      label: 'Local Ollama',
      kind: 'openai-compatible',
      endpointUrl: keyless.url,
      modelId: 'llama-local',
    })
    const provider = providerDtoSchema.parse(created.json())
    expect(provider.authMode).toBe('none')

    // 2. Conversation + user node.
    const conversationResponse = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { cookie: alice.cookie },
      payload: { title: 'Keyless run' },
    })
    const conversation = conversationResponse.json() as { id: string }
    const nodeBody = createNodeRequestSchema.parse({
      role: 'user',
      content: 'Say something local.',
      status: 'complete',
    })
    const nodeResponse = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversation.id}/nodes`,
      headers: { cookie: alice.cookie },
      payload: nodeBody,
    })
    const node = nodeResponse.json() as { node: { id: string } }

    // 3. Create the run — accepted without any stored credential.
    const runResponse = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversation.id}/runs`,
      headers: { cookie: alice.cookie },
      payload: { parentNodeId: node.node.id, providerId: provider.id },
    })
    expect(runResponse.statusCode).toBe(201)
    const createdRun = createRunResponseSchema.parse(runResponse.json())
    expect(createdRun.run.status).toBe('running')

    // 4. Wait for completion.
    const deadline = Date.now() + 20_000
    let run: ReturnType<typeof runDtoSchema.parse> | null = null
    while (Date.now() < deadline) {
      const poll = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/runs/${createdRun.run.id}`,
        headers: { cookie: alice.cookie },
      })
      run = runDtoSchema.parse(poll.json())
      if (run.status === 'complete' || run.status === 'error') break
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    expect(run?.status).toBe('complete')
    expect(run?.outputText).toContain('Keyless local reply')

    // 5. Wire truth: the generation request carried NO credential header.
    const generation = keyless.requests.find((request) => request.url.includes('/chat/completions'))
    expect(generation).toBeDefined()
    expect(generation!.authorization).toBeUndefined()
    expect(generation!.xApiKey).toBeUndefined()

    // 6. The transcript gained a truthful assistant node.
    const detail = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${conversation.id}`,
      headers: { cookie: alice.cookie },
    })
    const parsed = conversationDetailDtoSchema.parse(detail.json())
    const assistant = parsed.nodes.find((n) => n.role === 'assistant')
    expect(assistant?.status).toBe('complete')
    expect(assistant?.content).toContain('Keyless local reply')
  })

  it('endpoint changes reset verification and withdraw the stale catalog (N006)', async () => {
    // Connected + discovered catalog against the first endpoint.
    const created = await createProvider({
      label: 'Reset on edit',
      kind: 'openai-compatible',
      endpointUrl: keyless.url,
    })
    const provider = providerDtoSchema.parse(created.json())
    const discovery = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${provider.id}/models`,
      headers: { cookie: alice.cookie },
    })
    expect(providerTestResponseSchema.parse(discovery.json()).ok).toBe(true)

    // Editing the endpoint invalidates all of it.
    const patched = await testApp.app.inject({
      method: 'PATCH',
      url: `/api/v1/providers/${provider.id}`,
      headers: { cookie: alice.cookie },
      payload: { endpointUrl: otherEndpoint.url },
    })
    expect(patched.statusCode).toBe(200)
    const edited = providerDtoSchema.parse(patched.json())
    expect(edited.endpointUrl).toBe(otherEndpoint.url)
    expect(edited.credential.status).toBe('untested')
    expect(edited.credential.lastCheckedAt).toBeNull()
    expect(edited.models).toEqual([])

    // A label-only edit must NOT reset verification.
    const discovered2 = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${provider.id}/models`,
      headers: { cookie: alice.cookie },
    })
    expect(providerTestResponseSchema.parse(discovered2.json()).ok).toBe(true)
    const relabeled = await testApp.app.inject({
      method: 'PATCH',
      url: `/api/v1/providers/${provider.id}`,
      headers: { cookie: alice.cookie },
      payload: { label: 'Renamed only' },
    })
    const after = providerDtoSchema.parse(relabeled.json())
    expect(after.credential.status).toBe('connected')
    expect(after.models).toEqual(['llama-local', 'qwen-local'])
  })

  it('a late check response cannot verify an edited profile (N006)', async () => {
    // Slow first endpoint: the probe is still in flight when the user
    // edits the provider.
    keyless.setDelayMs(400)
    const created = await createProvider({
      label: 'Race edit',
      kind: 'openai-compatible',
      endpointUrl: keyless.url,
    })
    const provider = providerDtoSchema.parse(created.json())

    // Start the check (do not await yet).
    const checkPromise = testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${provider.id}/test`,
      headers: { cookie: alice.cookie },
    })

    // Edit the endpoint while the probe is in flight.
    await new Promise((resolve) => setTimeout(resolve, 80))
    const patched = await testApp.app.inject({
      method: 'PATCH',
      url: `/api/v1/providers/${provider.id}`,
      headers: { cookie: alice.cookie },
      payload: { endpointUrl: otherEndpoint.url },
    })
    expect(patched.statusCode).toBe(200)
    keyless.setDelayMs(0)

    // The late probe result is discarded — honest superseded answer,
    // the row stays untested with no stale catalog.
    const finished = await checkPromise
    expect(finished.statusCode).toBe(200)
    const result = providerTestResponseSchema.parse(finished.json())
    expect(result.ok).toBe(false)
    expect(result.message).toContain('discarded')
    expect(result.discoveredModels).toBeNull()
    const body = finished.json() as { provider?: unknown }
    const after = providerDtoSchema.parse(body.provider)
    expect(after.credential.status).toBe('untested')
    expect(after.models).toEqual([])
  })

  it('a client disconnect aborts the outbound probe and writes nothing (N008)', async () => {
    // Slow endpoint: the probe is still in flight when the client goes away.
    keyless.setDelayMs(500)
    const created = await createProvider({
      label: 'Cancel me',
      kind: 'openai-compatible',
      endpointUrl: keyless.url,
    })
    const provider = providerDtoSchema.parse(created.json())

    // Real socket: start the check, then disconnect the client.
    const controller = new AbortController()
    const checkPromise = fetch(`${baseUrl}/api/v1/providers/${provider.id}/test`, {
      method: 'POST',
      headers: { cookie: alice.cookie },
      signal: controller.signal,
    })
    await new Promise((resolve) => setTimeout(resolve, 120))
    controller.abort()
    await checkPromise.catch(() => undefined) // the aborted client request rejects
    keyless.setDelayMs(0)

    // Give the (aborted) outbound probe a moment to settle, then verify:
    // the real outbound request was cancelled on the wire...
    await new Promise((resolve) => setTimeout(resolve, 150))
    // The fake server is shared across tests — the aborted probe is the
    // LATEST /models request, not the first.
    const probe = [...keyless.requests].reverse().find((request) => request.url.includes('/models'))
    expect(probe).toBeDefined()
    expect(probe!.aborted).toBe(true)

    // ...and the row was never marked by the abandoned check.
    const listed = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/providers',
      headers: { cookie: alice.cookie },
    })
    const items = (listed.json() as { items: unknown[] }).items
    const row = items
      .map((item) => providerDtoSchema.parse(item))
      .find((item) => item.id === provider.id)
    expect(row?.credential.status).toBe('untested')
    expect(row?.models).toEqual([])
  })

  it('still refuses a keyed run when the provider has no credential', async () => {
    const created = await createProvider({
      label: 'Keyed but empty',
      kind: 'anthropic',
      endpointUrl: gateway.url,
      modelId: 'claude-gw',
    })
    const provider = providerDtoSchema.parse(created.json())

    const conversationResponse = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { cookie: alice.cookie },
      payload: { title: 'Keyed run' },
    })
    const conversation = conversationResponse.json() as { id: string }
    const nodeResponse = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversation.id}/nodes`,
      headers: { cookie: alice.cookie },
      payload: createNodeRequestSchema.parse({
        role: 'user',
        content: 'hello',
        status: 'complete',
      }),
    })
    const node = nodeResponse.json() as { node: { id: string } }

    const runResponse = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversation.id}/runs`,
      headers: { cookie: alice.cookie },
      payload: { parentNodeId: node.node.id, providerId: provider.id },
    })
    expect(runResponse.statusCode).toBe(400)
    expect(errorEnvelopeSchema.parse(runResponse.json()).message).toContain(
      'no saved credential',
    )
  })
})
