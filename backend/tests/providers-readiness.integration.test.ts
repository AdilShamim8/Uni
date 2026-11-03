import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { providerDtoSchema, providerTestResponseSchema } from '@uni/contracts'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * N007 — separate readiness states: every connection check reports the
 * four INDEPENDENT axes (reachability / catalog / credential /
 * generation) instead of one blended connected/error state. A reachable
 * endpoint with a rejected key is reachability ok + credential fail; an
 * endpoint that never answered fails reachability alone; a plain check
 * never claims the generation axis.
 */

const API_KEY = 'sk-readiness-key-1234567890'

function readinessFakeProvider(): {
  server: Server
  url: string
} {
  const server = createServer((request, response) => {
    const path = request.url ?? ''
    if (path.includes('/models')) {
      const auth = request.headers.authorization
      if (auth !== `Bearer ${API_KEY}`) {
        response.writeHead(401, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: 'invalid key' }))
        return
      }
      // A plain keyed provider whose /models speaks for the key.
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }] }))
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
  })
  return { server, url: '' }
}

/** An endpoint with NO discovery route at all — /models 404s. */
function noDiscoveryProvider(): { server: Server; url: string } {
  const server = createServer((_request, response) => {
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'no model list here' }))
  })
  return { server, url: '' }
}

/** A 200 answer whose body is not a catalog — reachable, no model list. */
function cataloglessProvider(): { server: Server; url: string } {
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ status: 'ok but no data array' }))
  })
  return { server, url: '' }
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

