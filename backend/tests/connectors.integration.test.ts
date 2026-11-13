import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * P08 / T026 — the connector catalog routes: session-scoped catalog
 * reads, honest 'unavailable' status for EVERY entry (no fabricated
 * live connections), and 404 for unknown ids.
 */

describe('connector catalog (T026)', () => {
  let testApp: TestApp
  let alice: { cookie: string }

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Connectors' })
    await testApp.app.listen({ port: 0, host: '127.0.0.1' })
  }, 180_000)

  afterAll(async () => {
    await testApp?.app.close()
    await testApp?.stop()
  })

  it('lists the catalog with honest unavailable statuses', async () => {
    const listed = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/connectors',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
    })
    expect(listed.statusCode).toBe(200)
    const items = (listed.json() as { items: Array<{ id: string; status: string; setup: string[] }> })
      .items
    expect(items.length).toBeGreaterThanOrEqual(4)
    expect(items.map((entry) => entry.id)).toContain('github')
    // Every entry is honestly not-connected, with real setup steps.
    for (const entry of items) {
      expect(entry.status).toBe('unavailable')
      expect(entry.setup.length).toBeGreaterThan(0)
    }
  })

  it('fetches a single connector by id', async () => {
    const fetched = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/connectors/github',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
    })
    expect(fetched.statusCode).toBe(200)
    const connector = fetched.json() as { id: string; name: string; docsUrl: string }
    expect(connector.id).toBe('github')
    expect(connector.name).toBe('GitHub')
    expect(connector.docsUrl).toMatch(/^https:/)
  })

  it('404s for unknown connector ids', async () => {
    const missing = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/connectors/does-not-exist',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
    })
    expect(missing.statusCode).toBe(404)
  })

  it('requires a session (401 without one)', async () => {
    const unauthenticated = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/connectors',
    })
    expect(unauthenticated.statusCode).toBe(401)
  })
})
