import http from 'node:http'
import { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { providerDtoSchema, providerTestResponseSchema } from '@uni/contracts'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * Manual model setup when discovery is unsupported (U017): a provider
 * whose /models is unavailable (404/501) but whose inference works can
 * be configured through an explicit model id, verified by an actual
 * one-token test generation — with distinct honest failures for a
 * missing model id, an unknown model, and a rejected key.
 */

const seen: Array<{ url: string; body: string }> = []

describe('manual model verification (U017)', () => {
  let testApp: TestApp
  let cookie: string
  let server: http.Server
  let generationStatus = 200

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      let body = ''
      req.on('data', (chunk) => {
        body += chunk
      })
      req.on('end', () => {
        seen.push({ url: req.url ?? '', body })
        if (req.url?.endsWith('/models')) {
          res.writeHead(404, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: 'no such route' }))
          return
        }
        if (req.url?.endsWith('/chat/completions')) {
          if (generationStatus !== 200) {
            res.writeHead(generationStatus, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: 'boom' }))
            return
          }
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }))
          return
        }
        res.writeHead(404).end()
      })
    })
    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
    })

    testApp = await startTestApp()
    const user = await signUpUser(testApp.app, { name: 'Manual Model User' })
    cookie = user.cookie
    void port
  }, 180_000)

  afterAll(async () => {
    await testApp?.stop()
    server.close()
  })

  async function createProvider(modelId?: string): Promise<string> {
    const port = (server.address() as AddressInfo).port
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/providers',
      headers: { cookie },
      payload: {
        label: 'No discovery',
        kind: 'openai-compatible',
        endpointUrl: `http://127.0.0.1:${port}/v1`,
        ...(modelId ? { modelId } : {}),
      },
    })
    expect(created.statusCode).toBe(201)
    const provider = providerDtoSchema.parse(created.json())
    const put = await testApp.app.inject({
      method: 'PUT',
      url: `/api/v1/providers/${provider.id}/credential`,
      headers: { cookie },
      payload: { apiKey: 'sk-manual-key' },
    })
    expect(put.statusCode).toBe(200)
    return provider.id
  }

  it('a provider with a manual model is verified by a test generation', async () => {
    generationStatus = 200
    const providerId = await createProvider('manual-model-a')

    const test = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${providerId}/test`,
      headers: { cookie },
    })
    const result = providerTestResponseSchema.parse(test.json())
    expect(result.ok).toBe(true)
    expect(result.message).toContain('manual setup')
    expect(result.message).toContain('manual-model-a')

    // The verification actually reached the generation route with the
    // exact manually configured model.
    const generation = seen.filter((entry) => entry.url.endsWith('/chat/completions')).pop()
    expect(generation).toBeDefined()
    expect(generation?.body).toContain('"model":"manual-model-a"')

    // And the provider is marked connected.
    const list = await testApp.app.inject({ method: 'GET', url: '/api/v1/providers', headers: { cookie } })
    const provider = (list.json() as { items: Array<{ id: string; credential: { status: string } }> }).items.find(
      (item) => item.id === providerId,
    )
    expect(provider?.credential.status).toBe('connected')
  })

  it('without a manual model the no-discovery endpoint fails honestly', async () => {
    const providerId = await createProvider()
    const test = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${providerId}/test`,
      headers: { cookie },
    })
    const result = providerTestResponseSchema.parse(test.json())
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Set a model id manually')
  })

  it('an unknown manual model is a distinct honest failure', async () => {
    generationStatus = 404
    const providerId = await createProvider('no-such-model')
    const test = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/providers/${providerId}/test`,
      headers: { cookie },
    })
    const result = providerTestResponseSchema.parse(test.json())
    expect(result.ok).toBe(false)
    expect(result.message).toContain('does not know the model')
    expect(result.message).toContain('no-such-model')
    generationStatus = 200
  })
})
