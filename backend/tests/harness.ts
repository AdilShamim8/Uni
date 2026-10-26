import EmbeddedPostgres from 'embedded-postgres'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { runMigrations } from '../src/db/migrate.js'
import type { Env } from '../src/config/env.js'
import { ensureScratchRoot, getFreePort } from './helpers.js'

/**
 * Shared integration harness: a real embedded PostgreSQL per test file,
 * committed migrations applied, and an app built against it.
 */
export interface TestApp {
  app: FastifyInstance
  databaseUrl: string
  stop: () => Promise<void>
}

export const TRUSTED_ORIGIN = 'http://localhost:5173'

/** Deterministic 32-byte test master key (base64) for credential envelopes. */
export const TEST_CREDENTIAL_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

export async function startTestApp(): Promise<TestApp> {
  const scratch = await ensureScratchRoot()
  const dataDir = await mkdtemp(join(scratch, 'uni-pg-'))
  const port = await getFreePort()

  const postgres = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'uni',
    password: 'uni',
    port,
    persistent: true,
  })
  await postgres.initialise()
  await postgres.start()
  await postgres.createDatabase('uni_test')

  const databaseUrl = `postgres://uni:uni@127.0.0.1:${port}/uni_test`
  await runMigrations(databaseUrl)

  const env: Env = {
    NODE_ENV: 'test',
    PORT: 0,
    HOST: '127.0.0.1',
    LOG_LEVEL: 'fatal',
    DATABASE_URL: databaseUrl,
    CORS_ORIGINS: `${TRUSTED_ORIGIN},http://127.0.0.1:5173`,
    APP_URL: 'http://127.0.0.1:4000',
    AUTH_REGISTRATION: 'open',
    CREDENTIAL_MASTER_KEY: TEST_CREDENTIAL_MASTER_KEY,
    CREDENTIAL_KEY_ID: 'test-key-1',
    // Integration tests run a fake provider on loopback — this is the
    // documented operator setting for self-hosted local models.
    ALLOW_LOCAL_MODEL_ENDPOINTS: 'true',
    LOCAL_MODEL_ENDPOINT_ALLOWLIST: '',
    RUN_TIMEOUT_MS: 15_000,
    RUN_MAX_OUTPUT_TOKENS: 512,
    RUN_HISTORY_MAX_CHARS: 8_000,
    RUN_MAX_CONCURRENT_PER_WORKSPACE: 2,
    RUN_CREATE_RATE_PER_MINUTE: 60,
  }
  const app = await buildApp({ env })

  const stop = async () => {
    await app.close()
    await postgres.stop()
    await rm(dataDir, { recursive: true, force: true })
  }

  return { app, databaseUrl, stop }
}

/** Collect Set-Cookie values from an inject response into a Cookie header. */
export function cookieHeaderOf(response: { cookies: Array<{ name: string; value: string }> }): string {
  return response.cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join('; ')
}

let counter = 0

export function uniqueEmail(prefix = 'user'): string {
  counter += 1
  return `${prefix}.${Date.now()}.${counter}@example.test`
}

/** Sign up a user through the real auth endpoints; returns the cookie. */
export async function signUpUser(
  app: FastifyInstance,
  options: { name?: string; email?: string; password?: string } = {},
): Promise<{ cookie: string; userId: string; email: string }> {
  const email = options.email ?? uniqueEmail()
  const response = await app.inject({
    method: 'POST',
    url: '/api/auth/sign-up/email',
    headers: { origin: TRUSTED_ORIGIN },
    payload: { name: options.name ?? 'Test User', email, password: options.password ?? 'password-123' },
  })

  if (response.statusCode !== 200 && response.statusCode !== 201) {
    throw new Error(`sign-up failed (${response.statusCode}): ${response.body}`)
  }
  const cookie = cookieHeaderOf(response)
  const body = response.json() as { user?: { id?: string } }
  return { cookie, userId: String(body.user?.id ?? ''), email }
}
