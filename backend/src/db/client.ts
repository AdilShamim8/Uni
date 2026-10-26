import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import type { FastifyInstance } from 'fastify'
import * as schema from './schema.js'

export type Database = {
  pool: Pool
  db: NodePgDatabase<typeof schema>
}

/**
 * Attach a PostgreSQL pool + Drizzle instance when DATABASE_URL is
 * configured. The pool is closed on app shutdown. Without a URL the API
 * still starts (health/live works) and /health/ready honestly reports
 * the database as down — except in production, where startup fails fast.
 */
export async function attachDatabase(app: FastifyInstance): Promise<void> {
  const env = app.env
  if (!env.DATABASE_URL) {
    if (env.NODE_ENV === 'production') {
      throw new Error('DATABASE_URL is required in production')
    }
    app.log.warn('DATABASE_URL not set — starting without a database; /health/ready will report down')
    return
  }

  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })

  // Idle pooled clients surface errors on the pool when the server
  // restarts, the network drops, or a connection is terminated while it
  // is still closing during shutdown. Without a listener these become
  // uncaught exceptions that crash the process; with one, pg discards
  // the dead client and the pool replaces it on the next checkout.
  // In-flight queries report their own errors through their callers.
  pool.on('error', (error) => {
    app.log.warn({ err: error }, 'idle database client error — pooled connection was likely terminated by the server or network')
  })

  const db = drizzle(pool, { schema })
  app.decorate('database', { pool, db })

  app.addHook('onClose', async () => {
    await pool.end()
  })
}

/** Test helper: build an isolated Database for an explicit connection string. */
export function createDatabase(connectionString: string): Database {
  const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5_000 })
  // Same rationale as attachDatabase: a pool with no 'error' listener
  // turns an idle-client termination (e.g. the embedded server stopping
  // mid-close) into an uncaught exception that fails the test run.
  pool.on('error', () => {
    /* expected during teardown races */
  })
  return { pool, db: drizzle(pool, { schema }) }
}
