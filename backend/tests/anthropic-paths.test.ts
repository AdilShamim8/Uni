import http from 'node:http'
import { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { providerTestResponseSchema } from '@uni/contracts'
import { signUpUser, startTestApp, type TestApp } from './harness.js'
import { loadEnv } from '../src/config/env.js'
import { anthropicApiBase } from '../src/lib/providerUrls.js'
import { buildModelForRun } from '../src/modules/runs/modelClient.js'
import { streamText } from 'ai'

/**
 * Anthropic base-path normalization (audit F08 / U006). Connection
 * testing and generation must derive their URLs from ONE policy:
 * discovery probes `<base>/models`, the AI SDK appends `/messages` to
 * the base it is given — and the installed SDK only inserts `/v1` for
 * its exact official host, so a custom gateway root previously sent
 * generation to a bare `/messages` route.
 *
 * Discovery cases run against the real app with DNS + fetch mocked
 * (no network); generation cases run against a local fake Anthropic
 * SSE server reached only through pinned DNS.
 */

const dns = vi.hoisted(() => ({ lookup: vi.fn() }))
vi.mock('node:dns/promises', () => dns)

const LOCAL_ENV = loadEnv({ ALLOW_LOCAL_MODEL_ENDPOINTS: 'true', RUN_TIMEOUT_MS: '20000' })

describe('anthropicApiBase — one normalization policy', () => {
  it.each([
    ['https://api.anthropic.com', 'https://api.anthropic.com/v1'],
    ['https://api.anthropic.com/', 'https://api.anthropic.com/v1'],
    ['https://gw.example/anthropic', 'https://gw.example/anthropic/v1'],
    ['https://gw.example/anthropic/', 'https://gw.example/anthropic/v1'],
    ['https://gw.example/anthropic/v1', 'https://gw.example/anthropic/v1'],
    ['https://gw.example/deep/path/v1', 'https://gw.example/deep/path/v1'],
  ])('%s -> %s', (endpoint, expected) => {
    expect(anthropicApiBase(endpoint)).toBe(expected)
  })
})

describe('anthropic discovery — connection test hits the versioned base', () => {
  let testApp: TestApp
  let cookie: string

  beforeAll(async () => {
    dns.lookup.mockResolvedValue([{ address: '104.18.7.45', family: 4 }])
    testApp = await startTestApp()
    const user = await signUpUser(testApp.app, { name: 'Anthropic User' })
    cookie = user.cookie
  }, 180_000)

  afterAll(async () => {
    vi.unstubAllGlobals()
    await testApp?.stop()
  })

  it.each([
    ['https://api.anthropic.com', 'https://api.anthropic.com/v1/models'],
    ['https://gw.example/anthropic', 'https://gw.example/anthropic/v1/models'],
    ['https://gw.example/anthropic/v1', 'https://gw.example/anthropic/v1/models'],
  ])('probes %s for the key against %s', async (endpointUrl, expectedUrl) => {
    const create = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie },
      payload: { label: 'Anthropic GW', kind: 'anthropic', endpointUrl },
    })
    expect(create.statusCode).toBe(201)
    const id = (create.json() as { id: string }).id

    await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${id}/credential`,
      headers: { cookie },
      payload: { apiKey: 'ant-test-key' },
    })

    const fetchMock = vi.fn(async () => new Response('{"data":[]}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const test = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${id}/test`,
      headers: { cookie },
    })
    expect(test.statusCode).toBe(200)
    const result = providerTestResponseSchema.parse(test.json())
    expect(result.ok).toBe(true)

    const calls = fetchMock.mock.calls as unknown as Array<[unknown]>
    const urls = calls.map(([input]) => (input instanceof Request ? input.url : String(input)))
    expect(urls).toContain(expectedUrl)
    vi.unstubAllGlobals()
  })
})

describe('anthropic generation — the SDK receives the versioned base', () => {
  const servers: http.Server[] = []
  const seenPaths: string[] = []

  beforeAll(() => {
    dns.lookup.mockResolvedValue([{ address: '127.0.0.1', family: 4 }])
  })

  afterAll(async () => {
    await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))))
  })

  function startFakeAnthropic(): Promise<number> {
    const server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        seenPaths.push(`${req.method} ${req.url}`)
        void body
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write('event: message_start\n')
        res.write('data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant","content":[],"model":"claude-test","stop_reason":null,"usage":{"input_tokens":1,"output_tokens":0}}}\n\n')
        res.write('event: content_block_delta\n')
        res.write('data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi"}}\n\n')
        res.write('event: message_delta\n')
        res.write('data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":1}}\n\n')
        res.write('event: message_stop\n')
        res.write('data: {"type":"message_stop"}\n\n')
        res.end()
      })
    })
    servers.push(server)
    return new Promise((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
    })
  }

  it.each([
    ['root base lands on /v1/messages', '', '/v1/messages'],
    ['custom gateway prefix lands on /gateway/v1/messages', '/gateway', '/gateway/v1/messages'],
    ['an explicit /v1 base is not doubled', '/v1', '/v1/messages'],
  ])('%s', async (_label, pathPrefix, expectedPath) => {
    const port = await startFakeAnthropic()
    const { model } = await buildModelForRun(
      {
        id: 'provider-anthropic',
        kind: 'anthropic',
        endpointUrl: `http://sdk-host.test:${port}${pathPrefix}`,
        modelId: 'claude-test',
        apiKey: 'ant-test-key',
      },
      LOCAL_ENV,
    )

    const result = streamText({ model, prompt: 'hi', maxRetries: 0 })
    let text = ''
    for await (const delta of result.textStream) text += delta
    expect(text).toBe('Hi')

    expect(seenPaths.slice(-1)).toEqual([`POST ${expectedPath}`])
  })
})
