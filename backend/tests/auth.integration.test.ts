import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { errorEnvelopeSchema, meResponseSchema } from '@uni/contracts'
import { account, workspaceMembers, workspaces } from '../src/db/schema.js'
import { createDatabase } from '../src/db/client.js'
import { buildApp } from '../src/app.js'
import { TRUSTED_ORIGIN, cookieHeaderOf, signUpUser, startTestApp, uniqueEmail, type TestApp } from './harness.js'

/**
 * B02 slice 1 — identity: real Better Auth flows against a real
 * PostgreSQL. Sessions are HttpOnly cookies; /api/v1 is session-scoped;
 * every user gets exactly one personal workspace.
 */
describe('auth — sign-up, sign-in, sign-out, session scope', () => {
  let testApp: TestApp

  beforeAll(async () => {
    testApp = await startTestApp()
  }, 180_000)

  afterAll(async () => {
    await testApp?.stop()
  })

  it('sign-up creates the user, a session cookie, and one personal workspace', async () => {
    const { app } = testApp
    const email = uniqueEmail('alice')

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { origin: TRUSTED_ORIGIN },
      payload: { name: 'Alice', email, password: 'password-123' },
    })
    expect(response.statusCode).toBe(200)
    const body = response.json() as { user?: { id?: string; email?: string } }
    expect(body.user?.email).toBe(email)

    // Session cookie is set and HttpOnly.
    const sessionCookie = response.cookies.find((cookie) => cookie.name.includes('session'))
    expect(sessionCookie).toBeTruthy()
    expect(sessionCookie?.httpOnly).toBe(true)

    // Exactly one personal workspace with an owner membership exists.
    const database = createDatabase(testApp.databaseUrl)
    try {
      const rows = await database.db
        .select({ id: workspaces.id, name: workspaces.name, role: workspaceMembers.role })
        .from(workspaces)
        .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
        .where(eq(workspaces.ownerId, String(body.user?.id)))
      expect(rows).toHaveLength(1)
      expect(rows[0]?.name).toBe('Personal workspace')
      expect(rows[0]?.role).toBe('owner')
    } finally {
      await database.pool.end()
    }
  })

  it('GET /api/v1/me returns the session user and workspace; 401 without a session', async () => {
    const { app } = testApp
    const { cookie, email } = await signUpUser(app, { name: 'Me User' })

    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } })
    expect(me.statusCode).toBe(200)
    const body = meResponseSchema.parse(me.json())
    expect(body.user.email).toBe(email)
    expect(body.workspace.role).toBe('owner')
    expect(body.workspace.id).toBeTruthy()

    const anonymous = await app.inject({ method: 'GET', url: '/api/v1/me' })
    expect(anonymous.statusCode).toBe(401)
    const envelope = errorEnvelopeSchema.parse(anonymous.json())
    expect(envelope.code).toBe('unauthorized')
  })

  it('sign-in issues a fresh session; wrong credentials are rejected; sign-out invalidates', async () => {
    const { app } = testApp
    const email = uniqueEmail('bob')
    await signUpUser(app, { name: 'Bob', email, password: 'correct-horse-1' })

    const good = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: TRUSTED_ORIGIN },
      payload: { email, password: 'correct-horse-1' },
    })
    expect(good.statusCode).toBe(200)
    const cookie = cookieHeaderOf(good)
    expect(cookie).toContain('session')

    const me = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } })
    expect(me.statusCode).toBe(200)

    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: TRUSTED_ORIGIN },
      payload: { email, password: 'wrong-password-1' },
    })
    expect(bad.statusCode).toBe(401)
    expect(bad.cookies.some((entry) => entry.name.includes('session'))).toBe(false)

    const signOut = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { cookie, origin: TRUSTED_ORIGIN },
    })
    expect(signOut.statusCode).toBe(200)

    const afterSignOut = await app.inject({ method: 'GET', url: '/api/v1/me', headers: { cookie } })
    expect(afterSignOut.statusCode).toBe(401)
  })

  it('rejects auth state changes from an untrusted origin (CSRF defense)', async () => {
    const { app } = testApp
    // A real account with valid credentials — the defense must reject the
    // request because of its origin, not because of bad credentials.
    const email = uniqueEmail('victim')
    await signUpUser(app, { name: 'Victim', email, password: 'password-123' })

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: 'https://evil.example' },
      payload: { email, password: 'password-123' },
    })
    expect(response.statusCode).toBe(403)
    expect(response.cookies.some((entry) => entry.name.includes('session'))).toBe(false)

    // And sign-up from an untrusted origin is equally blocked.
    const evilSignUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { origin: 'https://evil.example' },
      payload: { name: 'Evil', email: uniqueEmail('evil'), password: 'password-123' },
    })
    expect(evilSignUp.statusCode).toBe(403)
    expect(evilSignUp.cookies.some((entry) => entry.name.includes('session'))).toBe(false)
  })

  it('closes registration when AUTH_REGISTRATION=closed (fail-closed policy)', async () => {
    const { app } = testApp

    // Build a second app instance with registration closed.
    const closed = await buildApp({
      env: {
        NODE_ENV: 'test',
        PORT: 0,
        HOST: '127.0.0.1',
        LOG_LEVEL: 'fatal',
        DATABASE_URL: testApp.databaseUrl,
        CORS_ORIGINS: TRUSTED_ORIGIN,
        APP_URL: 'http://127.0.0.1:4000',
        AUTH_REGISTRATION: 'closed',
        CREDENTIAL_MASTER_KEY: undefined,
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

    const response = await closed.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      headers: { origin: TRUSTED_ORIGIN },
      payload: { name: 'Nope', email: uniqueEmail('closed'), password: 'password-123' },
    })
    expect([400, 403]).toContain(response.statusCode)
    expect(response.cookies.some((entry) => entry.name.includes('session'))).toBe(false)

    // Existing users can still sign in.
    const email = uniqueEmail('policy')
    await signUpUser(app, { name: 'Policy User', email, password: 'password-123' })
    const signIn = await closed.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      headers: { origin: TRUSTED_ORIGIN },
      payload: { email, password: 'password-123' },
    })
    expect(signIn.statusCode).toBe(200)
    await closed.close()
  })

  it('passwords are stored hashed, never in plaintext', async () => {
    const { app } = testApp
    const password = 'plaintext-secret-9'
    const { userId } = await signUpUser(app, { name: 'Hash Check', password })

    const database = createDatabase(testApp.databaseUrl)
    try {
      const rows = await database.db
        .select({ password: account.password })
        .from(account)
        .where(eq(account.userId, userId))
        .limit(1)
      const stored = rows[0]?.password ?? null
      expect(stored).not.toBeNull()
      expect(stored).not.toBe(password)
      expect(stored).not.toContain(password)
    } finally {
      await database.pool.end()
    }
  })
})
