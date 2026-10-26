import type { FastifyInstance } from 'fastify'
import type { HealthLive, HealthReady } from '@uni/contracts'
import { withTimeout } from '../../lib/timeout.js'

/**
 * Liveness answers "is the process up" without touching dependencies.
 * Readiness answers "can this instance serve traffic" by checking the
 * database with a bounded timeout — and reports dependency status
 * without exposing connection strings, hostnames, or versions.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: HealthLive }>('/health/live', async () => ({
    status: 'live' as const,
  }))

  app.get<{ Reply: HealthReady }>('/health/ready', async (_request, reply) => {
    const database = app.database
    if (!database) {
      return void reply.status(503).send({
        status: 'unavailable' as const,
        checks: { database: { status: 'down' as const } },
      })
    }

    try {
      await withTimeout(database.pool.query('SELECT 1'), 1500, 'database health check timeout')
      return { status: 'ready' as const, checks: { database: { status: 'up' as const } } }
    } catch (error) {
      app.log.warn({ err: error }, 'Readiness database check failed')
      return void reply.status(503).send({
        status: 'unavailable' as const,
        checks: { database: { status: 'down' as const } },
      })
    }
  })
}
