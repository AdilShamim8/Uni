/*
 * Live QA sweep: boots embedded PostgreSQL + the COMPILED server plus a
 * fake OpenAI-compatible provider, then walks the whole public HTTP
 * surface the way an external tester would — happy paths, validation
 * edges, auth boundaries, cross-workspace isolation, SSRF guard, and
 * the full run lifecycle (stream, cancel, timeout, 401/500 provider
 * failures, concurrency cap, idempotency, SSE replay) over real
 * sockets. Exits 0 only when every check passes.
 *
 * Run: npm run build && node scripts/qa-live.mjs
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import EmbeddedPostgres from 'embedded-postgres'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const TRUSTED_ORIGIN = 'http://localhost:5173'
const results = []
let currentPhase = ''
const check = (name, ok, extra = '') => {
  results.push({ phase: currentPhase, name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'} — [${currentPhase}] ${name}${extra ? ` (${extra})` : ''}`)
}
const phase = (label) => {
  currentPhase = label
  console.log(`\n=== ${label} ===`)
}

/* ------------------------------------------------------------------ */
/* Fake OpenAI-compatible provider (mode-switchable)                    */
/* ------------------------------------------------------------------ */

const GOOD_KEY = 'sk-qa-good-key-0123456789abcdef'
const BAD_KEY = 'sk-qa-bad-key-000000000000000000'
let providerMode = 'normal' // normal | slow | badkey | error | hang
let providerHits = 0

const providerServer = createServer((request, response) => {
  providerHits += 1
  const url = request.url ?? ''
  // Connection test + model discovery hit GET /models.
  if (url.includes('/models')) {
    if (request.headers.authorization !== `Bearer ${GOOD_KEY}`) {
      response.writeHead(401, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ error: 'invalid key' }))
      return
    }
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ data: [{ id: 'qa-model-mini' }, { id: 'qa-model-large' }] }))
    return
  }
  if (!url.includes('/chat/completions')) {
    response.writeHead(404, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: 'not found' }))
    return
  }
  if (request.headers.authorization !== `Bearer ${GOOD_KEY}`) {
    response.writeHead(401, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: { message: 'bad key at chat' } }))
    return
  }
  if (providerMode === 'error') {
    response.writeHead(500, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: { message: 'boom from provider' } }))
    return
  }

  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const send = (payload) => response.write(`data: ${JSON.stringify(payload)}\n\n`)
  const delta = (text) =>
    send({ id: 'chatcmpl-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: text }, finish_reason: null }] })
  const finish = () => {
    send({ id: 'chatcmpl-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
    send({ id: 'chatcmpl-1', object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 11, completion_tokens: 5 } })
    response.write('data: [DONE]\n\n')
    response.end()
  }

  if (providerMode === 'normal') {
    for (const chunk of ['Live ', 'QA ', 'reply ', 'from ', 'Uni.']) delta(chunk)
    finish()
    return
  }
  if (providerMode === 'hang') {
    // Accept the request, never answer: exercises the run timeout path.
    return
  }
  if (providerMode === 'slow') {
    let sent = 0
    const timer = setInterval(() => {
      if (sent >= 200) {
        clearInterval(timer)
        finish()
        return
      }
      delta(`chunk-${sent} `)
      sent += 1
    }, 50)
    request.on('close', () => clearInterval(timer))
  }
})

const listen = (server, host = '127.0.0.1') =>
  new Promise((resolve) => {
    server.listen(0, host, () => {
      const address = server.address()
      resolve(`http://${host}:${address.port}`)
    })
  })

/* ------------------------------------------------------------------ */
/* Boot: embedded PG -> migrations -> compiled server                  */
/* ------------------------------------------------------------------ */

const scratch = await mkdtemp(join(tmpdir(), 'uni-qa-'))
const pg = new EmbeddedPostgres({
  databaseDir: join(scratch, 'pg'),
  user: 'uni',
  password: 'uni',
  port: 4498,
  persistent: false,
})
await pg.initialise()
await pg.start()
await pg.createDatabase('uni_qa')
const databaseUrl = `postgres://uni:uni@127.0.0.1:4498/uni_qa`

const { runMigrations } = await import(new URL('../dist/db/migrate.js', import.meta.url).href)
await runMigrations(databaseUrl)
console.log('migrations applied')

const providerUrl = await listen(providerServer)
console.log(`fake provider listening at ${providerUrl}`)

const PORT = 4497
const server = spawn('node', ['dist/server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: String(PORT),
    HOST: '127.0.0.1',
    LOG_LEVEL: 'warn',
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: 'qa-live-secret-not-for-any-real-deployment-32ch',
    CORS_ORIGINS: TRUSTED_ORIGIN,
    APP_URL: `http://127.0.0.1:${PORT}`,
    AUTH_REGISTRATION: 'open',
    // Raised so the sweep can create its QA users in one burst; also
    // exercises the customRules path of the rate-limit config.
    AUTH_RATE_LIMIT_MAX: '50',
    CREDENTIAL_MASTER_KEY: Buffer.alloc(32, 9).toString('base64'),
    CREDENTIAL_KEY_ID: 'qa-key-1',
    RUN_TIMEOUT_MS: '5000',
    RUN_MAX_OUTPUT_TOKENS: '512',
    RUN_HISTORY_MAX_CHARS: '8000',
    RUN_MAX_CONCURRENT_PER_WORKSPACE: '2',
    RUN_CREATE_RATE_PER_MINUTE: '1000',
    ALLOW_LOCAL_MODEL_ENDPOINTS: 'false',
    LOCAL_MODEL_ENDPOINT_ALLOWLIST: '127.0.0.1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let serverStderr = ''
server.stdout.on('data', (d) => process.stdout.write(`[server] ${d}`))
server.stderr.on('data', (d) => {
  const text = String(d)
  serverStderr += text
  process.stderr.write(`[server-err] ${d}`)
})

const base = `http://127.0.0.1:${PORT}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ------------------------------------------------------------------ */
/* HTTP helpers (cookie jars per user)                                  */
/* ------------------------------------------------------------------ */

function makeClient() {
  let cookie = ''
  return {
    get cookie() {
      return cookie
    },
    setCookieFrom(res) {
      const list = res.headers.getSetCookie?.() ?? []
      if (list.length > 0) cookie = list.map((c) => c.split(';')[0]).join('; ')
    },
    async req(path, { method = 'GET', body, headers = {} } = {}) {
      const res = await fetch(`${base}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          origin: TRUSTED_ORIGIN,
          ...(cookie ? { cookie } : {}),
          ...headers,
        },
        ...(body !== undefined ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}),
      })
      this.setCookieFrom(res)
      const text = await res.text()
      let json = null
      try {
        json = text === '' ? null : JSON.parse(text)
      } catch {
        json = { _raw: text }
      }
      return { status: res.status, json, headers: res.headers }
    },
  }
}

