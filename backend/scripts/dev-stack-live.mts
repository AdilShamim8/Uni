/**
 * Boot the real Uni backend for live verification:
 * embedded PostgreSQL (isolated data dir under backend/.scratch),
 * committed migrations applied, then the actual Fastify server on
 * 127.0.0.1:4000 with an env equivalent to a dev .env file.
 *
 * Exits after printing "READY" — the server keeps running detached;
 * `scripts/dev-stack-stop.mjs` tears it down.
 */
import EmbeddedPostgres from 'embedded-postgres'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { buildApp } from '../src/app.js'
import { runMigrations } from '../src/db/migrate.js'

const scratch = join(process.cwd(), '.scratch')
await mkdir(scratch, { recursive: true })
const dataDir = await mkdtemp(join(scratch, 'live-pg-'))
const port = 55432

const postgres = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'uni',
  password: 'uni_dev_change_me',
  port,
  persistent: true,
})
await postgres.initialise()
await postgres.start()
await postgres.createDatabase('uni')

const databaseUrl = `postgres://uni:uni_dev_change_me@127.0.0.1:${port}/uni`
await runMigrations(databaseUrl)

const app = await buildApp({
  env: {
    NODE_ENV: 'development',
    PORT: 4000,
    HOST: '127.0.0.1',
    LOG_LEVEL: 'info',
    DATABASE_URL: databaseUrl,
    CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
    APP_URL: 'http://127.0.0.1:4000',
    AUTH_REGISTRATION: 'open',
    AUTH_TRUSTED_PROXIES: '',
    CREDENTIAL_MASTER_KEY: Buffer.alloc(32, 11).toString('base64'),
    CREDENTIAL_KEY_ID: 'live-key-1',
    ALLOW_LOCAL_MODEL_ENDPOINTS: 'true',
    LOCAL_MODEL_ENDPOINT_ALLOWLIST: '',
    RUN_TIMEOUT_MS: 15_000,
    RUN_MAX_OUTPUT_TOKENS: 512,
    RUN_HISTORY_MAX_CHARS: 8_000,
    RUN_MAX_CONCURRENT_PER_WORKSPACE: 2,
    RUN_CREATE_RATE_PER_MINUTE: 60,
  },
})

await app.listen({ port: 4000, host: '127.0.0.1' })
await writeFile(join(scratch, 'live-stack.json'), JSON.stringify({ dataDir, pgPort: port }, null, 2))
console.log('READY http://127.0.0.1:4000')

// Keep the process alive; teardown happens via dev-stack-stop.mjs.
setInterval(() => {}, 1 << 30)
