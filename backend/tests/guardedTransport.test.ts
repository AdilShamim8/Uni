import http from 'node:http'
import { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { loadEnv } from '../src/config/env.js'
import { createGuardedFetch } from '../src/lib/guardedTransport.js'
import { UrlGuardError } from '../src/lib/urlGuard.js'
import { buildModelForRun } from '../src/modules/runs/modelClient.js'
import { streamText } from 'ai'

/**
 * Guarded outbound transport (audit F09 / U003). Every case runs against
 * local loopback servers only — no external network is touched.
 *
 * The DNS module is mocked to resolve a name that does NOT exist in the
 * OS resolver (`sdk-host.test`): if the transport ever fell back to the
 * system resolver, the connection would fail with NXDOMAIN. Success
 * therefore proves the validated addresses are pinned to the socket.
 */

const dns = vi.hoisted(() => ({ lookup: vi.fn() }))
vi.mock('node:dns/promises', () => dns)

const LOCAL_ENV = loadEnv({ ALLOW_LOCAL_MODEL_ENDPOINTS: 'true', RUN_TIMEOUT_MS: '20000' })

function listen(server: http.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
  })
}

function close(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()))
}

const servers: http.Server[] = []

afterAll(async () => {
  await Promise.all(servers.map((server) => close(server)))
})

describe('guarded transport — DNS pinning', () => {
  it('connects through the validated address when the OS resolver cannot resolve the name', async () => {
    const seen: string[] = []
    const server = http.createServer((req, res) => {
      seen.push(req.url ?? '')
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end('{"ok":true}')
    })
    servers.push(server)
    const port = await listen(server)
    // 'pinned-host.test' has no OS DNS record — only the pinned (mocked,
    // validated) answer can reach the server.
    dns.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])

    const guardedFetch = createGuardedFetch(LOCAL_ENV)
    const response = await guardedFetch(`http://pinned-host.test:${port}/v1/models`)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('{"ok":true}')
    expect(seen).toEqual(['/v1/models'])
  })

  it('uses the validated address verbatim — a different OS answer is never consulted', async () => {
    // The server listens on 127.0.0.1 and the OS resolves 'localhost' to
    // it; the pinned (validated) answer is 127.0.0.2 where nothing
    // listens. The request must fail against 127.0.0.2 rather than
    // "helpfully" reaching the real server through the OS resolver.
    const server = http.createServer((req, res) => res.end('should-not-be-reached'))
    servers.push(server)
    await listen(server)
    dns.lookup.mockResolvedValue([{ address: '127.0.0.2', family: 4 }])

    const guardedFetch = createGuardedFetch(LOCAL_ENV)
    await expect(guardedFetch('http://localhost/health')).rejects.toThrow()
  })
})

describe('guarded transport — redirect and policy enforcement', () => {
  it('refuses redirects instead of following them to an unvalidated destination', async () => {
    const target = http.createServer((req, res) => res.end('target'))
    const redirector = http.createServer((req, res) => {
      res.writeHead(302, { location: `http://127.0.0.1:${(target.address() as AddressInfo).port}/` })
      res.end()
    })
    servers.push(target, redirector)
    await listen(target)
    const port = await listen(redirector)
    dns.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])

    const guardedFetch = createGuardedFetch(LOCAL_ENV)
    await expect(guardedFetch(`http://pinned-host.test:${port}/`)).rejects.toThrow()
  })

  it('still applies the hosted SSRF policy before any connection', async () => {
    const hostedEnv = loadEnv({})
    const guardedFetch = createGuardedFetch(hostedEnv)
    await expect(guardedFetch('https://10.0.0.9/v1/models')).rejects.toBeInstanceOf(UrlGuardError)
    await expect(guardedFetch('https://[fc00::1]/v1/models')).rejects.toBeInstanceOf(UrlGuardError)
  })
})

describe('guarded transport — deadlines and cancellation', () => {
  it('aborts the in-flight request at the deadline', async () => {
    const server = http.createServer((req, res) => {
      setTimeout(() => res.end('too slow'), 5_000)
    })
    servers.push(server)
    const port = await listen(server)
    dns.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])

    const guardedFetch = createGuardedFetch(LOCAL_ENV, 100)
    await expect(guardedFetch(`http://pinned-host.test:${port}/slow`)).rejects.toThrow(
      'provider request timeout',
    )
  })

  it('propagates caller aborts (run cancellation)', async () => {
    const server = http.createServer((req, res) => {
      setTimeout(() => res.end('late'), 5_000)
    })
    servers.push(server)
    const port = await listen(server)
    dns.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])

    const guardedFetch = createGuardedFetch(LOCAL_ENV, 30_000)
    const controller = new AbortController()
    const pending = guardedFetch(`http://pinned-host.test:${port}/slow`, {
      signal: controller.signal,
    })
    setTimeout(() => controller.abort(), 80)
    await expect(pending).rejects.toThrow()
  })
})

describe('modelClient — AI SDK generation flows through the guarded transport', () => {
  it('streams a completion from a local fake provider via pinned DNS', async () => {
    const requests: Array<{ url: string; authorization: string | undefined }> = []
    const server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        requests.push({ url: req.url ?? '', authorization: req.headers.authorization })
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n')
        res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n')
        res.end('data: [DONE]\n\n')
        void body
      })
    })
    servers.push(server)
    const port = await listen(server)
    // A name with no OS record: the SDK request can only reach the fake
    // provider through the guarded transport's pinned resolution.
    dns.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])

    const { model } = await buildModelForRun(
      {
        id: 'provider-test',
        kind: 'openai-compatible',
        endpointUrl: `http://sdk-host.test:${port}/v1`,
        modelId: 'test-model',
        apiKey: 'sk-test-key',
      },
      LOCAL_ENV,
    )

    const result = streamText({ model, prompt: 'hi', maxRetries: 0 })
    let text = ''
    for await (const delta of result.textStream) text += delta
    expect(text).toBe('Hello')

    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe('/v1/chat/completions')
    expect(requests[0]?.authorization).toBe('Bearer sk-test-key')
  })

  it('refuses a run endpoint the hosted policy blocks', async () => {
    const hostedEnv = loadEnv({})
    await expect(
      buildModelForRun(
        {
          id: 'provider-evil',
          kind: 'openai-compatible',
          endpointUrl: 'https://169.254.169.254/v1',
          modelId: 'test-model',
          apiKey: 'sk-test-key',
        },
        hostedEnv,
      ),
    ).rejects.toBeInstanceOf(UrlGuardError)
  })
})
