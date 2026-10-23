import { pino, type Logger } from 'pino'
import type { Env } from '../config/env.js'

/**
 * Structured logging with secret redaction. Authorization headers,
 * cookies, API keys, and credential-shaped fields never reach the logs.
 */
const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'apiKey',
  'api_key',
  'credential',
  'credentials',
  'password',
  'token',
  'secret',
  '*.apiKey',
  '*.api_key',
  '*.credential',
  '*.credentials',
  '*.password',
  '*.token',
  '*.secret',
]

export function createLogger(env: Env, bindings?: Record<string, unknown>): Logger {
  return pino({
    level: env.LOG_LEVEL,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    base: { service: 'uni-backend', env: env.NODE_ENV, ...bindings },
  })
}