const A = makeClient()
const B = makeClient()

/** Assert a contract error envelope (code/message/requestId all present). */
function isEnvelope(json) {
  return (
    !!json && typeof json === 'object' && typeof json.code === 'string' &&
    typeof json.message === 'string' && typeof json.requestId === 'string'
  )
}

/** Read an SSE endpoint until the stream closes or the deadline. */
async function readSse(path, client, { timeoutMs = 30_000, onEvent } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const events = []
  try {
    const res = await fetch(`${base}${path}`, {
      headers: { cookie: client.cookie, accept: 'text/event-stream', origin: TRUSTED_ORIGIN },
      signal: controller.signal,
    })
    if (res.status !== 200) {
      return { status: res.status, events, closedEarly: true }
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let index
      while ((index = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, index)
        buffer = buffer.slice(index + 2)
        const dataLine = frame.split('\n').find((line) => line.startsWith('data: '))
        if (!dataLine) continue
        try {
          const event = JSON.parse(dataLine.slice(6))
          events.push(event)
          onEvent?.(event)
          if (event.type === 'terminal') {
            controller.abort()
            return { status: res.status, events, closedEarly: false }
          }
        } catch {
          /* keepalive or unparsable frame */
        }
      }
    }
  } catch {
    /* aborted after terminal, or timed out */
  } finally {
    clearTimeout(timer)
  }
  return { status: 200, events, closedEarly: !events.some((e) => e.type === 'terminal') }
}

/** Wait for a run to reach a terminal state (polling GET /runs/:id). */
async function waitForTerminal(client, runId, { timeoutMs = 30_000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const { json } = await client.req(`/api/v1/runs/${runId}`)
    if (json?.status && json.status !== 'running' && json.status !== 'cancelling') return json
    await sleep(150)
  }
  return null
}

