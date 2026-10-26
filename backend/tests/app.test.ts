import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { errorEnvelopeSchema, healthLiveSchema, healthReadySchema } from '@uni/contracts'
import { buildApp } from '../src/app.js'
import type { Env } from '../src/config/env.js'
import { notFound } from '../src/lib/errors.js'

/** A valid environment with no database attached. */
const envWithoutDb: Env = {
  NODE_ENV: 'test',
  PORT: 0,
  HOST: '127.0.0.1',
  LOG_LEVEL: 'fatal',
  DATABASE_URL: undefined,
  CORS_ORIGINS: 'http://localhost:5173',
  APP_URL: 'http://127.0.0.1:4000',
  AUTH_REGISTRATION: 'open',
  CREDENTIAL_MASTER_KEY: undefined,
  CREDENTIAL_KEY_ID: 'test-key-1',
  ALLOW_LOCAL_MODEL_ENDPOINTS: 'false',
  LOCAL_MODEL_ENDPOINT_ALLOWLIST: '',
    RUN_TIMEOUT_MS: 15_000,
    RUN_MAX_OUTPUT_TOKENS: 512,
    RUN_HISTORY_MAX_CHARS: 8_000,
    RUN_MAX_CONCURRENT_PER_WORKSPACE: 2,
    RUN_CREATE_RATE_PER_MINUTE: 60,
}

describe('app factory — health endpoints and error envelope', () => {
  it('GET /health/live answers 200 with the live contract shape', async () => {
    const app = await buildApp({ env: envWithoutDb })
    const response = await app.inject({ method: 'GET', url: '/health/live' })

    expect(response.statusCode).toBe(200)
    expect(healthLiveSchema.parse(response.json())).toEqual({ status: 'live' })

    await app.close()
  })

  it('GET /health/ready reports 503 with database down when no DATABASE_URL', async () => {
    const app = await buildApp({ env: envWithoutDb })
    const response = await app.inject({ method: 'GET', url: '/health/ready' })

    expect(response.statusCode).toBe(503)
    const body = healthReadySchema.parse(response.json())
    expect(body.status).toBe('unavailable')
    expect(body.checks.database.status).toBe('down')

    await app.close()
  })

  it('unknown routes return the 404 error envelope with a requestId', async () => {
    const app = await buildApp({ env: envWithoutDb })
    const response = await app.inject({ method: 'GET', url: '/definitely-not-a-route' })

    expect(response.statusCode).toBe(404)
    const body = errorEnvelopeSchema.parse(response.json())
    expect(body.code).toBe('not_found')
    expect(body.requestId).toBeTruthy()

    await app.close()
  })

  it('thrown AppErrors surface code/status/message/requestId', async () => {
    const app = await buildApp({ env: envWithoutDb })
    app.get('/boom-app', async () => {
      throw notFound('Widget not found.')
    })
    app.get('/boom-raw', async () => {
      throw new Error('secret internal detail: connection string postgres://u:p@h/db')
    })

    const appError = await app.inject({ method: 'GET', url: '/boom-app' })
    expect(appError.statusCode).toBe(404)
    const parsed = errorEnvelopeSchema.parse(appError.json())
    expect(parsed.code).toBe('not_found')
    expect(parsed.message).toBe('Widget not found.')

    const raw = await app.inject({ method: 'GET', url: '/boom-raw' })
    expect(raw.statusCode).toBe(500)
    const internal = errorEnvelopeSchema.parse(raw.json())
    expect(internal.code).toBe('internal_error')
    // No internals leak into the envelope.
    expect(JSON.stringify(internal)).not.toContain('postgres://')

    await app.close()
  })

  it('zod validation failures become 400 validation_error envelopes with safe details', async () => {
    const app = await buildApp({ env: envWithoutDb })
    const payloadSchema = z.object({ name: z.string().min(1) })
    app.post('/validate', async (request) => {
      return payloadSchema.parse(request.body)
    })

    const response = await app.inject({
      method: 'POST',
      url: '/validate',
      payload: { name: 123 },
    })
    expect(response.statusCode).toBe(400)
    const body = errorEnvelopeSchema.parse(response.json())
    expect(body.code).toBe('validation_error')
    expect(JSON.stringify(body.details)).not.toContain('123')

    await app.close()
  })

  it('responds with a generated x-request-id and echoes client request ids', async () => {
    const app = await buildApp({ env: envWithoutDb })

    const generated = await app.inject({ method: 'GET', url: '/health/live' })
    expect(generated.headers['x-request-id']).toBeTruthy()

    const echoed = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { 'x-request-id': 'client-trace-123' },
    })
    expect(echoed.headers['x-request-id']).toBe('client-trace-123')

    await app.close()
  })

  it('CORS: allowed origin is reflected; disallowed origin gets no CORS headers', async () => {
    const app = await buildApp({
      env: { ...envWithoutDb, CORS_ORIGINS: 'http://localhost:5173' },
    })

    const allowed = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { origin: 'http://localhost:5173' },
    })
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173')
    expect(allowed.headers['access-control-allow-credentials']).toBe('true')

    const disallowed = await app.inject({
      method: 'GET',
      url: '/health/live',
      headers: { origin: 'https://evil.example' },
    })
    expect(disallowed.headers['access-control-allow-origin']).toBeUndefined()

    await app.close()
  })
})
