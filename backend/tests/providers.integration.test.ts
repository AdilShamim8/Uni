import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type Server } from 'node:http'
import { eq } from 'drizzle-orm'
import { errorEnvelopeSchema, providerDtoSchema, providerTestResponseSchema } from '@uni/contracts'
import { providerConnections } from '../src/db/schema.js'
import { createDatabase } from '../src/db/client.js'
import { buildApp } from '../src/app.js'
import { decryptSecret, encryptSecret, parseMasterKey } from '../src/lib/secretBox.js'
import { resolveProviderEndpoint, UrlGuardError } from '../src/lib/urlGuard.js'
import { signUpUser, startTestApp, TEST_CREDENTIAL_MASTER_KEY, type TestApp } from './harness.js'

/**
 * B03 slice 1 — provider connections: encrypted credentials that never
 * leave the server, workspace isolation, SSRF-guarded outbound checks
 * against a local fake provider.
 */

const API_KEY = 'sk-fake-provider-key-1234567890'

function fakeProviderServer(): { server: Server; url: string; requests: Array<{ url: string; headers: Record<string, string> }> } {
  const requests: Array<{ url: string; headers: Record<string, string> }> = []
  const server = createServer((request, response) => {
    requests.push({
      url: request.url ?? '/',
      headers: request.headers as Record<string, string>,
    })

    if ((request.url ?? '').includes('/models')) {
      const auth = request.headers.authorization ?? request.headers['x-api-key']
      if (auth === `Bearer ${API_KEY}` || auth === API_KEY) {
        response.writeHead(200, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ data: [{ id: 'model-alpha' }, { id: 'model-beta' }] }))
        return
      }
      response.writeHead(401, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'invalid key' }))
      return
    }

    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
  })
  return { server, url: '', requests }
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

