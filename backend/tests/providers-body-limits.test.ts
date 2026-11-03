import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import { eq } from 'drizzle-orm'
import { providerConnections } from '../src/db/schema.js'
import { createDatabase } from '../src/db/client.js'
import { providerDtoSchema, providerTestResponseSchema } from '@uni/contracts'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * N009 — bounded catalog and probe bodies: a hostile or looping endpoint
 * cannot exhaust memory through an oversized response. Content-length is
 * checked before a single byte is read, the stream is cancelled the
 * moment it passes its cap, and the failure is honest — nothing is
 * adopted, nothing persisted, and the readiness axes say exactly what
 * happened (reachable, no catalog).
 *
 * The OpenRouter /key bound (64 KB) is exercised through a mocked fetch
 * exactly like providers-openrouter.test.ts; the catalog bounds run over
 * real loopback sockets.
 */

const API_KEY = 'sk-body-limits-key-1234567890'

/** A provider whose /models catalog genuinely exceeds 2 MB, declared. */
function declaredOversizeProvider(): { server: Server; url: string } {
  const server = createServer((request, response) => {
    if ((request.url ?? '').includes('/models')) {
      const body = JSON.stringify({ data: [{ id: 'x'.repeat(2.5 * 1024 * 1024) }] })
      response.writeHead(200, {
        'content-type': 'application/json',
        'content-length': String(Buffer.byteLength(body)),
      })
      response.end(body)
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
  })
  return { server, url: '' }
}

/** A provider that streams a catalog past the cap with no content-length. */
function streamingOversizeProvider(): {
  server: Server
  url: string
  clientAborted: () => boolean
} {
  let clientAbortedFlag = false
  const server = createServer((request, response) => {
    if ((request.url ?? '').includes('/models')) {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.on('close', () => {
        if (!response.writableFinished) clientAbortedFlag = true
      })
      response.on('error', () => {})
      // 3 x 1 MB chunks, chunked transfer — no content-length declared.
      const megabyte = 'x'.repeat(1024 * 1024)
      for (let index = 0; index < 3; index += 1) {
        response.write(megabyte, () => {})
      }
      response.end()
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
  })
  return { server, url: '', clientAborted: () => clientAbortedFlag }
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

// openrouter.ai resolves to a public address (any public IP passes the guard).
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn().mockResolvedValue([{ address: '104.18.7.45', family: 4 }]),
}))

const OPENROUTER_URL = 'https://openrouter.ai/api/v1'

describe('providers — bounded catalog and probe bodies (N009)', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let declared: ReturnType<typeof declaredOversizeProvider>
  let streaming: ReturnType<typeof streamingOversizeProvider>

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Bounds' })
    declared = declaredOversizeProvider()
    declared.url = await listen(declared.server)
    streaming = streamingOversizeProvider()
    streaming.url = await listen(streaming.server)
  }, 180_000)

  afterAll(async () => {
    vi.unstubAllGlobals()
    if (declared) await new Promise<void>((resolve) => declared.server.close(() => resolve()))
    if (streaming) await new Promise<void>((resolve) => streaming.server.close(() => resolve()))
    await testApp?.stop()
  })

  async function createProvider(endpointUrl: string) {
    const response = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie: alice.cookie },
      payload: {
        label: 'Bounded target',
        kind: 'openai-compatible',
        authMode: 'bearer',
        endpointUrl,
      },
    })
    expect(response.statusCode).toBe(201)
    const provider = providerDtoSchema.parse(response.json())
    await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${provider.id}/credential`,
      headers: { cookie: alice.cookie },
      payload: { apiKey: API_KEY },
    })
    return provider
  }

  /** The provider row's persisted state (models + credential status). */
  async function rowState(providerId: string) {
    const database = createDatabase(testApp.databaseUrl)
    try {
      const rows = await database.db
        .select({
          status: providerConnections.credentialStatus,
          models: providerConnections.models,
        })
        .from(providerConnections)
        .where(eq(providerConnections.id, providerId))
      return rows[0] ?? null
    } finally {
      await database.pool.end()
    }
  }

  it('refuses a declared-oversize catalog before reading it, persisting nothing', async () => {
    const provider = await createProvider(declared.url)
    const test = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${provider.id}/models`,
      headers: { cookie: alice.cookie },
    })
    expect(test.statusCode).toBe(200)
    const result = providerTestResponseSchema.parse(test.json())
    expect(result.ok).toBe(false)
    expect(result.message).toContain('too large')
    expect(result.readiness).toEqual({
      reachability: 'ok',
      catalog: 'fail',
      credential: 'unknown',
      generation: 'unknown',
    })
    // Nothing was adopted: the row keeps its untested status and the
    // empty model list it started with.
    const row = await rowState(provider.id)
    expect(row?.status).toBe('error')
    expect(row?.models).toEqual([])
  })

  it('cancels a streaming catalog at the cap and persists nothing', async () => {
    const provider = await createProvider(streaming.url)
    const test = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${provider.id}/models`,
      headers: { cookie: alice.cookie },
    })
    expect(test.statusCode).toBe(200)
    const result = providerTestResponseSchema.parse(test.json())
    expect(result.ok).toBe(false)
    expect(result.message).toContain('too large')
    expect(result.discoveredModels).toBeNull()
    const row = await rowState(provider.id)
    expect(row?.models).toEqual([])
  })

  it('treats an oversized OpenRouter /key body as inconclusive — never verified', async () => {
    // The public /models catalog is small and fine; /key answers 200
    // with a body far past the 64 KB probe bound.
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = input instanceof Request ? input.url : String(input)
        if (url.endsWith('/models')) {
          return new Response(JSON.stringify({ data: [{ id: 'a/free:free' }] }), { status: 200 })
        }
        if (url.endsWith('/key')) {
          return new Response(JSON.stringify({ data: 'k'.repeat(200 * 1024) }), { status: 200 })
        }
        return new Response('not found', { status: 404 })
      }),
    )

    const response = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie: alice.cookie },
      payload: {
        label: 'OpenRouter bounds',
        kind: 'openai-compatible',
        endpointUrl: OPENROUTER_URL,
      },
    })
    expect(response.statusCode).toBe(201)
    const provider = providerDtoSchema.parse(response.json())
    await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${provider.id}/credential`,
      headers: { cookie: alice.cookie },
      payload: { apiKey: API_KEY },
    })

    const test = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${provider.id}/test`,
      headers: { cookie: alice.cookie },
    })
    expect(test.statusCode).toBe(200)
    const result = providerTestResponseSchema.parse(test.json())
    expect(result.ok).toBe(false)
    // Honest inconclusive: the key could not be verified (a public
    // catalog proves nothing), and it is NOT claimed to be invalid.
    expect(result.message).toContain('could not be verified')
    expect(result.readiness.credential).toBe('unknown')
    const row = await rowState(provider.id)
    expect(row?.status).toBe('error')
    vi.unstubAllGlobals()
  })
})
