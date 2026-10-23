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

  const db = drizzle(pool, { schema })
  app.decorate('database', { pool, db })

  app.addHook('onClose', async () => {
    await pool.end()
  })
}

/** Test helper: build an isolated Database for an explicit connection string. */
export function createDatabase(connectionString: string): Database {
  const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 5_000 })
  return { pool, db: drizzle(pool, { schema }) }
}