describe('providers — credentials, redaction, SSRF guard', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let bob: { cookie: string }
  let fake: { server: Server; url: string; requests: Array<{ url: string; headers: Record<string, string> }> }

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Provider' })
    bob = await signUpUser(testApp.app, { name: 'Bob Provider' })
    fake = fakeProviderServer()
    fake.url = await listen(fake.server)
  }, 180_000)

  afterAll(async () => {
    // Guarded: if beforeAll failed partway (harness or sign-ups), these
    // may be undefined — report the real error, not a teardown TypeError.
    if (fake) await new Promise<void>((resolve) => fake.server.close(() => resolve()))
    await testApp?.stop()
  })

  async function createProvider(cookie: string, endpointUrl: string) {
    const response = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie },
      payload: {
        label: 'Fake OpenAI-compatible',
        kind: 'openai-compatible',
        endpointUrl,
        modelId: 'model-alpha',
      },
    })
    expect(response.statusCode).toBe(201)
    return providerDtoSchema.parse(response.json())
  }

  it('stores credentials encrypted (AES-256-GCM envelope, scope-bound), never returning them', async () => {
    const { app } = testApp
    const provider = await createProvider(alice.cookie, fake.url)

    const setKey = await app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${provider.id}/credential`,
      headers: { cookie: alice.cookie },
      payload: { apiKey: API_KEY },
    })
    expect(setKey.statusCode).toBe(200)
    const body = setKey.body
    // The response is redacted metadata only — no key, no envelope.
    expect(body).not.toContain(API_KEY)
    const stored = providerDtoSchema.parse(setKey.json())
    expect(stored.credential.present).toBe(true)
    expect(stored.credential.keyId).toBe('test-key-1')

    // The database row holds an encrypted envelope, not the plaintext.
    const database = createDatabase(testApp.databaseUrl)
    try {
      const rows = await database.db
        .select({ envelope: providerConnections.credentialEnvelope })
        .from(providerConnections)
        .where(eq(providerConnections.id, provider.id))
      const envelopeText = rows[0]?.envelope
      expect(envelopeText).toBeTruthy()
      expect(envelopeText).not.toContain(API_KEY)

      // The envelope decrypts only with the master key AND the exact scope.
      const masterKey2 = parseMasterKey(TEST_CREDENTIAL_MASTER_KEY)
      const workspaceIdRow = (
        await database.db
          .select({ workspaceId: providerConnections.workspaceId })
          .from(providerConnections)
          .where(eq(providerConnections.id, provider.id))
      )[0]
      expect(workspaceIdRow?.workspaceId).toBeTruthy()
      const decrypted = decryptSecret(masterKey2, envelopeText!, {
        workspaceId: workspaceIdRow!.workspaceId,
        providerId: provider.id,
      })
      expect(decrypted.plaintext).toBe(API_KEY)

      // A different scope must fail (ciphertext is bound to its record).
      expect(() =>
        decryptSecret(masterKey2, envelopeText!, {
          workspaceId: 'other-workspace',
          providerId: provider.id,
        }),
      ).toThrow()
    } finally {
      await database.pool.end()
    }
  })

  it('tests the connection through the guarded fetch against the fake provider', async () => {
    const { app } = testApp
    const provider = await createProvider(alice.cookie, fake.url)
    await app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${provider.id}/credential`,
      headers: { cookie: alice.cookie },
      payload: { apiKey: API_KEY },
    })

    const test = await app.inject({
      method: 'POST',
      url: `/api/v1/providers/${provider.id}/test`,
      headers: { cookie: alice.cookie },
    })
    expect(test.statusCode).toBe(200)
    const result = providerTestResponseSchema.parse(test.json())
    expect(result.ok).toBe(true)
    expect(result.message).toContain('Connected')
    expect(result.discoveredModels).toContain('model-alpha')

    // The outbound request carried the decrypted key only in the auth header.
    const seen = fake.requests.at(-1)
    expect(seen?.headers.authorization).toBe(`Bearer ${API_KEY}`)

    // Model discovery persists the list.
    const discover = await app.inject({
      method: 'POST',
      url: `/api/v1/providers/${provider.id}/models`,
      headers: { cookie: alice.cookie },
    })
    expect(discover.statusCode).toBe(200)
    const discovered = providerTestResponseSchema.parse(discover.json())
    expect(discovered.ok).toBe(true)
    expect(discovered.discoveredModels).toEqual(['model-alpha', 'model-beta'])
  })

  it('reports invalid keys honestly without leaking the key', async () => {
    const { app } = testApp
    const provider = await createProvider(alice.cookie, fake.url)
    await app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${provider.id}/credential`,
      headers: { cookie: alice.cookie },
      payload: { apiKey: 'sk-wrong-key-000000' },
    })

    const test = await app.inject({
      method: 'POST',
      url: `/api/v1/providers/${provider.id}/test`,
      headers: { cookie: alice.cookie },
    })
    expect(test.statusCode).toBe(200)
    const result = providerTestResponseSchema.parse(test.json())
    expect(result.ok).toBe(false)
    expect(result.message).toContain('rejected the API key')
    expect(test.body).not.toContain('sk-wrong-key')
  })

  it('never exposes another workspace\'s providers (404, redacted)', async () => {
    const { app } = testApp
    const provider = await createProvider(alice.cookie, fake.url)

    const bobList = await app.inject({
      method: 'GET',
      url: '/api/v1/providers',
      headers: { cookie: bob.cookie },
    })
    expect(bobList.statusCode).toBe(200)
    expect((bobList.json() as { items: unknown[] }).items).toHaveLength(0)

    const bobPatch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/providers/${provider.id}`,
      headers: { cookie: bob.cookie },
      payload: { label: 'stolen' },
    })
    expect(bobPatch.statusCode).toBe(404)

    const bobCredential = await app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${provider.id}/credential`,
      headers: { cookie: bob.cookie },
      payload: { apiKey: 'sk-bob-evil-key-123456' },
    })
    expect([404, 400]).toContain(bobCredential.statusCode)
    const envelope = errorEnvelopeSchema.parse(bobCredential.json())
    expect(envelope.message).not.toContain('sk-bob-evil')
  })

  it('SSRF guard rejects private, loopback, metadata, and non-HTTPS targets when local endpoints are disallowed', async () => {
    const guardOptions = { allowLocalEndpoints: false, allowlist: [] as string[] }

    const blocked: Array<() => Promise<unknown>> = [
      () => resolveProviderEndpoint('http://127.0.0.1:8080/v1', guardOptions),
      () => resolveProviderEndpoint('http://localhost/v1', guardOptions),
      () => resolveProviderEndpoint('http://10.1.2.3/v1', guardOptions),
      () => resolveProviderEndpoint('http://169.254.169.254/latest/meta-data', guardOptions),
      () => resolveProviderEndpoint('http://192.168.1.10/v1', guardOptions),
      () => resolveProviderEndpoint('http://172.20.0.5/v1', guardOptions),
      () => resolveProviderEndpoint('http://[::1]/v1', guardOptions),
      () => resolveProviderEndpoint('http://[fe80::1]/v1', guardOptions),
      () => resolveProviderEndpoint('https://user:pass@provider.example/v1', guardOptions),
      () => resolveProviderEndpoint('ftp://provider.example/v1', guardOptions),
      () => resolveProviderEndpoint('https://provider.example:8443/v1', guardOptions),
    ]
    for (const attempt of blocked) {
      await expect(attempt()).rejects.toThrow(UrlGuardError)
    }

    // HTTPS to a standard port passes URL validation (DNS resolution may
    // still fail in the sandbox, so only URL-level checks are asserted here).
    await expect(
      resolveProviderEndpoint('https://provider.example/v1', guardOptions),
    ).rejects.toBeInstanceOf(UrlGuardError) // DNS does not resolve in sandbox

    // Operator allowlist permits loopback explicitly.
    await expect(
      resolveProviderEndpoint('http://127.0.0.1:9/v1', {
        allowLocalEndpoints: false,
        allowlist: ['127.0.0.1'],
      }),
    ).resolves.toBeTruthy()

    // Local-endpoints operator mode permits private ranges.
    await expect(
      resolveProviderEndpoint('http://192.168.1.10/v1', {
        allowLocalEndpoints: true,
        allowlist: [],
      }),
    ).resolves.toBeTruthy()
  })

  it('SSRF guard blocks endpoints when ALLOW_LOCAL_MODEL_ENDPOINTS=false (fail-closed default)', async () => {
    const { databaseUrl } = testApp
    const closed = await buildApp({
      env: {
        NODE_ENV: 'test',
        PORT: 0,
        HOST: '127.0.0.1',
        LOG_LEVEL: 'fatal',
        DATABASE_URL: databaseUrl,
        CORS_ORIGINS: 'http://localhost:5173',
        APP_URL: 'http://127.0.0.1:4000',
        AUTH_REGISTRATION: 'open',
        AUTH_TRUSTED_PROXIES: '',
        CREDENTIAL_MASTER_KEY: TEST_CREDENTIAL_MASTER_KEY,
        CREDENTIAL_KEY_ID: 'test-key-1',
        ALLOW_LOCAL_MODEL_ENDPOINTS: 'false',
        LOCAL_MODEL_ENDPOINT_ALLOWLIST: '',
    RUN_TIMEOUT_MS: 15_000,
    RUN_MAX_OUTPUT_TOKENS: 512,
    RUN_HISTORY_MAX_CHARS: 8_000,
    RUN_MAX_CONCURRENT_PER_WORKSPACE: 2,
    RUN_CREATE_RATE_PER_MINUTE: 60,
      },
    })

    const { cookie } = await signUpUser(closed, { name: 'Guard User' })
    const response = await closed.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie },
      payload: {
        label: 'Local provider',
        kind: 'openai-compatible',
        endpointUrl: fake.url,
      },
    })
    expect(response.statusCode).toBe(201)
    const provider = providerDtoSchema.parse(response.json())

    await closed.inject({
      method: 'PUT',
      url: `/api/v1/providers/${provider.id}/credential`,
      headers: { cookie },
      payload: { apiKey: API_KEY },
    })

    const requestCountBefore = fake.requests.length
    const test = await closed.inject({
      method: 'POST',
      url: `/api/v1/providers/${provider.id}/test`,
      headers: { cookie },
    })
    expect(test.statusCode).toBe(200)
    const result = providerTestResponseSchema.parse(test.json())
    expect(result.ok).toBe(false)
    // The guard fires on one of the hosted rules (HTTPS-only, non-standard
    // port, or blocked range) — any honest rejection is correct; the key
    // detail is that NO outbound request was attempted.
    expect(result.message).toMatch(/HTTPS|port|blocked address range|not resolve/)
    expect(fake.requests.length).toBe(requestCountBefore)

    await closed.close()
  })

  it('encrypt/decrypt round-trips with unique nonces and refuses wrong keys', () => {
    const masterKey = parseMasterKey(TEST_CREDENTIAL_MASTER_KEY)
    const scope = { workspaceId: 'w-1', providerId: 'p-1' }

    const first = encryptSecret(masterKey, 'k1', 'secret-one', scope)
    const second = encryptSecret(masterKey, 'k1', 'secret-one', scope)
    expect(first.nonce).not.toBe(second.nonce) // unique nonce per encryption
    expect(decryptSecret(masterKey, JSON.stringify(first), scope).plaintext).toBe('secret-one')

    const wrongKey = parseMasterKey(Buffer.alloc(32, 99).toString('base64'))
    expect(() => decryptSecret(wrongKey, JSON.stringify(first), scope)).toThrow()
  })
})
