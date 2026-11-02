import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { providerDtoSchema, providerTestResponseSchema } from '@uni/contracts'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * Verification state is bound to the endpoint + credential it was
 * produced against (U014):
 * - editing the endpoint resets readiness (untested) and drops the
 *   stale discovered catalog — a deliberate check is required again
 * - a check that completes AFTER the configuration changed can never
 *   mark the NEW configuration connected (the result is fenced out by
 *   comparing the checked endpoint/credential against the row)
 *
 * The race is driven with a manually-resolved fetch: the /models answer
 * is held back until the test releases it, after the endpoint edit.
 */

const dns = vi.hoisted(() => ({ lookup: vi.fn() }))
vi.mock('node:dns/promises', () => dns)

let releaseModels: ((response: Response) => void) | undefined
let modelsWaiter: Promise<Response> | undefined
let fetchStarted = false

function holdModels(): void {
  fetchStarted = false
  modelsWaiter = new Promise<Response>((resolve) => {
    releaseModels = resolve
  })
}

/** Wait until the in-flight check has actually reached its outbound request. */
async function waitForFetchStart(): Promise<void> {
  for (let i = 0; i < 200 && !fetchStarted; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  expect(fetchStarted).toBe(true)
}

describe('provider verification is bound to the checked configuration (U014)', () => {
  let testApp: TestApp
  let cookie: string

  beforeAll(async () => {
    dns.lookup.mockResolvedValue([{ address: '104.18.7.45', family: 4 }])
    testApp = await startTestApp()
    const user = await signUpUser(testApp.app, { name: 'Version User' })
    cookie = user.cookie
  }, 180_000)

  afterAll(async () => {
    vi.unstubAllGlobals()
    await testApp?.stop()
  })

  async function createProvider(endpointUrl: string): Promise<string> {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie },
      payload: { label: 'Versioned', kind: 'openai-compatible', endpointUrl },
    })
    expect(created.statusCode).toBe(201)
    return providerDtoSchema.parse(created.json()).id
  }

  async function putCredential(providerId: string): Promise<void> {
    const put = await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${providerId}/credential`,
      headers: { cookie },
      payload: { apiKey: 'sk-versioned-key' },
    })
    expect(put.statusCode).toBe(200)
  }

  async function getProvider(providerId: string) {
    const list = await testApp.app.inject({ method: 'GET', url: '/api/v1/providers', headers: { cookie } })
    return (list.json() as { items: Array<{ id: string; models: string[]; credential: { status: string; lastCheckedAt: number | null } }> })
      .items.find((item) => item.id === providerId)
  }

  it('editing the endpoint resets readiness and drops the stale catalog', async () => {
    const providerId = await createProvider('https://first.example/v1')
    await putCredential(providerId)

    // Discover models against the first endpoint.
    holdModels()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        fetchStarted = true
        if (modelsWaiter) return modelsWaiter
        return new Response(JSON.stringify({ data: [{ id: 'model-one' }] }), { status: 200 })
      }),
    )
    const discovering = testApp.app
      .inject({
        method: 'POST',
        url: `/api/v1/providers/${providerId}/models`,
        headers: { cookie },
      })
      .then((response) => providerTestResponseSchema.parse(response.json()))
    await waitForFetchStart()
    releaseModels?.(new Response(JSON.stringify({ data: [{ id: 'model-one' }] }), { status: 200 }))
    const discovered = await discovering
    expect(discovered.ok).toBe(true)

    let provider = await getProvider(providerId)
    expect(provider?.credential.status).toBe('connected')
    expect(provider?.models).toEqual(['model-one'])

    // Now the endpoint is edited: readiness and catalog reset.
    const patched = await testApp.app.inject({
      method: 'PATCH',
      url: `/api/v1/providers/${providerId}`,
      headers: { cookie },
      payload: { endpointUrl: 'https://second.example/v1' },
    })
    expect(patched.statusCode).toBe(200)
    provider = await getProvider(providerId)
    expect(provider?.credential.status).toBe('untested')
    expect(provider?.credential.lastCheckedAt).toBeNull()
    expect(provider?.models).toEqual([])
    vi.unstubAllGlobals()
  })

  it('a check result landing after an endpoint edit cannot mark the new config connected', async () => {
    const providerId = await createProvider('https://old.example/v1')
    await putCredential(providerId)

    // Start a discovery whose /models answer is HELD back…
    holdModels()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        fetchStarted = true
        if (modelsWaiter) return modelsWaiter
        return new Response('not found', { status: 404 })
      }),
    )
    const discovering = testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${providerId}/models`,
      headers: { cookie },
    })
    await waitForFetchStart()

    // …the endpoint is edited while the check is in flight…
    await testApp.app.inject({
      method: 'PATCH',
      url: `/api/v1/providers/${providerId}`,
      headers: { cookie },
      payload: { endpointUrl: 'https://new.example/v1' },
    })

    // …and only then does the OLD endpoint's successful answer land.
    releaseModels?.(new Response(JSON.stringify({ data: [{ id: 'stale-model' }] }), { status: 200 }))
    const response = await discovering
    const result = providerTestResponseSchema.parse(response.json())
    // The response itself says the result is stale, not a pass.
    expect(result.ok).toBe(false)
    expect(result.message).toContain('changed while checking')

    // The persisted row stays honest: untested, no stale catalog.
    const provider = await getProvider(providerId)
    expect(provider?.credential.status).toBe('untested')
    expect(provider?.models).toEqual([])
    vi.unstubAllGlobals()
  })

  it('a check result landing after a credential change cannot mark the new key connected', async () => {
    const providerId = await createProvider('https://stable.example/v1')
    await putCredential(providerId)

    // Check starts against key #1 with a held-back response…
    holdModels()
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        fetchStarted = true
        if (modelsWaiter) return modelsWaiter
        return new Response('not found', { status: 404 })
      }),
    )
    const testing = testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${providerId}/test`,
      headers: { cookie },
    })
    await waitForFetchStart()

    // …the credential is REPLACED while the check is in flight…
    await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${providerId}/credential`,
      headers: { cookie },
      payload: { apiKey: 'sk-versioned-key-2' },
    })

    // …and the old key's successful check completes afterwards.
    releaseModels?.(new Response(JSON.stringify({ data: [{ id: 'any-model' }] }), { status: 200 }))
    const response = await testing
    const result = providerTestResponseSchema.parse(response.json())
    expect(result.ok).toBe(false)
    expect(result.message).toContain('changed while checking')

    // The new key stays untested — nothing marked it connected.
    const provider = await getProvider(providerId)
    expect(provider?.credential.status).toBe('untested')
    vi.unstubAllGlobals()
  })

  it('an unchanged configuration still records check results normally', async () => {
    const providerId = await createProvider('https://steady.example/v1')
    await putCredential(providerId)

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'steady-model' }] }), { status: 200 })),
    )
    const response = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${providerId}/test`,
      headers: { cookie },
    })
    const result = providerTestResponseSchema.parse(response.json())
    expect(result.ok).toBe(true)
    expect(result.message).toBe('Connected — the key works.')

    const provider = await getProvider(providerId)
    expect(provider?.credential.status).toBe('connected')
    vi.unstubAllGlobals()
  })
})
