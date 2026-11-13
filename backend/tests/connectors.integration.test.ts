import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
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


describe('connector connection test route (RF-089)', () => {
  function githubFixture(status: number, body: unknown): () => Promise<Response> {
    return async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      })
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('verifies a body token against GitHub without storing anything', async () => {
    const test = await startTestApp()
    try {
      const alice = await signUpUser(test.app, { name: 'Alice Test' })
      vi.stubGlobal('fetch', vi.fn(githubFixture(200, { login: 'adilshamim' })))
      const res = await test.app.inject({
        method: 'POST',
        url: '/api/v1/connectors/github/test',
        headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
        payload: { token: 'ghp_fresh' },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as { ok: boolean; login: string | null; status: number }
      expect(body).toMatchObject({ ok: true, login: 'adilshamim', status: 200 })
    } finally {
      await test.stop()
    }
  }, 180_000)

  it('reports a rejected token honestly and never pretends success', async () => {
    const test = await startTestApp()
    try {
      const alice = await signUpUser(test.app, { name: 'Alice Bad' })
      vi.stubGlobal('fetch', vi.fn(githubFixture(401, { message: 'Bad credentials' })))
      const res = await test.app.inject({
        method: 'POST',
        url: '/api/v1/connectors/github/test',
        headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
        payload: { token: 'ghp_wrong' },
      })
      expect(res.statusCode).toBe(200)
      const body = res.json() as { ok: boolean; status: number; error: string | null }
      expect(body.ok).toBe(false)
      expect(body.status).toBe(401)
      expect(body.error).toContain('401')
    } finally {
      await test.stop()
    }
  }, 180_000)

  it('requires a token when nothing is stored (honest 400)', async () => {
    const test = await startTestApp()
    try {
      const alice = await signUpUser(test.app, { name: 'Alice None' })
      const res = await test.app.inject({
        method: 'POST',
        url: '/api/v1/connectors/github/test',
        headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
        payload: {},
      })
      expect(res.statusCode).toBe(400)
    } finally {
      await test.stop()
    }
  }, 180_000)

  it('tests the STORED credential and records the verdict (RF-089)', async () => {
    const test = await startTestApp()
    try {
      const alice = await signUpUser(test.app, { name: 'Alice Stored' })
      const workspaceId = (
        (await test.app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie: alice.cookie } }))
          .json() as { workspace: { id: string } }
      ).workspace.id
      const database = createDatabase(test.databaseUrl)
      try {
        await storeConnectorCredential(
          database.db,
          { CREDENTIAL_MASTER_KEY: TEST_CREDENTIAL_MASTER_KEY, CREDENTIAL_KEY_ID: 'test' },
          workspaceId,
          'github',
          'ghp_stored',
        )
        vi.stubGlobal('fetch', vi.fn(githubFixture(200, { login: 'stored-login' })))
        const res = await test.app.inject({
          method: 'POST',
          url: '/api/v1/connectors/github/test',
          headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
          payload: {},
        })
        expect(res.statusCode).toBe(200)
        expect(res.json()).toMatchObject({ ok: true, login: 'stored-login' })

        // The stored credential's status was recorded as verified.
        expect(
          await describeConnectorCredential(database.db, workspaceId, 'github'),
        ).toMatchObject({ status: 'verified' })
      } finally {
        await database.pool.end()
      }
    } finally {
      await test.stop()
    }
  }, 180_000)

  it('says honestly that non-GitHub connectors have no adapter yet (503)', async () => {
    const test = await startTestApp()
    try {
      const alice = await signUpUser(test.app, { name: 'Alice Gmail' })
      const res = await test.app.inject({
        method: 'POST',
        url: '/api/v1/connectors/gmail/test',
        headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
        payload: { token: 'whatever' },
      })
      expect(res.statusCode).toBe(503)
    } finally {
      await test.stop()
    }
  }, 180_000)
})


describe('connector credential routes (RF-090)', () => {
  it('stores, describes, and removes a credential — the token never returns', async () => {
    const test = await startTestApp()
    try {
      const alice = await signUpUser(test.app, { name: 'Alice Store' })
      const headers = { cookie: alice.cookie, origin: 'http://localhost:5173' }

      const stored = await test.app.inject({
        method: 'PUT',
        url: '/api/v1/connectors/github/credential',
        headers,
        payload: { token: 'ghp_never-echo' },
      })
      expect(stored.statusCode).toBe(201)
      const descriptor = stored.json() as {
        connectorId: string
        status: string
        lastError: unknown
      }
      expect(descriptor).toMatchObject({ connectorId: 'github', status: 'untested' })
      expect(JSON.stringify(stored.json())).not.toContain('ghp_never-echo')

      // The descriptor route says the same thing.
      const described = await test.app.inject({
        method: 'GET',
        url: '/api/v1/connectors/github/credential',
        headers,
      })
      expect(described.statusCode).toBe(200)
      expect(described.json()).toMatchObject({ connectorId: 'github', status: 'untested' })

      // Removal is honest: 204 then 404.
      const removed = await test.app.inject({
        method: 'DELETE',
        url: '/api/v1/connectors/github/credential',
        headers,
      })
      expect(removed.statusCode).toBe(204)
      const gone = await test.app.inject({
        method: 'GET',
        url: '/api/v1/connectors/github/credential',
        headers,
      })
      expect(gone.statusCode).toBe(404)
    } finally {
      await test.stop()
    }
  }, 180_000)

  it('is workspace-scoped: another account never sees the credential', async () => {
    const test = await startTestApp()
    try {
      const alice = await signUpUser(test.app, { name: 'Alice Scope' })
      const bob = await signUpUser(test.app, { name: 'Bob Scope' })
      await test.app.inject({
        method: 'PUT',
        url: '/api/v1/connectors/github/credential',
        headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
        payload: { token: 'ghp_alice' },
      })
      const bobs = await test.app.inject({
        method: 'GET',
        url: '/api/v1/connectors/github/credential',
        headers: { cookie: bob.cookie, origin: 'http://localhost:5173' },
      })
      expect(bobs.statusCode).toBe(404)
    } finally {
      await test.stop()
    }
  }, 180_000)
})