async function runAllChecks() {
  // Wait for liveness.
  phase('boot')
  {
    let up = false
    for (let i = 0; i < 80; i += 1) {
      try {
        const res = await fetch(`${base}/health/live`)
        if (res.ok) {
          up = true
          break
        }
      } catch {
        /* not yet */
      }
      await sleep(250)
    }
    check('server boots and /health/live answers 200', up)

    const ready = await fetch(`${base}/health/ready`)
    check('/health/ready answers 200 with database up', ready.status === 200, `status ${ready.status}`)
    const idEcho = ready.headers.get('x-request-id')
    check('x-request-id is echoed on responses', typeof idEcho === 'string' && idEcho.length > 0)
  }

  /* ---------------------------------------------------------------- */
  /* Phase 1 — auth                                                    */
  /* ---------------------------------------------------------------- */

  phase('auth')
  {
    let res = await A.req('/api/v1/me')
    check('unauthenticated /api/v1/me is 401 envelope', res.status === 401 && isEnvelope(res.json), `status ${res.status}`)

    res = await A.req('/api/v1/conversations', { method: 'POST', body: {} })
    check('unauthenticated conversation create is 401', res.status === 401, `status ${res.status}`)

    res = await A.req('/api/auth/sign-up/email', {
      method: 'POST',
      body: { name: 'QA', email: 'not-an-email', password: 'password-123' },
    })
    check('sign-up with invalid email is rejected 4xx', res.status >= 400 && res.status < 500, `status ${res.status}`)

    res = await A.req('/api/auth/sign-up/email', {
      method: 'POST',
      body: { name: 'QA', email: 'qa.a@example.test', password: 'short' },
    })
    check('sign-up with weak password is rejected 4xx', res.status >= 400 && res.status < 500, `status ${res.status}`)

    const stamp = Date.now()
    const burst = []
    for (let i = 0; i < 5; i += 1) {
      burst.push(
        A.req('/api/auth/sign-up/email', {
          method: 'POST',
          body: { name: `QA Burst ${i}`, email: `qa.burst.${i}.${stamp}@example.test`, password: 'password-123' },
        }),
      )
    }
    const burstResults = await Promise.all(burst)
    const burstOk = burstResults.filter((r) => r.status >= 200 && r.status < 300).length
    check('rapid sign-ups from one IP are not starved by a shared bucket', burstOk === 5, `${burstOk}/5 succeeded`)

    res = await A.req('/api/auth/sign-up/email', {
      method: 'POST',
      body: { name: 'QA User A', email: `qa.a.${stamp}@example.test`, password: 'password-123' },
    })
    check('sign-up succeeds', res.status >= 200 && res.status < 300, `status ${res.status}`)
    check('session cookie set (HttpOnly)', A.cookie.includes('uni-auth.session_token'))
    const rawCookieHeader = res.headers.getSetCookie?.()[0] ?? ''
    check('cookie carries HttpOnly flag', /httponly/i.test(rawCookieHeader), rawCookieHeader.slice(0, 60))

    res = await A.req('/api/auth/sign-up/email', {
      method: 'POST',
      body: { name: 'QA Dupe', email: `qa.a.${stamp}@example.test`, password: 'password-123' },
    })
    check('duplicate sign-up is rejected 4xx', res.status >= 400 && res.status < 500, `status ${res.status}`)

    res = await A.req('/api/auth/sign-in/email', {
      method: 'POST',
      body: { email: `qa.a.${stamp}@example.test`, password: 'wrong-password' },
    })
    check('sign-in with wrong password is 401', res.status === 401, `status ${res.status}`)

    res = await A.req('/api/v1/me')
    check('authenticated /me returns user + workspace', res.status === 200 && !!res.json?.workspace?.id, `status ${res.status}`)

    check(
      'Better Auth resolves a client IP (no shared-bucket warning)',
      !serverStderr.includes('falling back to a single shared per-path bucket'),
    )

    // Malformed JSON body -> 400 envelope, not a crash.
    const malformed = await fetch(`${base}/api/v1/conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: A.cookie, origin: TRUSTED_ORIGIN },
      body: '{not json',
    })
    check('malformed JSON body is 400 envelope', malformed.status === 400 && isEnvelope(await malformed.json().catch(() => null)), `status ${malformed.status}`)

    // Oversized body -> 413 (1 MiB default limit).
    const bigPayload = { title: 'x'.repeat(1_100_000) }
    const oversized = await fetch(`${base}/api/v1/conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: A.cookie, origin: TRUSTED_ORIGIN },
      body: JSON.stringify(bigPayload),
    })
    check('oversized body is rejected 413', oversized.status === 413, `status ${oversized.status}`)

    // Unknown route -> 404 envelope.
    res = await A.req('/api/v1/definitely-not-a-route')
    check('unknown API route is 404 envelope', res.status === 404 && isEnvelope(res.json), `status ${res.status}`)

    // Second user for isolation checks.
    res = await B.req('/api/auth/sign-up/email', {
      method: 'POST',
      body: { name: 'QA User B', email: `qa.b.${stamp}@example.test`, password: 'password-123' },
    })
    check('second user signs up', res.status >= 200 && res.status < 300, `status ${res.status}`)

    // Sign-out invalidates the session.
    const C = makeClient()
    await C.req('/api/auth/sign-up/email', {
      method: 'POST',
      body: { name: 'QA User C', email: `qa.c.${stamp}@example.test`, password: 'password-123' },
    })
    res = await C.req('/api/auth/sign-out', { method: 'POST', body: {} })
    check('sign-out answers 2xx', res.status >= 200 && res.status < 300, `status ${res.status}`)
    res = await C.req('/api/v1/me')
    check('session invalid after sign-out', res.status === 401, `status ${res.status}`)
  }

  /* ---------------------------------------------------------------- */
  /* Phase 2 — conversations + nodes                                   */
  /* ---------------------------------------------------------------- */

  phase('conversations')
  let convA = null
  {
    let res = await A.req('/api/v1/conversations', { method: 'POST', body: {} })
    check('create conversation with empty body gets default title', res.status === 201 && typeof res.json?.title === 'string' && res.json.title.length > 0, `status ${res.status}`)
    convA = res.json

    res = await A.req('/api/v1/conversations', { method: 'POST', body: { title: 'x'.repeat(201) } })
    check('title over 200 chars is 400 envelope', res.status === 400 && isEnvelope(res.json), `status ${res.status}`)

    res = await A.req('/api/v1/conversations')
    check('list returns a page containing the conversation', res.status === 200 && Array.isArray(res.json?.items) && res.json.items.some((c) => c.id === convA.id), `status ${res.status}`)

    res = await A.req(`/api/v1/conversations/${convA.id}`, { method: 'PATCH', body: { title: 'QA Renamed', pinned: true } })
    check('patch title+pinned works', res.status === 200 && res.json?.title === 'QA Renamed' && res.json?.pinned === true, `status ${res.status}`)
    const updatedAt = res.json?.updatedAt

    res = await A.req(`/api/v1/conversations/${convA.id}`, { method: 'PATCH', body: { title: 'Stale Write', expectedUpdatedAt: updatedAt - 5_000 } })
    check('stale expectedUpdatedAt is 409', res.status === 409, `status ${res.status}`)

    res = await A.req(`/api/v1/conversations/${convA.id}`, { method: 'PATCH', body: { activeLeafId: '00000000-0000-0000-0000-000000000000' } })
    check('patching activeLeafId to unknown node is 400', res.status === 400, `status ${res.status}`)

    // Nodes.
    res = await A.req(`/api/v1/conversations/${convA.id}/nodes`, {
      method: 'POST',
      body: { role: 'user', content: 'Hello from QA', status: 'complete', clientId: 'qa-node-1' },
    })
    check('append user node works', res.status === 201 && res.json?.node?.role === 'user', `status ${res.status}`)
    const node = res.json.node

    res = await A.req(`/api/v1/conversations/${convA.id}/nodes`, {
      method: 'POST',
      body: { role: 'assistant', content: 'x', status: 'streaming' },
    })
    check('direct node create with streaming status is 400', res.status === 400, `status ${res.status}`)

    res = await A.req(`/api/v1/conversations/${convA.id}/nodes`, {
      method: 'POST',
      body: { role: 'user', content: 'x', status: 'complete', parentId: '00000000-0000-0000-0000-000000000000' },
    })
    check('node create with unknown parent is 400', res.status === 400, `status ${res.status}`)

    res = await A.req(`/api/v1/conversations/${convA.id}`)
    check('detail shows node and messageCount', res.status === 200 && res.json?.nodes?.length === 1 && res.json?.messageCount === 1, `status ${res.status}`)

    // Idempotency: the same clientId returns the existing node unchanged.
    res = await A.req(`/api/v1/conversations/${convA.id}/nodes`, {
      method: 'POST',
      body: { role: 'user', content: 'Hello from QA', status: 'complete', clientId: 'qa-node-1' },
    })
    check('node create with the same clientId is idempotent (reused)', res.status === 200 && res.json?.reused === true && res.json?.node?.id === node.id, `status ${res.status}`)

    // Cross-workspace isolation.
    res = await B.req(`/api/v1/conversations/${convA.id}`)
    check('user B cannot read user A conversation (404)', res.status === 404 && isEnvelope(res.json), `status ${res.status}`)
    res = await B.req(`/api/v1/conversations/${convA.id}`, { method: 'PATCH', body: { title: 'Hijack' } })
    check('user B cannot patch user A conversation (404)', res.status === 404, `status ${res.status}`)
    res = await B.req(`/api/v1/conversations/${convA.id}/nodes`, { method: 'POST', body: { role: 'user', content: 'inject', status: 'complete' } })
    check('user B cannot append to user A conversation (404)', res.status === 404, `status ${res.status}`)

    // Pagination: create extra conversations and walk the cursor.
    const created = []
    for (let i = 0; i < 3; i += 1) {
      res = await A.req('/api/v1/conversations', { method: 'POST', body: { title: `QA page ${i}` } })
      created.push(res.json.id)
    }
    res = await A.req('/api/v1/conversations?limit=2')
    const seen = [...res.json.items.map((c) => c.id)]
    let cursor = res.json.nextCursor
    let guard = 0
    while (cursor && guard < 10) {
      const next = await A.req(`/api/v1/conversations?limit=2&cursor=${encodeURIComponent(cursor)}`)
      seen.push(...next.json.items.map((c) => c.id))
      cursor = next.json.nextCursor
      guard += 1
    }
    check('pagination cursor walk returns all conversations', created.every((id) => seen.includes(id)) && seen.length >= 4, `seen ${seen.length}`)

    // Archive filter.
    await A.req(`/api/v1/conversations/${created[0]}`, { method: 'PATCH', body: { archived: true } })
    res = await A.req('/api/v1/conversations?archived=only')
    check('archived=only lists the archived conversation', res.status === 200 && res.json.items.some((c) => c.id === created[0]) && res.json.items.every((c) => c.archived === true), `status ${res.status}`)
    res = await A.req('/api/v1/conversations?archived=exclude')
    check('archived=exclude hides the archived conversation', res.status === 200 && !res.json.items.some((c) => c.id === created[0]), `status ${res.status}`)

    // Delete.
    res = await A.req(`/api/v1/conversations/${created[1]}`, { method: 'DELETE' })
    check('delete conversation is 204', res.status === 204, `status ${res.status}`)
    res = await A.req(`/api/v1/conversations/${created[1]}`)
    check('deleted conversation is 404', res.status === 404, `status ${res.status}`)
  }

  /* ---------------------------------------------------------------- */
  /* Phase 3 — providers (BYOK) + SSRF guard                           */
  /* ---------------------------------------------------------------- */

  phase('providers')
  let providerId = null
  {
    let res = await A.req('/api/v1/providers')
    check('provider list starts empty', res.status === 200 && Array.isArray(res.json?.items) && res.json.items.length === 0, `status ${res.status}`)

    res = await A.req('/api/v1/providers', { method: 'POST', body: { label: 'Bad kind', kind: 'mystery', endpointUrl: 'https://api.example.com/v1' } })
    check('provider create with invalid kind is 400', res.status === 400, `status ${res.status}`)

    res = await A.req('/api/v1/providers', { method: 'POST', body: { kind: 'openai-compatible', endpointUrl: 'https://api.example.com/v1' } })
    check('provider create without label is 400', res.status === 400, `status ${res.status}`)

    res = await A.req('/api/v1/providers', {
      method: 'POST',
      body: { label: 'QA Fake', kind: 'openai-compatible', endpointUrl: providerUrl, modelId: 'qa-model-mini' },
    })
    check('provider create works (allowlisted local endpoint)', res.status === 201 && res.json?.credential?.present === false, `status ${res.status}`)
    providerId = res.json.id

    res = await A.req(`/api/v1/providers/${providerId}/credential`, { method: 'PUT', body: { apiKey: '' } })
    check('empty credential is 400', res.status === 400, `status ${res.status}`)

    res = await A.req(`/api/v1/providers/${providerId}/credential`, { method: 'PUT', body: { apiKey: GOOD_KEY } })
    check('storing credential marks present+untested, keyId set', res.status === 200 && res.json?.credential?.present === true && res.json?.credential?.status === 'untested' && !!res.json?.credential?.keyId, `status ${res.status}`)
    check('raw API key never appears in any provider response', !JSON.stringify(res.json).includes(GOOD_KEY))

    // Connection test against the fake provider: good key.
    res = await A.req(`/api/v1/providers/${providerId}/test`, { method: 'POST', body: {} })
    check('connection test with good key succeeds and discovers models', res.status === 200 && res.json?.ok === true && res.json?.discoveredModels?.includes('qa-model-mini'), `status ${res.status}`)

    // Bad key: fake provider 401s.
    res = await A.req(`/api/v1/providers/${providerId}/credential`, { method: 'PUT', body: { apiKey: BAD_KEY } })
    res = await A.req(`/api/v1/providers/${providerId}/test`, { method: 'POST', body: {} })
    check('connection test with rejected key reports failure + stores lastError', res.status === 200 && res.json?.ok === false && res.json?.provider?.credential?.status === 'error' && typeof res.json?.provider?.credential?.lastError === 'string', `status ${res.status}`)
    check('bad-key response never echoes the key', !JSON.stringify(res.json).includes(BAD_KEY))

    // Restore the good key; model discovery persists the list.
    await A.req(`/api/v1/providers/${providerId}/credential`, { method: 'PUT', body: { apiKey: GOOD_KEY } })
    res = await A.req(`/api/v1/providers/${providerId}/models`, { method: 'POST', body: {} })
    check('model discovery persists models on the provider', res.status === 200 && res.json?.ok === true && res.json?.provider?.models?.length === 2, `status ${res.status}`)

    // Test without any credential -> clean failure, not 500.
    res = await A.req('/api/v1/providers', {
      method: 'POST',
      body: { label: 'No Key', kind: 'openai-compatible', endpointUrl: providerUrl },
    })
    const noKeyId = res.json.id
    res = await A.req(`/api/v1/providers/${noKeyId}/test`, { method: 'POST', body: {} })
    check('test without credential reports no-key (200, ok=false)', res.status === 200 && res.json?.ok === false && /no api key/i.test(res.json?.message ?? ''), `status ${res.status}`)

    // SSRF guard: blocked ranges / schemes / credentials must never be fetched.
    // Each case gets a stored credential so the test reaches the guard.
    const ssrfCases = [
      ['169.254.169.254 metadata (http)', 'http://169.254.169.254/latest/meta-data'],
      ['private range (http)', 'http://192.168.1.10/v1'],
      ['loopback by name (https)', 'https://localhost/v1'],
      ['embedded credentials', 'https://user:pass@example.test/v1'],
      ['non-http scheme', 'ftp://example.test/v1'],
    ]
    for (const [label, endpointUrl] of ssrfCases) {
      const created = await A.req('/api/v1/providers', {
        method: 'POST',
        body: { label: `SSRF ${label}`, kind: 'openai-compatible', endpointUrl },
      })
      await A.req(`/api/v1/providers/${created.json.id}/credential`, { method: 'PUT', body: { apiKey: GOOD_KEY } })
      const test = await A.req(`/api/v1/providers/${created.json.id}/test`, { method: 'POST', body: {} })
      check(
        `SSRF guard blocks ${label}`,
        test.status === 200 && test.json?.ok === false && /blocked address range|HTTPS|not valid|credentials|Only http/i.test(test.json?.message ?? ''),
        `msg "${test.json?.message}"`,
      )
    }

    // Patch + credential delete + provider delete.
    res = await A.req(`/api/v1/providers/${providerId}`, { method: 'PATCH', body: { label: '' } })
    check('patch with empty label is 400', res.status === 400, `status ${res.status}`)
    res = await A.req(`/api/v1/providers/${providerId}`, { method: 'PATCH', body: { label: 'QA Fake Renamed' } })
    check('patch provider label works', res.status === 200 && res.json?.label === 'QA Fake Renamed', `status ${res.status}`)

    res = await A.req(`/api/v1/providers/${providerId}/credential`, { method: 'DELETE' })
    check('deleting credential clears presence', res.status === 200 && res.json?.credential?.present === false, `status ${res.status}`)
    await A.req(`/api/v1/providers/${providerId}/credential`, { method: 'PUT', body: { apiKey: GOOD_KEY } })

    // Cross-workspace isolation on providers.
    res = await B.req(`/api/v1/providers/${providerId}`, { method: 'PATCH', body: { label: 'Hijack' } })
    check('user B cannot patch user A provider (404)', res.status === 404, `status ${res.status}`)
    res = await B.req(`/api/v1/providers/${providerId}/credential`, { method: 'PUT', body: { apiKey: 'stolen' } })
    check('user B cannot overwrite user A credential (404)', res.status === 404, `status ${res.status}`)
    res = await B.req(`/api/v1/providers/${providerId}/test`, { method: 'POST', body: {} })
    check('user B cannot test user A provider (404)', res.status === 404, `status ${res.status}`)
    res = await B.req('/api/v1/providers')
    check("user B's provider list does not leak A's providers", res.status === 200 && !res.json?.items?.some((p) => p.id === providerId))

    res = await A.req(`/api/v1/providers/${noKeyId}`, { method: 'DELETE' })
    check('delete provider works', res.status === 200 || res.status === 204, `status ${res.status}`)
    res = await A.req('/api/v1/providers')
    check('deleted provider is gone from the list', !res.json?.items?.some((p) => p.id === noKeyId))
  }

  /* ---------------------------------------------------------------- */
  /* Phase 4 — employees + memory                                      */
  /* ---------------------------------------------------------------- */

  phase('employees')
  let employeeId = null
  {
    let res = await A.req('/api/v1/employees', { method: 'POST', body: {} })
    check('employee create without name is 400', res.status === 400, `status ${res.status}`)

    res = await A.req('/api/v1/employees', {
      method: 'POST',
      body: { name: 'QA Assistant', instructions: 'Be terse.', starters: ['Say hi'] },
    })
    check('employee create works', res.status === 201 && !!res.json?.id, `status ${res.status}`)
    employeeId = res.json.id

    res = await A.req('/api/v1/employees')
    check('employee list contains the new employee', res.status === 200 && res.json?.items?.some((e) => e.id === employeeId), `status ${res.status}`)

    res = await A.req(`/api/v1/employees/${employeeId}`, { method: 'PATCH', body: {} })
    check('employee patch with empty body is 400', res.status === 400, `status ${res.status}`)

    res = await A.req(`/api/v1/employees/${employeeId}`, { method: 'PATCH', body: { archived: true } })
    check('employee patch archives', res.status === 200 && res.json?.archived === true, `status ${res.status}`)
    await A.req(`/api/v1/employees/${employeeId}`, { method: 'PATCH', body: { archived: false } })

    // Memory notes: create -> edit (hash conflict) -> journal -> delete.
    res = await A.req(`/api/v1/employees/${employeeId}/memory`, { method: 'POST', body: { text: 'User prefers concise answers.' } })
    check('memory note create works', res.status === 201 && res.json?.contentHash?.length === 64, `status ${res.status}`)
    const note = res.json

    res = await A.req(`/api/v1/employees/${employeeId}/memory/${note.id}`, {
      method: 'PUT',
      body: { text: 'Edited note.', expectedHash: 'f'.repeat(64) },
    })
    check('memory note edit with stale hash is 409', res.status === 409, `status ${res.status}`)

    res = await A.req(`/api/v1/employees/${employeeId}/memory/${note.id}`, {
      method: 'PUT',
      body: { text: 'Edited note.', expectedHash: note.contentHash },
    })
    check('memory note edit with current hash works', res.status === 200 && res.json?.text === 'Edited note.', `status ${res.status}`)

    res = await A.req(`/api/v1/employees/${employeeId}/memory/journal`)
    check('memory journal lists created+edited entries', res.status === 200 && res.json?.items?.length >= 2, `status ${res.status}`)

    res = await A.req(`/api/v1/employees/${employeeId}/memory/block`)
    check('memory block renders notes', res.status === 200 && res.json?.noteCount >= 1 && typeof res.json?.block === 'string', `status ${res.status}`)

    res = await A.req(`/api/v1/employees/00000000-0000-0000-0000-000000000000/memory/block`)
    check('memory block for unknown employee is 404', res.status === 404, `status ${res.status}`)

    res = await A.req(`/api/v1/employees/${employeeId}/memory/${note.id}`, { method: 'DELETE' })
    check('memory note delete is 204', res.status === 204, `status ${res.status}`)

    // Isolation.
    res = await B.req(`/api/v1/employees/${employeeId}/memory`, { method: 'POST', body: { text: 'inject' } })
    check('user B cannot add memory to A employee (404)', res.status === 404, `status ${res.status}`)

    // Delete employee.
    res = await A.req(`/api/v1/employees/${employeeId}`, { method: 'DELETE' })
    check('employee delete is 204', res.status === 204, `status ${res.status}`)
  }

  /* ---------------------------------------------------------------- */
  /* Phase 5 — library                                                 */
  /* ---------------------------------------------------------------- */

  phase('library')
  {
    const artifactBody = {
      title: 'QA artifact',
      kind: 'document',
      markdown: '# QA\n\nCreated by the live QA sweep.',
      provenance: 'demo-simulation',
      generatedBy: null,
      taskId: null,
      sourceConversationId: null,
      sourceMessageId: 'qa-msg-1',
      linkedArtifactId: null,
    }
    let res = await A.req('/api/v1/library/canonical-save', { method: 'POST', body: artifactBody })
    check('library canonical-save creates', res.status === 200 && res.json?.created === true && !!res.json?.artifactId && res.json?.version === 1, `status ${res.status} ${JSON.stringify(res.json?.details?.issues ?? '')}`)
    const artifactId = res.json.artifactId

    // m07 rule: re-saving unchanged content through the same source
    // message is a no-op (same artifact, still version 1).
    res = await A.req('/api/v1/library/canonical-save', { method: 'POST', body: artifactBody })
    check('canonical-save of unchanged content is a no-op (created=false, version stays 1)', res.status === 200 && res.json?.created === false && res.json?.artifactId === artifactId && res.json?.version === 1, `status ${res.status} v${res.json?.version}`)

    // m07 rule: changed content through the same source message updates
    // the artifact in place and records a new immutable version.
    res = await A.req('/api/v1/library/canonical-save', {
      method: 'POST',
      body: { ...artifactBody, markdown: '# QA v2\n\nEdited by the live QA sweep.' },
    })
    check('canonical-save of changed content bumps the version in place', res.status === 200 && res.json?.created === false && res.json?.artifactId === artifactId && res.json?.version === 2, `status ${res.status} v${res.json?.version}`)

    res = await A.req('/api/v1/library/artifacts')
    check('library list contains the artifact', res.status === 200 && res.json?.items?.some((a) => a.id === artifactId), `status ${res.status}`)

    res = await A.req(`/api/v1/library/artifacts/${artifactId}`)
    check('library get by id works and shows versionCount', res.status === 200 && res.json?.id === artifactId && res.json?.versionCount === 2, `status ${res.status}`)

    res = await A.req(`/api/v1/library/artifacts/${artifactId}/versions`)
    check('library versions lists both versions', res.status === 200 && res.json?.items?.length === 2, `status ${res.status}`)

    res = await A.req(`/api/v1/library/artifacts/${artifactId}`, { method: 'PATCH', body: { title: 'QA artifact v2' } })
    check('library patch updates title', res.status === 200 && res.json?.title === 'QA artifact v2', `status ${res.status}`)

    res = await B.req(`/api/v1/library/artifacts/${artifactId}`)
    check('user B cannot read user A artifact (404)', res.status === 404, `status ${res.status}`)

    res = await A.req(`/api/v1/library/artifacts/${artifactId}`, { method: 'DELETE' })
    check('library delete is 200/204', res.status === 200 || res.status === 204, `status ${res.status}`)
    res = await A.req(`/api/v1/library/artifacts/${artifactId}`)
    check('deleted artifact is 404', res.status === 404, `status ${res.status}`)
  }

  /* ---------------------------------------------------------------- */
  /* Phase 6 — importer                                                */
  /* ---------------------------------------------------------------- */

  phase('importer')
  {
    const node = {
      id: 'b-node-1',
      role: 'user',
      content: 'Imported message',
      createdAt: Date.now(),
      status: 'complete',
    }
    const backup = {
      kind: 'uni-workspace-backup',
      version: 1,
      savedAt: Date.now(),
      payload: {
        app: {
          version: 1,
          savedAt: Date.now(),
          conversations: [
            {
              id: 'b-conv-1',
              title: 'Imported conversation',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              nodes: { 'b-node-1': node },
              activeLeafId: 'b-node-1',
            },
          ],
        },
      },
    }

    let res = await A.req('/api/v1/import/preview', { method: 'POST', body: backup })
    check('import preview counts conversations and messages', res.status === 200 && res.json?.counts?.conversations === 1 && res.json?.counts?.messages === 1, `status ${res.status}`)

    res = await A.req('/api/v1/import/preview', { method: 'POST', body: { kind: 'garbage' } })
    check('import preview with invalid backup is 400 with issues', res.status === 400 && Array.isArray(res.json?.details?.issues), `status ${res.status}`)

    res = await A.req('/api/v1/import/commit', { method: 'POST', body: backup })
    check('import commit creates the conversation', res.status === 200 && res.json?.imported?.conversations === 1, `status ${res.status}`)
    const importedId = res.json?.conversationIdMap?.['b-conv-1']
    check('import commit maps the source id', typeof importedId === 'string' && importedId.length > 0, JSON.stringify(res.json?.conversationIdMap ?? {}))

    res = await A.req('/api/v1/import/commit', { method: 'POST', body: backup })
    check('import commit is idempotent (idempotentReplay)', res.status === 200 && res.json?.idempotentReplay === true, `status ${res.status}`)

    const detail = await A.req(`/api/v1/conversations/${importedId}`)
    check('imported conversation is readable with its node', detail.status === 200 && detail.json?.nodes?.length === 1 && detail.json.nodes[0].content === 'Imported message', `status ${detail.status}`)
  }

  /* ---------------------------------------------------------------- */
  /* Phase 7 — runs over real HTTP against the fake provider           */
  /* ---------------------------------------------------------------- */

  phase('runs')
  {
    // Fresh conversation + user node + provider with the good key.
    let res = await A.req('/api/v1/conversations', { method: 'POST', body: { title: 'QA Runs' } })
    const runConv = res.json.id
    res = await A.req(`/api/v1/conversations/${runConv}/nodes`, {
      method: 'POST',
      body: { role: 'user', content: 'Stream me a reply', status: 'complete' },
    })
    const parentNodeId = res.json.node.id

    // 404s first.
    res = await A.req('/api/v1/runs/00000000-0000-0000-0000-000000000000')
    check('get unknown run is 404', res.status === 404, `status ${res.status}`)
    res = await A.req('/api/v1/runs/00000000-0000-0000-0000-000000000000/cancel', { method: 'POST', body: {} })
    check('cancel unknown run is 404', res.status === 404, `status ${res.status}`)

    // Provider without credential -> 400, not 404/500.
    const noKeyProvider = await A.req('/api/v1/providers', {
      method: 'POST',
      body: { label: 'No Key Runs', kind: 'openai-compatible', endpointUrl: providerUrl, modelId: 'qa-model-mini' },
    })
    res = await A.req(`/api/v1/conversations/${runConv}/runs`, {
      method: 'POST',
      body: { parentNodeId, providerId: noKeyProvider.json.id },
    })
    check('run against provider without credential is 400 with clear message', res.status === 400 && /no saved credential/i.test(res.json?.message ?? ''), `status ${res.status} ${res.json?.message}`)

    // Happy path: stream to completion over SSE.
    providerMode = 'normal'
    res = await A.req(`/api/v1/conversations/${runConv}/runs`, {
      method: 'POST',
      body: { parentNodeId, providerId, idempotencyKey: 'qa-happy-1' },
    })
    check('create run is 201 with a run id', res.status === 201 && !!res.json?.run?.id, `status ${res.status}`)
    const happyRun = res.json.run

    const stream = await readSse(`/api/v1/runs/${happyRun.id}/events?after=0`, A)
    const types = stream.events.map((e) => e.type)
    const terminal = stream.events.find((e) => e.type === 'terminal')
    const deltas = stream.events.filter((e) => e.type === 'delta')
    // Delta events may coalesce a fast stream into one frame; what must
    // hold is: started, at least one delta, usage, terminal complete.
    check('SSE delivers started, delta(s), usage, terminal complete', types.includes('started') && deltas.length >= 1 && types.includes('usage') && terminal?.payload?.status === 'complete', `types ${JSON.stringify(types)}`)
    check('SSE stream closes after the terminal event', !stream.closedEarly)
    const streamed = deltas.map((e) => e.payload.text ?? '').join('')
    const happyRow = await A.req(`/api/v1/runs/${happyRun.id}`)
    check('terminal run outputText matches the stream', happyRow.json?.outputText === streamed, `streamed "${streamed.slice(0, 30)}"`)

    // Transcript node committed + activeLeaf advanced.
    const detail = await A.req(`/api/v1/conversations/${runConv}`)
    const assistantNodes = detail.json.nodes.filter((n) => n.role === 'assistant')
    check('assistant transcript node is committed with full content', assistantNodes.length === 1 && assistantNodes[0].content === streamed, `nodes ${assistantNodes.length}`)
    check('conversation activeLeafId points at the assistant node', detail.json.activeLeafId === assistantNodes[0].id)

    // Idempotency: same key returns the same run.
    res = await A.req(`/api/v1/conversations/${runConv}/runs`, {
      method: 'POST',
      body: { parentNodeId, providerId, idempotencyKey: 'qa-happy-1' },
    })
    check('idempotent run create returns the same run (reused)', res.status === 200 && res.json?.reused === true && res.json?.run?.id === happyRun.id, `status ${res.status}`)

    // SSE replay from a cursor: after=1 replays everything past sequence 1.
    const replay = await readSse(`/api/v1/runs/${happyRun.id}/events?after=1`, A)
    check('SSE replay honors the after cursor', replay.events.length === stream.events.length - 1 && replay.events[0]?.sequence === 2, `got ${replay.events.length} vs ${stream.events.length - 1}`)

    // Bad-key run: provider 401s at chat completion.
    await A.req(`/api/v1/providers/${providerId}/credential`, { method: 'PUT', body: { apiKey: BAD_KEY } })
    providerMode = 'normal'
    res = await A.req(`/api/v1/conversations/${runConv}/runs`, {
      method: 'POST',
      body: { parentNodeId, providerId, idempotencyKey: 'qa-badkey-1' },
    })
    const badKeyRun = await waitForTerminal(A, res.json.run.id)
    check('bad-key run ends in error with a safe message', badKeyRun?.status === 'error' && !!badKeyRun?.errorMessage && !JSON.stringify(badKeyRun).includes(BAD_KEY), `status ${badKeyRun?.status} err ${badKeyRun?.errorCode}`)
    await A.req(`/api/v1/providers/${providerId}/credential`, { method: 'PUT', body: { apiKey: GOOD_KEY } })

    // Provider 500 -> error, never complete.
    providerMode = 'error'
    res = await A.req(`/api/v1/conversations/${runConv}/runs`, {
      method: 'POST',
      body: { parentNodeId, providerId, idempotencyKey: 'qa-500-1' },
    })
    const errRun = await waitForTerminal(A, res.json.run.id)
    check('provider 500 records error (provider_error), never complete', errRun?.status === 'error' && errRun?.errorCode === 'provider_error', `status ${errRun?.status} code ${errRun?.errorCode}`)

    // Cancel: stream slowly, wait for a real delta, then cancel.
    providerMode = 'slow'
    res = await A.req(`/api/v1/conversations/${runConv}/runs`, {
      method: 'POST',
      body: { parentNodeId, providerId, idempotencyKey: 'qa-cancel-1' },
    })
    const cancelRun = res.json.run
    let sawDelta = false
    const cancelStream = readSse(`/api/v1/runs/${cancelRun.id}/events?after=0`, A, {
      timeoutMs: 30_000,
      onEvent: (event) => {
        if (event.type === 'delta' && !sawDelta) {
          sawDelta = true
          void A.req(`/api/v1/runs/${cancelRun.id}/cancel`, { method: 'POST', body: {} })
        }
      },
    })
    const cancelResult = await cancelStream
    const cancelTerminal = cancelResult.events.find((e) => e.type === 'terminal')
    check('cancel after a real delta stops the run', sawDelta && cancelTerminal?.payload?.status === 'stopped', `sawDelta ${sawDelta} terminal ${cancelTerminal?.payload?.status}`)
    const cancelledRunRow = await A.req(`/api/v1/runs/${cancelRun.id}`)
    check('cancelled run keeps partial output and stopped status', cancelledRunRow.json?.status === 'stopped' && typeof cancelledRunRow.json?.outputText === 'string' && cancelledRunRow.json.outputText.length > 0, `output "${(cancelledRunRow.json?.outputText ?? '').slice(0, 30)}"`)

    // Timeout: provider accepts and hangs; RUN_TIMEOUT_MS=5000 kills it.
    providerMode = 'hang'
    res = await A.req(`/api/v1/conversations/${runConv}/runs`, {
      method: 'POST',
      body: { parentNodeId, providerId, idempotencyKey: 'qa-timeout-1' },
    })
    const hangRun = await waitForTerminal(A, res.json.run.id, { timeoutMs: 20_000 })
    check('hanging provider times out with errorCode timeout', hangRun?.status === 'error' && hangRun?.errorCode === 'timeout', `status ${hangRun?.status} code ${hangRun?.errorCode}`)

    // Concurrency cap: two slow runs fill the limit, the third is 429.
    providerMode = 'slow'
    const convForConc = await A.req('/api/v1/conversations', { method: 'POST', body: { title: 'QA Concurrency' } })
    const concNode = await A.req(`/api/v1/conversations/${convForConc.json.id}/nodes`, {
      method: 'POST',
      body: { role: 'user', content: 'slow please', status: 'complete' },
    })
    const first = await A.req(`/api/v1/conversations/${convForConc.json.id}/runs`, {
      method: 'POST',
      body: { parentNodeId: concNode.json.node.id, providerId, idempotencyKey: 'qa-conc-1' },
    })
    const second = await A.req(`/api/v1/conversations/${convForConc.json.id}/runs`, {
      method: 'POST',
      body: { parentNodeId: concNode.json.node.id, providerId, idempotencyKey: 'qa-conc-2' },
    })
    const third = await A.req(`/api/v1/conversations/${convForConc.json.id}/runs`, {
      method: 'POST',
      body: { parentNodeId: concNode.json.node.id, providerId, idempotencyKey: 'qa-conc-3' },
    })
    check('third concurrent run is rate limited (429)', first.status === 201 && second.status === 201 && third.status === 429, `${first.status}/${second.status}/${third.status}`)

    // Cancel both to free the workspace.
    await A.req(`/api/v1/runs/${first.json.run.id}/cancel`, { method: 'POST', body: {} })
    await A.req(`/api/v1/runs/${second.json.run.id}/cancel`, { method: 'POST', body: {} })
    await waitForTerminal(A, first.json.run.id)
    await waitForTerminal(A, second.json.run.id)

    // Workspace isolation on runs.
    res = await B.req(`/api/v1/runs/${happyRun.id}`)
    check('user B cannot read user A run (404)', res.status === 404, `status ${res.status}`)
    res = await B.req(`/api/v1/runs/${happyRun.id}/cancel`, { method: 'POST', body: {} })
    check('user B cannot cancel user A run (404)', res.status === 404, `status ${res.status}`)
    const bStream = await readSse(`/api/v1/runs/${happyRun.id}/events?after=0`, B, { timeoutMs: 3_000 })
    check('user B cannot stream user A run (404)', bStream.status === 404, `status ${bStream.status}`)
    res = await B.req(`/api/v1/conversations/${runConv}/runs`, {
      method: 'POST',
      body: { parentNodeId, providerId, idempotencyKey: 'qa-b-isolation' },
    })
    check('user B cannot start a run in A conversation (404)', res.status === 404, `status ${res.status}`)

    // Provider hits sanity: the fake provider saw real traffic.
    check('fake provider received real traffic during the phase', providerHits >= 5, `hits ${providerHits}`)
  }
}

