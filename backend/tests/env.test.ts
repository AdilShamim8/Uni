import { describe, expect, it } from 'vitest'
import {
  EnvValidationError,
  loadEnv,
  parseCorsOrigins,
} from '../src/config/env.js'

/**
 * Schema-validated environment configuration: committed defaults exist
 * only for development convenience — production requires an explicit
 * DATABASE_URL, and nothing invalid ever boots.
 */
describe('loadEnv defaults', () => {
  it('development defaults: port 4000, loopback bind, info logs, dev origins', () => {
    const env = loadEnv({})
    expect(env.NODE_ENV).toBe('development')
    expect(env.PORT).toBe(4000)
    expect(env.HOST).toBe('127.0.0.1')
    expect(env.LOG_LEVEL).toBe('info')
    expect(env.CORS_ORIGINS).toBe('http://localhost:5173,http://127.0.0.1:5173')
    expect(env.AUTH_REGISTRATION).toBe('open')
    expect(env.RUN_TIMEOUT_MS).toBe(120_000)
  })

  it('numeric variables coerce from strings', () => {
    const env = loadEnv({ PORT: '5173', RUN_MAX_OUTPUT_TOKENS: '1024' })
    expect(env.PORT).toBe(5173)
    expect(env.RUN_MAX_OUTPUT_TOKENS).toBe(1024)
  })
})

describe('loadEnv validation', () => {
  it('production without DATABASE_URL never boots', () => {
    try {
      loadEnv({ NODE_ENV: 'production' })
      expect.unreachable('loadEnv should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError)
      expect((error as EnvValidationError).issues).toBe('DATABASE_URL: required in production')
    }
  })

  it('production with a DATABASE_URL is accepted', () => {
    const env = loadEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://user:pass@db:5432/uni',
    })
    expect(env.NODE_ENV).toBe('production')
  })

  it('invalid values are rejected with their paths named', () => {
    try {
      loadEnv({ PORT: 'not-a-port' })
      expect.unreachable('loadEnv should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError)
      expect((error as EnvValidationError).issues).toContain('PORT')
    }
    expect(() => loadEnv({ NODE_ENV: 'staging' })).toThrow(EnvValidationError)
    expect(() => loadEnv({ APP_URL: 'not-a-url' })).toThrow(EnvValidationError)
    expect(() => loadEnv({ LOG_LEVEL: 'loud' })).toThrow(EnvValidationError)
    expect(() => loadEnv({ RUN_TIMEOUT_MS: '-1' })).toThrow(EnvValidationError)
  })
})

describe('parseCorsOrigins', () => {
  it('splits, trims, and drops empties', () => {
    expect(parseCorsOrigins('http://a.test, http://b.test ,,')).toEqual([
      'http://a.test',
      'http://b.test',
    ])
  })

  it('the wildcard is never an allowed origin (credentials forbid it)', () => {
    expect(parseCorsOrigins('*,http://a.test')).toEqual(['http://a.test'])
  })

  it('an empty policy yields no origins', () => {
    expect(parseCorsOrigins('')).toEqual([])
  })
})
