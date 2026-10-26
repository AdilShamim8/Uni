import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'
import { eq } from 'drizzle-orm'
import { healthReadySchema } from '@uni/contracts'
import { buildApp } from '../src/app.js'
import { runMigrations } from '../src/db/migrate.js'
import { createDatabase } from '../src/db/client.js'
import { dbMetadata } from '../src/db/schema.js'
import type { Env } from '../src/config/env.js'
import { ensureScratchRoot, getFreePort } from './helpers.js'

/**
 * B01's meaningful DB-backed test: a real (embedded) PostgreSQL per run —
 * migrations apply in order, Drizzle CRUD round-trips, and readiness
 * reflects actual database state in both directions.
 */
const baseEnv: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  HOST: '127.0.0.1',
  LOG_LEVEL: 'fatal',
  DATABASE_URL: undefined,
  CORS_ORIGINS: '',
  APP_URL: 'http://127.0.0.1:4000',
  AUTH_REGISTRATION: 'open',
  CREDENTIAL_MASTER_KEY: undefined,
  CREDENTIAL_KEY_ID: 'test-key-1',
  ALLOW_LOCAL_MODEL_ENDPOINTS: 'false',
  LOCAL_MODEL_ENDPOINT_ALLOWLIST: '',
}

describe('database integration — migrations, CRUD, readiness', () => {
  let postgres: EmbeddedPostgres
  let databaseUrl: string
  let dataDir: string

  beforeAll(async () => {
    const scratch = await ensureScratchRoot()
    dataDir = await mkdtemp(join(scratch, 'uni-pg-'))
    const port = await getFreePort()

    postgres = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: 'uni',
      password: 'uni',
      port,
      persistent: true,
    })
    await postgres.initialise()
    await postgres.start()
    await postgres.createDatabase('uni_test')

    databaseUrl = `postgres://uni:uni@127.0.0.1:${port}/uni_test`
    await runMigrations(databaseUrl)
  }, 180_000)

  afterAll(async () => {
    await postgres.stop()
    await rm(dataDir, { recursive: true, force: true })
  })

  it('applies committed migrations and round-trips CRUD through Drizzle', async () => {
    const database = createDatabase(databaseUrl)
    try {
      const inserted = await database.db
        .insert(dbMetadata)
        .values({ key: 'b01_check', value: 'ok' })
        .returning()
      expect(inserted).toHaveLength(1)
      expect(inserted[0]?.value).toBe('ok')
      expect(inserted[0]?.createdAt).toBeInstanceOf(Date)

      await database.db
        .update(dbMetadata)
        .set({ value: 'updated' })
        .where(eq(dbMetadata.key, 'b01_check'))

      const rows = await database.db
        .select()
        .from(dbMetadata)
        .where(eq(dbMetadata.key, 'b01_check'))
      expect(rows).toHaveLength(1)
      expect(rows[0]?.value).toBe('updated')
    } finally {
      await database.pool.end()
    }
  })

  it('re-running migrations is idempotent (already applied)', async () => {
    await expect(runMigrations(databaseUrl)).resolves.toBeUndefined()
  })

  it('/health/ready reports ready with the database up', async () => {
    const app = await buildApp({ env: { ...baseEnv, DATABASE_URL: databaseUrl } })
    try {
      const response = await app.inject({ method: 'GET', url: '/health/ready' })
      expect(response.statusCode).toBe(200)
      const body = healthReadySchema.parse(response.json())
      expect(body.status).toBe('ready')
      expect(body.checks.database.status).toBe('up')
    } finally {
      await app.close()
    }
  })

  it('/health/ready reports 503 with the database down when unreachable', async () => {
    const deadPort = await getFreePort()
    const app = await buildApp({
      env: { ...baseEnv, DATABASE_URL: `postgres://uni:uni@127.0.0.1:${deadPort}/uni_test` },
    })
    try {
      const response = await app.inject({ method: 'GET', url: '/health/ready' })
      expect(response.statusCode).toBe(503)
      const body = healthReadySchema.parse(response.json())
      expect(body.status).toBe('unavailable')
      expect(body.checks.database.status).toBe('down')
      // No connection details leak into the response.
      expect(response.body).not.toContain('postgres://')
    } finally {
      await app.close()
    }
  })
})
