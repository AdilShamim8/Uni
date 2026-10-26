import { ERROR_CODES, type ErrorCode } from '@uni/contracts'

/**
 * Application error with a stable code, a user-safe message, an HTTP
 * status, and optional safe validation details. Secrets must never be
 * placed in `message` or `details`.
 */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode | string,
    message: string,
    readonly httpStatus: number = 400,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export function badRequest(message: string, details?: unknown): AppError {
  return new AppError(ERROR_CODES.VALIDATION, message, 400, details)
}

export function unauthorized(message = 'Authentication required.'): AppError {
  return new AppError(ERROR_CODES.UNAUTHORIZED, message, 401)
}

export function forbidden(message = 'You do not have access to this resource.'): AppError {
  return new AppError(ERROR_CODES.FORBIDDEN, message, 403)
}

export function notFound(message = 'Resource not found.'): AppError {
  return new AppError(ERROR_CODES.NOT_FOUND, message, 404)
}

export function conflict(message: string, details?: unknown): AppError {
  return new AppError(ERROR_CODES.CONFLICT, message, 409, details)
}

export function rateLimited(message = 'Too many requests.'): AppError {
  return new AppError(ERROR_CODES.RATE_LIMITED, message, 429)
}
