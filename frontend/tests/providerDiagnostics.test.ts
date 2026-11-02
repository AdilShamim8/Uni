import { describe, expect, it } from 'vitest'
import {
  OVERSIZED_RESPONSE_DIAGNOSTIC,
  STALE_CONFIGURATION_DIAGNOSTIC,
  diagnoseHttpStatus,
  diagnoseTransportError,
  diagnosticMessage,
  redactSecrets,
} from '@/domain/providerDiagnostics'

/**
 * Typed provider diagnostics (U019): auth failure, quota, invalid
 * model, timeout, network/CORS and unknown readiness produce DISTINCT
 * useful states, each with a concrete retry step — and no error ever
 * contains credentials.
 */

describe('diagnoseHttpStatus — distinct useful states', () => {
  it('auth failures name the key and the console path', () => {
    const diagnostic = diagnoseHttpStatus(401, '{"error":"bad key"}')
    expect(diagnostic.kind).toBe('auth')
    expect(diagnostic.title).toContain('401 Unauthorized')
    expect(diagnostic.retry).toContain('console')
    expect(diagnostic.retryable).toBe(true)

    const forbidden = diagnoseHttpStatus(403)
    expect(forbidden.kind).toBe('auth')
    expect(forbidden.title).toContain('403 Forbidden')
  })

  it('quota states are distinct from auth and each other', () => {
    const rate = diagnoseHttpStatus(429, 'slow down')
    expect(rate.kind).toBe('quota')
    expect(rate.title).toContain('429 Rate limited')
    expect(rate.retryable).toBe(true)

    const payment = diagnoseHttpStatus(402)
    expect(payment.kind).toBe('quota')
    expect(payment.title).toContain('402 Payment required')
    expect(payment.retryable).toBe(false)
    expect(payment.retry).toContain(':free')
  })

  it('invalid model points at the URL and the model id', () => {
    const diagnostic = diagnoseHttpStatus(404, 'no such model')
    expect(diagnostic.kind).toBe('invalid-model')
    expect(diagnostic.retry).toContain('/v1')
    expect(diagnostic.retry).toContain('model id')
  })

  it('timeouts and server errors are separate retryable states', () => {
    expect(diagnoseHttpStatus(408).kind).toBe('timeout')
    const serverError = diagnoseHttpStatus(503)
    expect(serverError.kind).toBe('unreachable')
    expect(serverError.retryable).toBe(true)
  })

  it('anything else is honest unknown guidance', () => {
    const diagnostic = diagnoseHttpStatus(418)
    expect(diagnostic.kind).toBe('unknown')
    expect(diagnostic.title).toContain('418')
    expect(diagnostic.retry.length).toBeGreaterThan(10)
  })

  it('body snippets are capped and never include credentials', () => {
    const longBody = 'x'.repeat(500)
    const diagnostic = diagnoseHttpStatus(500, longBody)
    // The snippet is capped far below the full body.
    expect(diagnostic.title.length).toBeLessThan(300)
    // No header/credential echo ever appears in diagnostics.
    expect(diagnostic.title).not.toContain('Bearer')
    expect(diagnostic.title).not.toContain('sk-')
  })
})

describe('diagnoseTransportError — network vs cancelled', () => {
  it('a cancelled request is its own state', () => {
    const diagnostic = diagnoseTransportError(new DOMException('Aborted', 'AbortError'))
    expect(diagnostic.kind).toBe('cancelled')
  })

  it('a transport failure covers both honest network/CORS possibilities', () => {
    const diagnostic = diagnoseTransportError(new TypeError('Failed to fetch'))
    expect(diagnostic.kind).toBe('network')
    expect(diagnostic.retry).toContain('network')
    expect(diagnostic.retry).toContain('CORS')
  })

  it('the rendered message is title plus the retry step', () => {
    const message = diagnosticMessage(diagnoseHttpStatus(429))
    expect(message).toContain('429 Rate limited')
    expect(message).toContain('—')
    expect(message).toContain('Wait a minute')
  })

  it('fixed diagnostics carry their kinds', () => {
    expect(STALE_CONFIGURATION_DIAGNOSTIC.kind).toBe('stale-config')
    expect(OVERSIZED_RESPONSE_DIAGNOSTIC.kind).toBe('too-large')
    expect(OVERSIZED_RESPONSE_DIAGNOSTIC.retryable).toBe(false)
  })

  it('a hostile endpoint echoing the credential back gets it redacted, never re-displayed', () => {
    const hostile = 'Authorization: Bearer sk-live-abc123def456 was rejected'
    expect(redactSecrets(hostile)).not.toContain('sk-live-abc123def456')
    const diagnostic = diagnoseHttpStatus(500, hostile)
    expect(diagnostic.title).not.toContain('sk-live-abc123def456')
    expect(diagnostic.title).not.toContain('Bearer')
  })
})