describe('providers — separate readiness states (N007)', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let fake: ReturnType<typeof readinessFakeProvider>
  let noDiscovery: ReturnType<typeof noDiscoveryProvider>
  let catalogless: ReturnType<typeof cataloglessProvider>
  let deadPortUrl = ''

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Readiness' })
    fake = readinessFakeProvider()
    fake.url = await listen(fake.server)
    noDiscovery = noDiscoveryProvider()
    noDiscovery.url = await listen(noDiscovery.server)
    catalogless = cataloglessProvider()
    catalogless.url = await listen(catalogless.server)
    // A port that nothing listens on: bind, note the port, close.
    const placeholder = createServer((_request, response) => {
      response.writeHead(200)
      response.end()
    })
    const placeholderUrl = await listen(placeholder)
    await new Promise<void>((resolve) => placeholder.close(() => resolve()))
    deadPortUrl = placeholderUrl
  }, 180_000)

  afterAll(async () => {
    if (fake) await new Promise<void>((resolve) => fake.server.close(() => resolve()))
    if (noDiscovery) await new Promise<void>((resolve) => noDiscovery.server.close(() => resolve()))
    if (catalogless) await new Promise<void>((resolve) => catalogless.server.close(() => resolve()))
    await testApp?.stop()
  })

  async function createProvider(payload: Record<string, unknown>) {
    const response = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie: alice.cookie },
      payload: {
        label: 'Readiness target',
        kind: 'openai-compatible',
        ...payload,
      },
    })
    expect(response.statusCode).toBe(201)
    return providerDtoSchema.parse(response.json())
  }

  async function setKey(providerId: string, apiKey: string) {
    const response = await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${providerId}/credential`,
      headers: { cookie: alice.cookie },
      payload: { apiKey },
    })
    expect(response.statusCode).toBe(200)
  }

  async function testProvider(providerId: string) {
    const response = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${providerId}/test`,
      headers: { cookie: alice.cookie },
    })
    expect(response.statusCode).toBe(200)
    return providerTestResponseSchema.parse(response.json())
  }

  it('reports reachability/catalog/credential ok and generation unknown for a keyed success', async () => {
    const provider = await createProvider({ endpointUrl: fake.url })
    await setKey(provider.id, API_KEY)
    const result = await testProvider(provider.id)
    expect(result.ok).toBe(true)
    // The contract schema itself carries the four axes; assert each one.
    expect(result.readiness).toEqual({
      reachability: 'ok',
      catalog: 'ok',
      credential: 'ok',
      generation: 'unknown',
    })
    // Stable classification (N012).
    expect(result.errorKind).toBe(null)
  })

  it('reports credential not-required for a genuinely keyless connection', async () => {
    // The catalogless fake answers 200 without auth: reachable, no
    // catalog — and a keyless connection has no key to verify at all.
    const keyless = await createProvider({ endpointUrl: catalogless.url, authMode: 'none' })
    const result = await testProvider(keyless.id)
    expect(result.ok).toBe(true)
    expect(result.readiness).toEqual({
      reachability: 'ok',
      catalog: 'fail',
      credential: 'not-required',
      generation: 'unknown',
    })
    // Stable classification (N012).
    expect(result.errorKind).toBe(null)
  })

  it('reports credential fail when a keyless probe hits an endpoint that demands a key', async () => {
    // The keyed fake answers 401 to a keyless GET: the endpoint WAS
    // reached (reachability ok) and the keyless posture itself failed.
    const keyless = await createProvider({ endpointUrl: fake.url, authMode: 'none' })
    const result = await testProvider(keyless.id)
    expect(result.ok).toBe(false)
    expect(result.readiness).toEqual({
      reachability: 'ok',
      catalog: 'fail',
      credential: 'fail',
      generation: 'unknown',
    })
    // Stable classification (N012).
    expect(result.errorKind).toBe('rejected-credential')
  })

  it('separates a rejected key (reachability ok, catalog and credential fail)', async () => {
    const provider = await createProvider({ endpointUrl: fake.url })
    await setKey(provider.id, 'sk-wrong-readiness-key')
    const result = await testProvider(provider.id)
    expect(result.ok).toBe(false)
    expect(result.readiness).toEqual({
      reachability: 'ok',
      catalog: 'fail',
      credential: 'fail',
      generation: 'unknown',
    })
    // Stable classification (N012).
    expect(result.errorKind).toBe('rejected-credential')
  })

  it('separates a missing discovery route (reachability ok, catalog fail, credential unknown)', async () => {
    const provider = await createProvider({ endpointUrl: noDiscovery.url })
    await setKey(provider.id, API_KEY)
    const result = await testProvider(provider.id)
    expect(result.ok).toBe(false)
    expect(result.readiness).toEqual({
      reachability: 'ok',
      catalog: 'fail',
      credential: 'unknown',
      generation: 'unknown',
    })
    // Stable classification (N012).
    expect(result.errorKind).toBe('catalog-unavailable')
  })

  it('separates a 200 without a catalog (catalog fail, credential ok, still connected)', async () => {
    const provider = await createProvider({ endpointUrl: catalogless.url })
    await setKey(provider.id, API_KEY)
    const result = await testProvider(provider.id)
    // Reachable and the key was accepted, but there is no model list —
    // three distinct facts, not one blended state.
    expect(result.ok).toBe(true)
    expect(result.readiness).toEqual({
      reachability: 'ok',
      catalog: 'fail',
      credential: 'ok',
      generation: 'unknown',
    })
    // Stable classification (N012).
    expect(result.errorKind).toBe(null)
  })

  it('fails only reachability when the endpoint never answers', async () => {
    const provider = await createProvider({ endpointUrl: deadPortUrl })
    await setKey(provider.id, API_KEY)
    const result = await testProvider(provider.id)
    expect(result.ok).toBe(false)
    expect(result.readiness).toEqual({
      reachability: 'fail',
      catalog: 'unknown',
      credential: 'unknown',
      generation: 'unknown',
    })
    // Stable classification (N012).
    expect(result.errorKind).toBe('unreachable')
  })

  it('reports all-unknown readiness when no key is stored yet', async () => {
    // Explicit keyed transport: a keyless-capable protocol defaults to
    // 'none', so the keyed case must be requested explicitly (N001).
    const provider = await createProvider({ endpointUrl: fake.url, authMode: 'bearer' })
    const result = await testProvider(provider.id)
    expect(result.ok).toBe(false)
    expect(result.readiness).toEqual({
      reachability: 'unknown',
      catalog: 'unknown',
      credential: 'unknown',
      generation: 'unknown',
    })
    // Stable classification (N012).
    expect(result.errorKind).toBe('no-credential')
  })
})
