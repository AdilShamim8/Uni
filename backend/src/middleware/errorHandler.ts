import type { FastifyInstance, FastifyError, FastifyReply, FastifyRequest } from 'fastify'
import { ZodError } from 'zod'
import { ERROR_CODES, type ErrorEnvelope } from '@uni/contracts'
import { AppError } from '../lib/errors.js'

/**
 * Centralized error handling: every failure surfaces the contract error
 * envelope { code, message, requestId, details? }. Internal errors are
 * logged with the request id and returned without internals leaking.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError | AppError | ZodError | Error, request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.id

    if (error instanceof AppError) {
      const envelope: ErrorEnvelope = {
        code: error.code,
        message: error.message,
        requestId,
        ...(error.details !== undefined ? { details: error.details } : {}),
      }
      void reply.status(error.httpStatus).send(envelope)
      return
    }

    if (error instanceof ZodError) {
      // flatten() carries paths and messages only — no raw user values.
      const envelope: ErrorEnvelope = {
        code: ERROR_CODES.VALIDATION,
        message: 'Request validation failed.',
        requestId,
        details: error.flatten(),
      }
      void reply.status(400).send(envelope)
      return
    }

    const fastifyError = error as FastifyError
    if (typeof fastifyError.statusCode === 'number' && fastifyError.statusCode >= 400 && fastifyError.statusCode < 500) {
      const envelope: ErrorEnvelope = {
        code: fastifyError.code ?? ERROR_CODES.INTERNAL,
        message: fastifyError.message || 'Request failed.',
        requestId,
      }
      void reply.status(fastifyError.statusCode).send(envelope)
      return
    }

    request.log.error({ err: error, requestId }, 'Unhandled error')
    const envelope: ErrorEnvelope = {
      code: ERROR_CODES.INTERNAL,
      message: 'Something went wrong on our side.',
      requestId,
    }
    void reply.status(500).send(envelope)
  })

  app.setNotFoundHandler((request, reply) => {
    const envelope: ErrorEnvelope = {
      code: ERROR_CODES.NOT_FOUND,
      message: 'Resource not found.',
      requestId: request.id,
    }
    void reply.status(404).send(envelope)
  })
}
