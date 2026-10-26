import { z } from 'zod'

/**
 * The single error envelope every non-2xx API response uses.
 * `message` is user-safe (never includes secrets, SQL, or stack traces);
 * `details` carries safe validation information only.
 */
export const errorEnvelopeSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  requestId: z.string().min(1),
  details: z.unknown().optional(),
})

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>

/** Stable error codes — clients branch on these, never on message text. */
export const ERROR_CODES = {
  VALIDATION: 'validation_error',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  RATE_LIMITED: 'rate_limited',
  INTERNAL: 'internal_error',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]
