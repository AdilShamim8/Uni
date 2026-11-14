import { describe, expect, it } from 'vitest'
import { ERROR_CODES, errorEnvelopeSchema } from '../src/index.js'

/**
 * The one error envelope every non-2xx response uses. Clients branch
 * on `code`, show `message`, and correlate via `requestId` — the shape
 * must stay exactly this strict.
 */
describe('error envelope contract', () => {
  it('accepts a well-formed envelope with details', () => {
    const parsed = errorEnvelopeSchema.parse({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Workspace not found.',
      requestId: 'req-123',
      details: { field: 'workspaceId' },
    })
    expect(parsed.code).toBe('not_found')
    expect(parsed.requestId).toBe('req-123')
  })

  it('accepts an envelope without the optional details', () => {
    const result = errorEnvelopeSchema.safeParse({
      code: ERROR_CODES.CONFLICT,
      message: 'The note changed since you read it.',
      requestId: 'req-124',
    })
    expect(result.success).toBe(true)
  })

  it('rejects envelopes with empty code, message, or requestId', () => {
    expect(
      errorEnvelopeSchema.safeParse({ code: '', message: 'm', requestId: 'r' }).success,
    ).toBe(false)
    expect(
      errorEnvelopeSchema.safeParse({ code: 'c', message: '', requestId: 'r' }).success,
    ).toBe(false)
    expect(
      errorEnvelopeSchema.safeParse({ code: 'c', message: 'm', requestId: '' }).success,
    ).toBe(false)
  })

  it('keeps the stable error-code vocabulary clients branch on', () => {
    expect(Object.values(ERROR_CODES)).toEqual([
      'validation_error',
      'unauthorized',
      'forbidden',
      'not_found',
      'conflict',
      'rate_limited',
      'internal_error',
    ])
  })
})
