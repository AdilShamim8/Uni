import { describe, expect, it } from 'vitest'
import {
  AppError,
  badRequest,
  conflict,
  forbidden,
  notFound,
  rateLimited,
  unauthorized,
} from '../src/lib/errors.js'
import { ERROR_CODES } from '@uni/contracts'

/**
 * AppError is the stable error vocabulary: one code clients branch on,
 * one HTTP status, a user-safe message. The helpers must keep their
 * code/status pairs.
 */
describe('AppError helpers', () => {
  it('badRequest → validation_error / 400', () => {
    const error = badRequest('The schedule must have five fields.', { field: 'schedule' })
    expect(error).toBeInstanceOf(AppError)
    expect(error.code).toBe(ERROR_CODES.VALIDATION)
    expect(error.httpStatus).toBe(400)
    expect(error.details).toEqual({ field: 'schedule' })
  })

  it('unauthorized → unauthorized / 401 with the default message', () => {
    const error = unauthorized()
    expect(error.code).toBe(ERROR_CODES.UNAUTHORIZED)
    expect(error.httpStatus).toBe(401)
    expect(error.message).toBe('Authentication required.')
  })

  it('forbidden → forbidden / 403', () => {
    const error = forbidden()
    expect(error.code).toBe(ERROR_CODES.FORBIDDEN)
    expect(error.httpStatus).toBe(403)
  })

  it('notFound → not_found / 404', () => {
    const error = notFound('Workspace not found.')
    expect(error.code).toBe(ERROR_CODES.NOT_FOUND)
    expect(error.httpStatus).toBe(404)
    expect(error.message).toBe('Workspace not found.')
  })

  it('conflict → conflict / 409', () => {
    const error = conflict('The note changed since you read it.')
    expect(error.code).toBe(ERROR_CODES.CONFLICT)
    expect(error.httpStatus).toBe(409)
  })

  it('rateLimited → rate_limited / 429', () => {
    const error = rateLimited()
    expect(error.code).toBe(ERROR_CODES.RATE_LIMITED)
    expect(error.httpStatus).toBe(429)
  })

  it('a custom AppError keeps its own code and status', () => {
    const error = new AppError('provider_offline', 'The provider did not answer.', 502)
    expect(error.code).toBe('provider_offline')
    expect(error.httpStatus).toBe(502)
    expect(error.name).toBe('AppError')
  })
})
