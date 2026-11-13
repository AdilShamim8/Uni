import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { signUpUser, startTestApp, TEST_CREDENTIAL_MASTER_KEY, type TestApp } from './harness.js'
import { createDatabase } from '../src/db/client.js'
import {
  storeConnectorCredential,
  openConnectorCredential,
  removeConnectorCredential,
  recordCredentialCheck,
  describeConnectorCredential,
} from '../src/modules/connectors/connectorCredentials.service.js'

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


describe('connector credential storage (RF-087)', () => {
  const ENV = { CREDENTIAL_MASTER_KEY: TEST_CREDENTIAL_MASTER_KEY, CREDENTIAL_KEY_ID: 'test' }

  it('seals and reopens a token bound to the workspace+connector scope', async () => {
    const test = await startTestApp()
    try {
      const alice = await signUpUser(test.app, { name: 'Alice Connector' })
      const workspaceId = (
        (await test.app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: alice.cookie } }))
          .json() as { workspace: { id: string } }
      ).workspace.id
      const database = createDatabase(test.databaseUrl)
      try {
        await storeConnectorCredential(database.db, ENV, workspaceId, 'github', 'ghp_testtoken')
        // The plaintext round-trips only through the opener.
        expect(await openConnectorCredential(database.db, ENV, workspaceId, 'github')).toBe(
          'ghp_testtoken',
        )
        // The stored row is an envelope, never plaintext.
        const raw = await database.db.execute(
          sql`select credential_envelope from connector_credential`,
        )
        const envelopeText = String(
          (raw.rows as Array<{ credential_envelope: string }>)[0]!.credential_envelope,
        )
        expect(envelopeText).not.toContain('ghp_testtoken')
        expect(JSON.parse(envelopeText)).toMatchObject({ alg: 'aes-256-gcm' })

        // A different workspace scope cannot open it (AAD binding).
        await expect(
          openConnectorCredential(database.db, ENV, 'not-this-workspace', 'github'),
        ).resolves.toBeNull()

        // Descriptor: presence + status, never the token.
        expect(await describeConnectorCredential(database.db, workspaceId, 'github')).toMatchObject({
          connectorId: 'github',
          status: 'untested',
        })

        // Replacing re-seals and resets the status.
        await storeConnectorCredential(database.db, ENV, workspaceId, 'github', 'ghp_second')
        expect(await openConnectorCredential(database.db, ENV, workspaceId, 'github')).toBe(
          'ghp_second',
        )

        // A failed check records the honest state.
        await recordCredentialCheck(database.db, workspaceId, 'github', false, '401 from GitHub')
        expect(await describeConnectorCredential(database.db, workspaceId, 'github')).toMatchObject({
          status: 'invalid',
          lastError: '401 from GitHub',
        })

        // Removal is final and honest.
        expect(await removeConnectorCredential(database.db, workspaceId, 'github')).toBe(true)
        expect(await describeConnectorCredential(database.db, workspaceId, 'github')).toBeNull()
        expect(await removeConnectorCredential(database.db, workspaceId, 'github')).toBe(false)
      } finally {
        await database.pool.end()
      }
    } finally {
      await test.stop()
    }
  }, 180_000)
})