/* ------------------------------------------------------------------ */
/* Execute + teardown (always runs, even when a check throws)           */
/* ------------------------------------------------------------------ */

let harnessError = null
try {
  await runAllChecks()
} catch (error) {
  harnessError = error
  console.error('\nQA HARNESS ERROR:', error)
} finally {
  phase('shutdown')
  {
    server.kill('SIGTERM')
    const exited = await new Promise((resolve) => {
      const t = setTimeout(() => resolve('timeout'), 10_000)
      server.on('exit', (code, signal) => {
        clearTimeout(t)
        resolve(signal ?? code)
      })
    })
    check('server exits on SIGTERM', exited === 'SIGTERM' || exited === 0, `exit ${exited}`)

    providerServer.close()
    await sleep(250)
    try {
      await pg.stop()
      await rm(scratch, { recursive: true, force: true })
    } catch (error) {
      check('scratch cleanup completes', false, String(error))
    }
  }
}

const failed = results.filter((r) => !r.ok)
console.log(`\nQA RESULT: ${results.length - failed.length}/${results.length} passed`)
if (failed.length > 0) {
  console.log('\nFailed checks:')
  for (const f of failed) console.log(`  FAIL — [${f.phase}] ${f.name}`)
}
process.exitCode = failed.length > 0 || harnessError !== null ? 1 : 0
