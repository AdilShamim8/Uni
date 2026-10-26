import type { FastifyInstance } from 'fastify'
import type { Auth } from 'better-auth'
import type { Env } from '../config/env.js'
import type { Database } from '../db/client.js'

declare module 'fastify' {
  interface FastifyInstance {
    /** Validated environment configuration. */
    env: Env
    /** PostgreSQL pool + Drizzle; absent when DATABASE_URL is unset (dev-only). */
    database?: Database
    /** Better Auth instance; present when the database is attached. */
    auth?: Auth
  }
}
