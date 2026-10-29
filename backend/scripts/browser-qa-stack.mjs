/*
 * Full-stack dev stack for browser QA: embedded PostgreSQL + migrations
 * + a persistent fake OpenAI-compatible provider + the compiled backend
 * on 127.0.0.1:4000 (production mode, local-model allowlist so the fake
 * provider is reachable). Stays up until killed. Scratch state under
 * /tmp/uni-browser-qa; rerunning wipes it for a clean session.
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { rm, mkdir } from 'node:fs/promises'
import EmbeddedPostgres from 'embedded-postgres'

const scratch = '/tmp/uni-browser-qa'
await rm(scratch, { recursive: true, force: true })
await mkdir(scratch, { recursive: true })

const provider = createServer((request, response) => {
  const url = request.url ?? ''
  if (url.includes('/models')) {
    if (request.headers.authorization !== 'Bearer sk-qa-good-key-0123456789abcdef') {
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
  response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
  const send = (payload) => response.write(`data: ${JSON.stringify(payload)}\n\n`)
  for (const chunk of ['Hello ', 'from ', 'the ', 'browser ', 'QA ', 'stack. ', 'Everything ', 'streams ', 'fine.']) {
    send({ id: 'chatcmpl-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }] })
  }
  send({ id: 'chatcmpl-1', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
  send({ id: 'chatcmpl-1', object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 9, completion_tokens: 9 } })
  response.write('data: [DONE]\n\n')
  response.end()
})

await new Promise((resolve) => provider.listen(4459, '127.0.0.1', resolve))
console.log('fake provider on http://127.0.0.1:4459')

const pg = new EmbeddedPostgres({
  databaseDir: `${scratch}/pg`,
  user: 'uni',
  password: 'uni',
  port: 4458,
  persistent: false,
})
await pg.initialise()
await pg.start()
await pg.createDatabase('uni_qa')
console.log('embedded postgres on 4458')

const { runMigrations } = await import(new URL('../dist/db/migrate.js', import.meta.url).href)
await runMigrations('postgres://uni:uni@127.0.0.1:4458/uni_qa')
console.log('migrations applied')

const server = spawn('node', ['dist/server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: '4000',
    HOST: '127.0.0.1',
    LOG_LEVEL: 'warn',
    DATABASE_URL: 'postgres://uni:uni@127.0.0.1:4458/uni_qa',
    BETTER_AUTH_SECRET: 'browser-qa-secret-not-for-real-deploy-32ch',
    CORS_ORIGINS: 'http://localhost:5173,http://127.0.0.1:5173',
    APP_URL: 'http://127.0.0.1:4000',
    AUTH_REGISTRATION: 'open',
    AUTH_RATE_LIMIT_MAX: '50',
    CREDENTIAL_MASTER_KEY: Buffer.alloc(32, 11).toString('base64'),
    CREDENTIAL_KEY_ID: 'qa-key-1',
    RUN_TIMEOUT_MS: '30000',
    RUN_MAX_OUTPUT_TOKENS: '512',
    RUN_HISTORY_MAX_CHARS: '8000',
    RUN_MAX_CONCURRENT_PER_WORKSPACE: '2',
    RUN_CREATE_RATE_PER_MINUTE: '1000',
    ALLOW_LOCAL_MODEL_ENDPOINTS: 'false',
    LOCAL_MODEL_ENDPOINT_ALLOWLIST: '127.0.0.1',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
})
console.log('backend spawning on 4000')

const shutdown = async (signal) => {
  console.log(`\n${signal} — shutting down`)
  server.kill('SIGTERM')
  await new Promise((resolve) => setTimeout(resolve, 300))
  try {
    await pg.stop()
  } catch {
    /* already down */
  }
  process.exit(0)
}
process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))
