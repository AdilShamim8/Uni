import { describe, expect, it, afterAll, beforeAll } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { createServer, type Server } from 'node:http'
import { executeTool, toolContextFor, TOOL_OUTPUT_CAP } from '../src/modules/agent/roster.js'
import type { Env } from '../src/config/env.js'

/**
 * F04 regression suite: the edit tool terminates on self-containing
 * replacements, and read/web_fetch bound INPUT bytes before buffering.
 */

const testEnv: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  HOST: '127.0.0.1',
  LOG_LEVEL: 'fatal',
  CORS_ORIGINS: '',
  APP_URL: 'http://127.0.0.1:4000',
  AUTH_REGISTRATION: 'open',
  AUTH_TRUSTED_PROXIES: '',
  CREDENTIAL_MASTER_KEY: undefined,
  CREDENTIAL_KEY_ID: 'test-key-1',
  ALLOW_LOCAL_MODEL_ENDPOINTS: 'true',
  LOCAL_MODEL_ENDPOINT_ALLOWLIST: '',
  FRONTEND_DIST_DIR: '',
  RUN_TIMEOUT_MS: 15_000,
  RUN_MAX_OUTPUT_TOKENS: 512,
  RUN_HISTORY_MAX_CHARS: 8_000,
  RUN_MAX_CONCURRENT_PER_WORKSPACE: 2,
  RUN_CREATE_RATE_PER_MINUTE: 60,
}

describe('F04 bounded tools', () => {
  let root: string
  let endlessServer: Server
  let endlessUrl: string

  beforeAll(async () => {
    root = await fsp.mkdtemp(path.join(os.tmpdir(), 'uni-f04-'))
    endlessServer = createServer((_request, response) => {
      // An endless text body: if the tool buffers it all, the test run
      // itself would hang or balloon memory.
      response.writeHead(200, { 'content-type': 'text/plain' })
      let sent = 0
      const timer = setInterval(() => {
        response.write(`${'x'.repeat(1_000)}\n`)
        sent += 1_001
        if (sent > 100_000_000) clearInterval(timer)
      }, 1)
      endlessServer.on('close', () => clearInterval(timer))
    })
    endlessUrl = await new Promise<string>((resolve) => {
      endlessServer.listen(0, '127.0.0.1', () => {
        const address = endlessServer.address()
        if (address && typeof address === 'object') {
          resolve(`http://127.0.0.1:${address.port}/endless`)
        }
      })
    })
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => endlessServer.close(() => resolve()))
    await fsp.rm(root, { recursive: true, force: true })
  })

  it('replace-all with a self-containing replacement terminates (oldText=a, newText=aa)', async () => {
    const file = path.join(root, 'grow.txt')
    await fsp.writeFile(file, 'a', 'utf8')
    const ctx = toolContextFor(root, testEnv)
    const outcome = await executeTool(
      'edit',
      ctx,
      { path: 'grow.txt', oldText: 'a', newText: 'aa', replaceAll: true },
      undefined,
    )
    expect(outcome.ok).toBe(true)
    expect(await fsp.readFile(file, 'utf8')).toBe('aa')
  })

  it('identical old/new text terminates without churn', async () => {
    const file = path.join(root, 'same.txt')
    await fsp.writeFile(file, 'abc abc', 'utf8')
    const ctx = toolContextFor(root, testEnv)
    const outcome = await executeTool(
      'edit',
      ctx,
      { path: 'same.txt', oldText: 'abc', newText: 'abc', replaceAll: true },
      undefined,
    )
    expect(outcome.ok).toBe(true)
    expect(await fsp.readFile(file, 'utf8')).toBe('abc abc')
  })

  it('replace-all replaces all non-overlapping occurrences, once each', async () => {
    const file = path.join(root, 'multi.txt')
    await fsp.writeFile(file, 'x-x-x', 'utf8')
    const ctx = toolContextFor(root, testEnv)
    const outcome = await executeTool(
      'edit',
      ctx,
      { path: 'multi.txt', oldText: 'x', newText: 'y', replaceAll: true },
      undefined,
    )
    expect(outcome.ok).toBe(true)
    expect(await fsp.readFile(file, 'utf8')).toBe('y-y-y')
    expect(outcome.output).toContain('3 replacements')
  })

  it('a replacement string containing $& does not corrupt the output', async () => {
    const file = path.join(root, 'dollar.txt')
    await fsp.writeFile(file, 'safe', 'utf8')
    const ctx = toolContextFor(root, testEnv)
    await executeTool(
      'edit',
      ctx,
      { path: 'dollar.txt', oldText: 'safe', newText: "$& $' $`", replaceAll: false },
      undefined,
    )
    expect(await fsp.readFile(file, 'utf8')).toBe("$& $' $`")
  })

  it('read bounds input bytes: an oversized file is truncated, not materialized', async () => {
    // 3 MB of text, over the 2 MB input cap.
    const file = path.join(root, 'big.txt')
    await fsp.writeFile(file, 'a'.repeat(3_000_000), 'utf8')
    const ctx = toolContextFor(root, testEnv)
    const outcome = await executeTool('read', ctx, { path: 'big.txt' }, undefined)
    expect(outcome.ok).toBe(true)
    // The 2 MB input cap + 20k output cap together bound what the model
    // sees; the run completes promptly instead of buffering 3 MB.
    expect(outcome.output.length).toBeLessThanOrEqual(TOOL_OUTPUT_CAP + 100)
    expect(outcome.output).toContain('…[truncated]')
  })

  it('web_fetch bounds an endless body and aborts the stream', async () => {
    const ctx = toolContextFor(root, testEnv)
    const outcome = await executeTool('web_fetch', ctx, { url: endlessUrl }, undefined)
    expect(outcome.ok).toBe(true)
    // The endless stream was cancelled at the input cap; the fenced
    // output the model receives is bounded by the output cap.
    expect(outcome.output).toContain('UNTRUSTED-CONTENT-BEGIN')
    expect(outcome.output.length).toBeLessThanOrEqual(TOOL_OUTPUT_CAP + 100)
    expect(outcome.output).toContain('…[truncated]')
  }, 20_000)
})
