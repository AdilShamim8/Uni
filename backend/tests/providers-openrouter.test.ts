import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { providerDtoSchema, providerTestResponseSchema } from '@uni/contracts'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * OpenRouter-specific provider verification. OpenRouter's /models catalog
 * is public, so the connection test must also prove the key against the
 * auth-protected /key endpoint. DNS + fetch are mocked so the test never
 * leaves the machine and stays deterministic in CI (no network needed).
 *
 * Covered behaviors (mirrored on the frontend side in byok.test.ts):
 * - a key /key rejects fails the test even though /models answered 200
 * - a working key connects and discovery lists the free tier first
 * - an INCONCLUSIVE /key (429/5xx/network error/unparseable body) never
 *   reports verified — it fails honestly as "could not be verified"
 *   without claiming the key is invalid (audit F03 / U004)
 * - both outbound calls carry the decrypted bearer key
 */

// openrouter.ai resolves to a public address (any public IP passes the guard).
vi.mock('node:dns/promises', () => ({
  lookup: vi.fn().mockResolvedValue([{ address: '104.18.7.45', family: 4 }]),
}))

const OPENROUTER_URL = 'https://openrouter.ai/api/v1'
const API_KEY = 'sk-or-test-key-1234567890'

const CATALOG = {
  data: [
    { id: 'zeta/paid' },
    { id: 'alpha/free:free' },
    { id: 'meta/paid' },
    { id: 'beta/free:free' },
  ],
}

/** What /key does: a status with an optional raw body, or a thrown error. */
type KeyBehavior =
  | { status: number; body?: string }
  | { throw: Error }

function stubFetch(key: KeyBehavior): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.endsWith('/models')) {
        return new Response(JSON.stringify(CATALOG), { status: 200 })
      }
      if (url.endsWith('/key')) {
        if ('throw' in key) throw key.throw
        return new Response(key.body ?? (key.status === 200 ? '{}' : JSON.stringify({ error: { message: 'invalid key' } })), {
          status: key.status,
        })
      }
      return new Response('not found', { status: 404 })
    }),
  )
}

describe('providers — OpenRouter key verification', () => {
  let testApp: TestApp
  let cookie: string

  beforeAll(async () => {
    testApp = await startTestApp()
    const user = await signUpUser(testApp.app, { name: 'OpenRouter User' })
    cookie = user.cookie
  }, 180_000)

  afterAll(async () => {
    vi.unstubAllGlobals()
    await testApp?.stop()
  })

  async function createOpenRouterProvider(): Promise<string> {
    const response = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie },
      payload: {
        label: 'OpenRouter',
        kind: 'openai-compatible',
        endpointUrl: OPENROUTER_URL,
      },
    })
    expect(response.statusCode).toBe(201)
    return providerDtoSchema.parse(response.json()).id
  }

  it('rejects a key the /key endpoint refuses, even though /models is public', async () => {
    const providerId = await createOpenRouterProvider()
    await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${providerId}/credential`,
      headers: { cookie },
      payload: { apiKey: API_KEY },
    })

    // /models answers 200 (it is public); /key rejects the key with 401.
    stubFetch({ status: 401 })
    const test = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${providerId}/test`,
      headers: { cookie },
    })
    expect(test.statusCode).toBe(200)
    const result = providerTestResponseSchema.parse(test.json())
    expect(result.ok).toBe(false)
    expect(result.message).toContain('rejected')

    // The provider status reflects the failure honestly.
    const list = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/providers',
      headers: { cookie },
    })
    const provider = (list.json() as { items: Array<{ id: string; credential: { status: string } }> })
      .items.find((item) => item.id === providerId)
    expect(provider?.credential.status).toBe('error')
  })

  it('accepts a working key and surfaces free models first in discovery', async () => {
    const providerId = await createOpenRouterProvider()
    await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${providerId}/credential`,
      headers: { cookie },
      payload: { apiKey: API_KEY },
    })

    stubFetch({ status: 200 })
    const discover = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${providerId}/models`,
      headers: { cookie },
    })
    expect(discover.statusCode).toBe(200)
    const result = providerTestResponseSchema.parse(discover.json())
    expect(result.ok).toBe(true)
    expect(result.message).toContain('Connected')
    // Free tier first, alphabetical within each group.
    expect(result.discoveredModels).toEqual([
      'alpha/free:free',
      'beta/free:free',
      'meta/paid',
      'zeta/paid',
    ])

    // Both outbound calls carried the bearer key.
    const calls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls as unknown as Array<
      [unknown]
    >
    const urls = calls.map(([input]) => (input instanceof Request ? input.url : String(input)))
    expect(urls.length).toBe(2)
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\/openrouter\.ai\/api\/v1\/(models|key)$/)
    }
  })

  it.each([
    { label: 'rate limited (429)', key: { status: 429 } },
    { label: 'server error (500)', key: { status: 500 } },
    { label: 'network failure', key: { throw: new TypeError('fetch failed') } },
    { label: 'unparseable 200 body', key: { status: 200, body: 'not-json(' } },
  ])(
    'an inconclusive /key (%s) never reports verified — and never claims the key is invalid',
    async ({ key }) => {
      const providerId = await createOpenRouterProvider()
      await testApp.app.inject({
        method: 'PUT',
        url: `/api/v1/providers/${providerId}/credential`,
        headers: { cookie },
        payload: { apiKey: API_KEY },
      })

      stubFetch(key)
      const test = await testApp.app.inject({
        method: 'POST',
        url: `/api/v1/providers/${providerId}/test`,
        headers: { cookie },
      })
      expect(test.statusCode).toBe(200)
      const result = providerTestResponseSchema.parse(test.json())
      // Not verified (audit F03): a public /models 200 plus an
      // inconclusive /key must not claim the connection works.
      expect(result.ok).toBe(false)
      expect(result.message).toContain('could not be verified')
      // But not "rejected" either — the key's validity is simply unknown.
      expect(result.message).not.toContain('rejected')

      // The provider is never marked connected by an inconclusive check.
      const list = await testApp.app.inject({
        method: 'GET',
        url: '/api/v1/providers',
        headers: { cookie },
      })
      const provider = (list.json() as { items: Array<{ id: string; credential: { status: string } }> })
        .items.find((item) => item.id === providerId)
      expect(provider?.credential.status).not.toBe('connected')
    },
  )
})
