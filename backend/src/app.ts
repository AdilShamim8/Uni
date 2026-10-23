import Fastify, { type FastifyBaseLogger, type FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import cors from '@fastify/cors'
import type { Logger } from 'pino'
import { loadEnv, parseCorsOrigins, type Env } from './config/env.js'
import { createLogger } from './lib/logger.js'
import { registerErrorHandler } from './middleware/errorHandler.js'
import { attachDatabase } from './db/client.js'
import { healthRoutes } from './modules/health/health.routes.js'

export interface BuildAppOptions {
  env?: Env
  logger?: Logger
}

/**
 * Server factory — the whole app builds without listening so tests can
 * use Fastify injection. Startup order: config -> logger -> env/db
 * decorations -> CORS -> error handling -> routes.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const env = options.env ?? loadEnv()

  const app = Fastify({
    // Keep the instance's logger generic on FastifyBaseLogger; the pino
    // logger satisfies it structurally (info/warn/error/fatal/debug/trace/child).
    loggerInstance: (options.logger ?? createLogger(env)) as FastifyBaseLogger,
    genReqId: () => randomUUID(),
    requestIdHeader: 'x-request-id',
    bodyLimit: 1_048_576, // 1 MiB default; route-specific limits may lower this
  })

  app.decorate('env', env)
  await attachDatabase(app)

  // Echo the effective request id so clients can correlate errors and logs.
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('x-request-id', reply.request.id)
  })

  const allowedOrigins = parseCorsOrigins(env.CORS_ORIGINS)
  await app.register(cors, {
    origin(origin, callback) {
      // Reflect only explicitly allowed origins — never wildcard with credentials.
      if (origin && allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }
      callback(null, false)
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  })

  registerErrorHandler(app)

  await app.register(healthRoutes)

  return app
}
