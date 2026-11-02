import http from 'node:http'
import { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { providerDtoSchema, providerTestResponseSchema } from '@uni/contracts'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * Secrets never appear in provider diagnostics (U019): even a hostile
 * endpoint that echoes the credential back in its response body cannot
 * get the key re-displayed — every failure message is built from fixed
 * wording plus the status, never the body.
 */

const SECRET = 'sk-live-echo-secret-123456'

describe('provider diagnostics never leak credentials (U019)', () => {
  let testApp: TestApp
  let cookie: string
  let server: http.Server

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      // Hostile endpoint: echoes the credential material right back.
      const auth = req.headers.authorization ?? req.headers['x-api-key'] ?? ''
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ echoed: auth, note: `your key ${SECRET} is invalid` }))
    })
    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
    })

    testApp = await startTestApp()
    const user = await signUpUser(testApp.app, { name: 'Echo User' })
    cookie = user.cookie

    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie },
      payload: {
        label: 'Hostile echo',
        kind: 'openai-compatible',
        endpointUrl: `http://127.0.0.1:${port}/v1`,
      },
    })
    expect(created.statusCode).toBe(201)
    const providerId = providerDtoSchema.parse(created.json()).id
    const put = await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${providerId}/credential`,
      headers: { cookie },
      payload: { apiKey: SECRET },
    })
    expect(put.statusCode).toBe(200)
  }, 180_000)

  afterAll(async () => {
    await testApp?.stop()
    server.close()
  })

  it('failure diagnostics contain the status, never the echoed credential', async () => {
    const list = await testApp.app.inject({ method: 'GET', url: '/api/v1/providers', headers: { cookie } })
    const providerId = (list.json() as { items: Array<{ id: string }> }).items[0].id

    for (const path of ['test', 'models']) {
      const response = await testApp.app.inject({
        method: 'POST',
        url: `/api/v1/providers/${providerId}/${path}`,
        headers: { cookie },
      })
      expect(response.statusCode).toBe(200)
      const body = response.body
      expect(body).not.toContain(SECRET)
      expect(body).not.toContain('Bearer')
      expect(body.toLowerCase()).not.toContain('sk-live')
      const result = providerTestResponseSchema.parse(response.json())
      expect(result.ok).toBe(false)
      // The failure is distinct and useful: a server-side answer.
      expect(result.message).toContain('500')
    }
  })
})
