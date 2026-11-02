import http from 'node:http'
import { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { providerDtoSchema, providerTestResponseSchema } from '@uni/contracts'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * Body-size limits on discovery (U016): an endpoint that answers with a
 * gigantic catalog — whether it declares the size up front or streams
 * it — is rejected at the cap with an honest failure, never buffered
 * into memory or partially adopted as a model list.
 */

describe('provider discovery body-size limits (U016)', () => {
  let testApp: TestApp
  let cookie: string
  let server: http.Server
  let mode: 'declare' | 'stream' = 'declare'

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      if (req.url?.endsWith('/models')) {
        if (mode === 'declare') {
          // Declares an oversized body up front: rejected before reading.
          const body = Buffer.alloc(2_500_000, 0x20)
          res.writeHead(200, { 'content-type': 'application/json', 'content-length': String(body.length) })
          res.end(body)
          return
        }
        // Streams an oversized body without a usable content-length.
        res.writeHead(200, { 'content-type': 'application/json' })
        const chunk = 'x'.repeat(100_000)
        let sent = 0
        const timer = setInterval(() => {
          res.write(chunk)
          sent += chunk.length
          if (sent > 2_500_000) {
            clearInterval(timer)
            res.end()
          }
        }, 5)
        return
      }
      res.writeHead(404).end()
    })
    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
    })

    testApp = await startTestApp()
    const user = await signUpUser(testApp.app, { name: 'Bounds User' })
    cookie = user.cookie
    void port
  }, 180_000)

  afterAll(async () => {
    await testApp?.stop()
    server.close()
  })

  async function createProvider(): Promise<string> {
    const port = (server.address() as AddressInfo).port
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie },
      payload: { label: 'Giant catalog', kind: 'openai-compatible', endpointUrl: `http://127.0.0.1:${port}/v1` },
    })
    expect(created.statusCode).toBe(201)
    return providerDtoSchema.parse(created.json()).id
  }

  it('rejects a catalog that declares an oversized content-length', async () => {
    mode = 'declare'
    const providerId = await createProvider()
    const test = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${providerId}/test`,
      headers: { cookie },
    })
    const result = providerTestResponseSchema.parse(test.json())
    expect(result.ok).toBe(false)
    expect(result.message).toContain('too large')
    expect(result.discoveredModels).toBeNull()
  })

  it('rejects a catalog that streams past the cap', async () => {
    mode = 'stream'
    const providerId = await createProvider()
    const test = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${providerId}/test`,
      headers: { cookie },
    })
    const result = providerTestResponseSchema.parse(test.json())
    expect(result.ok).toBe(false)
    expect(result.message).toContain('too large')

    // And nothing was persisted as a partial catalog.
    const list = await testApp.app.inject({ method: 'GET', url: '/api/v1/providers', headers: { cookie } })
    const provider = (list.json() as { items: Array<{ id: string; models: string[] }> }).items.find(
      (item) => item.id === providerId,
    )
    expect(provider?.models).toEqual([])
  })
})
