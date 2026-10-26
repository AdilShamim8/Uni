/*
 * Live end-to-end smoke: boots embedded PostgreSQL, runs migrations,
 * starts the COMPILED server (dist/server.js) on a real port, and
 * exercises the HTTP surface — including the two fixes from this
 * change (memory block 404, SSE stream closure). Exits 0 on success.
 */
import { spawn } from 'node:child_process'
import EmbeddedPostgres from 'embedded-postgres'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const TRUSTED_ORIGIN = 'http://localhost:5173'
const results = []
const check = (name, ok, extra = '') => {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${extra ? ` (${extra})` : ''}`)
}

const scratch = await mkdtemp(join(tmpdir(), 'uni-smoke-'))
const port = 4477
const pg = new EmbeddedPostgres({
  databaseDir: join(scratch, 'pg'),
  user: 'uni',
  password: 'uni',
  port: 4478,
  persistent: false,
})
await pg.initialise()
await pg.start()
await pg.createDatabase('uni_smoke')
const databaseUrl = `postgres://uni:uni@127.0.0.1:4478/uni_smoke`

const { runMigrations } = await import(new URL('../dist/db/migrate.js', import.meta.url).href)
await runMigrations(databaseUrl)
console.log('migrations applied')

const server = spawn('node', ['dist/server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(port),
    HOST: '127.0.0.1',
    LOG_LEVEL: 'warn',
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: 'smoke-test-secret-not-for-any-real-deployment-32chars',
    CORS_ORIGINS: TRUSTED_ORIGIN,
    APP_URL: `http://127.0.0.1:${port}`,
    AUTH_REGISTRATION: 'open',
    CREDENTIAL_MASTER_KEY: Buffer.alloc(32, 7).toString('base64'),
    CREDENTIAL_KEY_ID: 'smoke-key-1',
    RUN_TIMEOUT_MS: '15000',
    RUN_MAX_OUTPUT_TOKENS: '512',
    RUN_HISTORY_MAX_CHARS: '8000',
    RUN_MAX_CONCURRENT_PER_WORKSPACE: '2',
    RUN_CREATE_RATE_PER_MINUTE: '60',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
server.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`))
server.stderr.on('data', (d) => process.stderr.write(`[server] ${d}`))

const base = `http://127.0.0.1:${port}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Wait for liveness.
let up = false
for (let i = 0; i < 60; i += 1) {
  try {
    const res = await fetch(`${base}/health/live`)
    if (res.ok) { up = true; break }
  } catch { /* not yet */ }
  await sleep(250)
}
check('server boots and /health/live answers 200', up)

let res = await fetch(`${base}/health/ready`)
check('/health/ready answers 200 with database up', res.status === 200, `status ${res.status}`)

// Unauthenticated API access is rejected.
res = await fetch(`${base}/api/v1/me`)
check('unauthenticated /api/v1/me is 401', res.status === 401, `status ${res.status}`)

// Sign up over real HTTP (cookie round-trip).
res = await fetch(`${base}/api/auth/sign-up/email`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', origin: TRUSTED_ORIGIN },
  body: JSON.stringify({
    name: 'Smoke User',
    email: `smoke.${Date.now()}@example.test`,
    password: 'password-123',
  }),
})
check('sign-up over HTTP succeeds', res.status === 200 || res.status === 201, `status ${res.status}`)
const setCookie = res.headers.getSetCookie?.() ?? []
const cookie = setCookie.map((c) => c.split(';')[0]).join('; ')
check('session cookie is set (HttpOnly)', cookie.includes('uni-auth.session_token'))

// Authenticated /me.
res = await fetch(`${base}/api/v1/me`, { headers: { cookie } })
const me = await res.json()
check('authenticated /api/v1/me returns user + workspace', res.status === 200 && !!me?.workspace?.id, `status ${res.status}`)

// FIX 1 (live): memory block 404s for an unknown employee over HTTP.
res = await fetch(`${base}/api/v1/employees/00000000-0000-0000-0000-000000000000/memory/block`, {
  headers: { cookie },
})
check('memory block 404s for unknown employee (fix 1, live)', res.status === 404, `status ${res.status}`)

// Employee CRUD over HTTP for the happy path.
res = await fetch(`${base}/api/v1/employees`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({ name: 'Smoke Employee', instructions: 'Be terse.' }),
})
const employee = await res.json()
check('employee create over HTTP', res.status === 201 && !!employee?.id, `status ${res.status}`)

res = await fetch(`${base}/api/v1/employees/${employee.id}/memory/block`, { headers: { cookie } })
check('memory block 200 for existing employee (live)', res.status === 200, `status ${res.status}`)

// Library round-trip over HTTP.
res = await fetch(`${base}/api/v1/library/canonical-save`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie },
  body: JSON.stringify({
    title: 'Smoke artifact',
    kind: 'document',
    markdown: '# Smoke\n\nCreated over live HTTP.',
    provenance: 'demo-simulation',
    generatedBy: null,
    taskId: null,
    sourceConversationId: null,
    sourceMessageId: null,
    linkedArtifactId: null,
  }),
})
const saved = await res.json()
check('library canonical-save over HTTP', res.status === 200 && saved?.created === true, `status ${res.status}`)

// Graceful shutdown on SIGTERM (server.ts path).
server.kill('SIGTERM')
const exited = await new Promise((resolve) => {
  const t = setTimeout(() => resolve('timeout'), 10_000)
  server.on('exit', (code, signal) => { clearTimeout(t); resolve(signal ?? code) })
})
check('server exits on SIGTERM', exited === 'SIGTERM' || exited === 0, `exit ${exited}`)

// Same close-handshake drain as the test harness: the server's pool ends
// its sockets asynchronously after the process begins exiting, and stopping
// Postgres inside that window surfaces FATAL 57P01 on closing sockets.
await sleep(250)
await pg.stop()
await rm(scratch, { recursive: true, force: true })

const failed = results.filter((r) => !r.ok)
console.log(`\nSMOKE RESULT: ${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length > 0 ? 1 : 0)
