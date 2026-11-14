import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Env } from '../src/config/env.js'
import { createLogger } from '../src/lib/logger.js'

/**
 * Structured logging with secret redaction: credential-shaped fields
 * must never reach the log stream — verified against real pino output.
 */
const testEnv = { LOG_LEVEL: 'info', NODE_ENV: 'test' } as unknown as Env

describe('createLogger redaction', () => {
  const writes: string[] = []
  let spy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    writes.length = 0
    spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      writes.push(String(chunk))
      return true
    })
  })

  afterEach(() => {
    spy.mockRestore()
  })

  function loggedOutput(): string {
    return writes.join('')
  }

  it('redacts a top-level apiKey', () => {
    const logger = createLogger(testEnv)
    logger.info({ apiKey: 'sk-live-secret' }, 'credential stored')
    expect(loggedOutput()).toContain('[redacted]')
    expect(loggedOutput()).not.toContain('sk-live-secret')
  })

  it('redacts credential-shaped fields one level deep (wildcard paths)', () => {
    const logger = createLogger(testEnv)
    logger.info({ provider: { token: 'tok-secret', password: 'hunter2' } }, 'provider checked')
    const out = loggedOutput()
    expect(out).not.toContain('tok-secret')
    expect(out).not.toContain('hunter2')
    expect(out.match(/\[redacted\]/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('ordinary fields pass through unredacted', () => {
    const logger = createLogger(testEnv)
    logger.info({ workspaceId: 'ws_1', providerId: 'prov_1' }, 'scope resolved')
    const out = loggedOutput()
    expect(out).toContain('ws_1')
    expect(out).toContain('prov_1')
  })

  it('binds the service identity and environment', () => {
    const logger = createLogger(testEnv, { module: 'providers' })
    logger.info('ready')
    const out = loggedOutput()
    expect(out).toContain('"service":"uni-backend"')
    expect(out).toContain('"module":"providers"')
  })
})
