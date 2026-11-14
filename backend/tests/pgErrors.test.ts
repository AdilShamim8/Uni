import { describe, expect, it } from 'vitest'
import { isUniqueViolation } from '../src/lib/pgErrors.js'

/**
 * Postgres 23505 detection through drizzle's error wrapping (N017/N018):
 * node-postgres carries `code` directly, drizzle rethrows with the
 * original on `.cause`.
 */
describe('isUniqueViolation', () => {
  it('detects the code on a bare pg error', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
  })

  it('detects the code on a drizzle-wrapped error via cause', () => {
    const wrapped = new Error('drizzle: the insert failed', {
      cause: { code: '23505' },
    })
    expect(isUniqueViolation(wrapped)).toBe(true)
  })

  it('rejects other SQLSTATE codes on both levels', () => {
    expect(isUniqueViolation({ code: '23503' })).toBe(false) // FK violation
    expect(isUniqueViolation({ code: undefined })).toBe(false)
    expect(isUniqueViolation(new Error('wrapped', { cause: { code: '42P01' } }))).toBe(false)
  })

  it('rejects non-errors safely', () => {
    expect(isUniqueViolation(null)).toBe(false)
    expect(isUniqueViolation(undefined)).toBe(false)
    expect(isUniqueViolation('23505')).toBe(false)
    expect(isUniqueViolation(23505)).toBe(false)
  })

  it('a cause that is not an object is not a match', () => {
    expect(isUniqueViolation(new Error('x', { cause: '23505' }))).toBe(false)
  })
})
