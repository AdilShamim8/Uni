import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ERROR_CODES } from '@uni/contracts'
import { buildApp } from '../src/app.js'
import { loadEnv } from '../src/config/env.js'
import type { FastifyInstance } from 'fastify'

/**
 * Single-origin production routing (audit F02 / U010). The audited
 * deployment 404'd on direct loads of UI deep links and API/health
 * paths. Here the API process itself serves the built SPA under a
 * strict precedence contract, verified against a fixture dist that
 * mirrors the real build's shape (index.html + hashed assets):
 *
 * - UI routes (/, /chat, /work…) serve the SPA — deep links and
 *   refreshes work
 * - real files (assets) are served as themselves with immutable
 *   caching; index.html revalidates
 * - /api/* and /health/* always answer JSON — never an HTML fallback
 * - unknown API paths give the contract error envelope
 *
 * No database: buildApp degrades honestly to health + static serving,
 * which is exactly the surface under test.
 */

const INDEX_MARKER = '<title>Uni fixture</title>'
let distDir: string
let app: FastifyInstance

beforeAll(async () => {
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uni-spa-'))
  fs.writeFileSync(
    path.join(distDir, 'index.html'),
    `<!doctype html><html><head>${INDEX_MARKER}</head><body><div id="root"></div><script type="module" src="/assets/app-ABC123.js"></script></body></html>`,
  )
  fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(distDir, 'assets', 'app-ABC123.js'), 'console.log("fixture")')
  fs.writeFileSync(path.join(distDir, 'favicon-64x64.png'), 'fake-png-bytes')

  app = await buildApp({
    env: loadEnv({
      FRONTEND_DIST_DIR: distDir,
      LOG_LEVEL: 'fatal',
      NODE_ENV: 'development',
    }),
  })
  await app.ready()
})

afterAll(async () => {
  await app.close()
  fs.rmSync(distDir, { recursive: true, force: true })
})

describe('single-origin routing — UI deep links load the app', () => {
  it.each(['/', '/chat', '/work', '/agents', '/library', '/chat?thread=abc'])(
    'GET %s serves the SPA shell',
    async (route) => {
      const response = await app.inject({ method: 'GET', url: route })
      expect(response.statusCode).toBe(200)
      expect(response.headers['content-type']).toContain('text/html')
      expect(response.body).toContain(INDEX_MARKER)
      // The shell must revalidate so deploys propagate.
      expect(response.headers['cache-control']).toContain('no-cache')
    },
  )
})

describe('single-origin routing — real files win over the fallback', () => {
  it('serves hashed assets with immutable caching', async () => {
    const response = await app.inject({ method: 'GET', url: '/assets/app-ABC123.js' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('javascript')
    expect(response.body).toBe('console.log("fixture")')
    expect(response.headers['cache-control']).toContain('immutable')
  })

  it('serves other static files (favicon) with revalidation', async () => {
    const response = await app.inject({ method: 'GET', url: '/favicon-64x64.png' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['content-type']).toContain('image')
    expect(response.headers['cache-control']).toContain('no-cache')
  })
})

describe('single-origin routing — API precedence, never HTML fallback', () => {
  it('health routes answer JSON', async () => {
    const ready = await app.inject({ method: 'GET', url: '/health/ready' })
    expect(ready.statusCode).toBe(503) // no database in this fixture
    expect(ready.headers['content-type']).toContain('application/json')
    expect(ready.json()).toEqual({
      status: 'unavailable',
      checks: { database: { status: 'down' } },
    })
  })

  it.each([
    '/api/auth/get-session', // the audited 404 path
    '/api/v1/conversations',
    '/api/v1/nope',
    '/api/anything/else',
    '/health/nope',
  ])('GET %s answers the JSON error envelope — never index.html', async (route) => {
    const response = await app.inject({ method: 'GET', url: route })
    expect(response.statusCode).toBe(404)
    expect(response.headers['content-type']).toContain('application/json')
    const body = response.json() as { code: string; message: string; requestId: string }
    expect(body.code).toBe(ERROR_CODES.NOT_FOUND)
    expect(typeof body.requestId).toBe('string')
    expect(response.body).not.toContain(INDEX_MARKER)
  })

  it('POST to an unknown API path answers JSON (no wildcard for mutations)', async () => {
    const response = await app.inject({ method: 'POST', url: '/api/v1/unknown', payload: {} })
    expect(response.statusCode).toBe(404)
    expect(response.headers['content-type']).toContain('application/json')
    expect((response.json() as { code: string }).code).toBe(ERROR_CODES.NOT_FOUND)
  })

  it('rejects path traversal with a JSON 400', async () => {
    const response = await app.inject({ method: 'GET', url: '/..%2f..%2fetc%2fpasswd' })
    expect(response.statusCode).toBe(400)
    expect(response.headers['content-type']).toContain('application/json')
    expect((response.json() as { code: string }).code).toBe(ERROR_CODES.VALIDATION)
  })
})

describe('single-origin routing — disabled by default', () => {
  it('without FRONTEND_DIST_DIR the API never serves HTML', async () => {
    const apiOnly = await buildApp({
      env: loadEnv({ LOG_LEVEL: 'fatal', NODE_ENV: 'development' }),
    })
    await apiOnly.ready()
    const uiRoute = await apiOnly.inject({ method: 'GET', url: '/chat' })
    expect(uiRoute.statusCode).toBe(404)
    expect(uiRoute.headers['content-type']).toContain('application/json')
    await apiOnly.close()
  })

  it('a configured but missing dist degrades to API-only (honest warn, no crash)', async () => {
    const missing = await buildApp({
      env: loadEnv({
        FRONTEND_DIST_DIR: path.join(os.tmpdir(), 'uni-spa-does-not-exist'),
        LOG_LEVEL: 'fatal',
        NODE_ENV: 'development',
      }),
    })
    await missing.ready()
    const uiRoute = await missing.inject({ method: 'GET', url: '/chat' })
    expect(uiRoute.statusCode).toBe(404)
    expect(uiRoute.headers['content-type']).toContain('application/json')
    const health = await missing.inject({ method: 'GET', url: '/health/live' })
    expect(health.statusCode).toBe(200)
    await missing.close()
  })
})
