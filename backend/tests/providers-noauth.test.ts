import http from 'node:http'
import { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { providerDtoSchema, providerTestResponseSchema } from '@uni/contracts'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * No-auth local model connections (U012): a genuinely keyless local
 * runtime (Ollama-style) connects, discovers models, and GENERATES with
 * no stored credential and no fake key — the outbound request carries
 * no Authorization header at all. The harness env enables the operator
 * local-endpoint policy; hosted egress policy is enforced by the URL
 * guard regardless of credentials (covered by urlGuard tests).
 */

const seen: Array<{ url: string; authorization: string | undefined }> = []

function requestIncludes(url: string): boolean {
  return seen.some((entry) => entry.url === url)
}

describe('providers — genuinely no-auth local model connections', () => {
  let testApp: TestApp
  let cookie: string
  let providerId: string
  let conversationId: string
  let parentNodeId: string
  let server: http.Server

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        seen.push({ url: req.url ?? '', authorization: req.headers.authorization })
        if (req.url?.endsWith('/models')) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ data: [{ id: 'local-model' }] }))
          return
        }
        if (req.url?.endsWith('/chat/completions')) {
          res.writeHead(200, { 'content-type': 'text/event-stream' })
          res.write('data: {"choices":[{"delta":{"content":"Keyless"}}]}\n\n')
          res.write('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n')
          res.end('data: [DONE]\n\n')
          return
        }
        void body
        res.writeHead(404).end()
      })
    })
    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
    })

    testApp = await startTestApp()
    const user = await signUpUser(testApp.app, { name: 'No Auth User' })
    cookie = user.cookie

    // Created WITHOUT any credential — that is the whole point.
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie },
      payload: {
        label: 'Local Ollama',
        kind: 'openai-compatible',
        endpointUrl: `http://127.0.0.1:${port}/v1`,
      },
    })
    expect(created.statusCode).toBe(201)
    providerId = providerDtoSchema.parse(created.json()).id
  }, 180_000)

  afterAll(async () => {
    await testApp?.stop()
    server.close()
  })

  it('connects with no stored credential and no Authorization header', async () => {
    const test = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${providerId}/test`,
      headers: { cookie },
    })
    expect(test.statusCode).toBe(200)
    const result = providerTestResponseSchema.parse(test.json())
    expect(result.ok).toBe(true)
    expect(result.message).toContain('no key')
    // The discovery request carried NO credential header at all.
    expect(requestIncludes('/v1/models')).toBe(true)
    for (const entry of seen) {
      if (entry.url.endsWith('/v1/models')) expect(entry.authorization).toBeUndefined()
    }

    // The provider is honestly marked connected (not "no key stored").
    const list = await testApp.app.inject({ method: 'GET', url: '/api/v1/providers', headers: { cookie } })
    const provider = (
      list.json() as { items: Array<{ id: string; credential: { status: string; present: boolean } }> }
    ).items.find((item) => item.id === providerId)
    expect(provider?.credential.status).toBe('connected')
    expect(provider?.credential.present).toBe(false)
  })

  it('discovers and persists models keylessly', async () => {
    const discover = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${providerId}/models`,
      headers: { cookie },
    })
    expect(discover.statusCode).toBe(200)
    const result = providerTestResponseSchema.parse(discover.json())
    expect(result.ok).toBe(true)
    expect(result.discoveredModels).toEqual(['local-model'])
  })

  it('generates a full run with no credential envelope', async () => {
    const conversation = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/conversations',
      headers: { cookie },
      payload: { title: 'Keyless chat' },
    })
    expect(conversation.statusCode).toBe(201)
    conversationId = (conversation.json() as { id: string }).id

    const node = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/nodes`,
      headers: { cookie },
      payload: { role: 'user', content: 'hi', status: 'complete', clientId: 'noauth-node-1' },
    })
    expect(node.statusCode).toBe(201)
    parentNodeId = (node.json() as { node: { id: string } }).node.id

    const run = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/runs`,
      headers: { cookie },
      payload: { parentNodeId, providerId, modelId: 'local-model', idempotencyKey: 'noauth-run-1' },
    })
    expect(run.statusCode).toBe(201)
    const runId = (run.json() as { run: { id: string } }).run.id

    // Wait for the terminal event via the stream (replay after cursor 0).
    const events = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/runs/${runId}/events?after=0`,
      headers: { cookie, accept: 'text/event-stream' },
    })
    const terminal = events.body.includes('"type":"terminal"')
    expect(terminal).toBe(true)

    const finalRun = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/runs/${runId}`,
      headers: { cookie },
    })
    const runBody = finalRun.json() as { status: string; outputText: string }
    expect(['complete', 'running']).toContain(runBody.status)
    // The generation request carried no credential header either.
    expect(requestIncludes('/v1/chat/completions')).toBe(true)
    for (const entry of seen) {
      if (entry.url.endsWith('/v1/chat/completions')) expect(entry.authorization).toBeUndefined()
    }
  })

  it('an anthropic provider without a credential still fails honestly (key required)', async () => {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie },
      payload: { label: 'Anthropic no key', kind: 'anthropic', endpointUrl: 'https://api.anthropic.com' },
    })
    expect(created.statusCode).toBe(201)
    const id = providerDtoSchema.parse(created.json()).id

    const test = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${id}/test`,
      headers: { cookie },
    })
    const result = providerTestResponseSchema.parse(test.json())
    expect(result.ok).toBe(false)
    expect(result.message).toContain('No API key stored')

    // And a run against it is a clear 400, not a keyless request.
    const run = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${conversationId}/runs`,
      headers: { cookie },
      payload: { parentNodeId, providerId: id, idempotencyKey: 'anthropic-nokey-run' },
    })
    expect(run.statusCode).toBe(400)
    expect((run.json() as { message: string }).message).toContain('no saved credential')
  })
})
