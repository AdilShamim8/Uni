import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import { createDatabase } from './client.js'
import { loadEnv } from '../config/env.js'

/**
 * Apply committed SQL migrations from backend/drizzle in order.
 * Used by `npm run db:migrate` (development and deployment); tests call
 * the exported function directly against a disposable database.
 */
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle', import.meta.url))

export async function runMigrations(connectionString: string): Promise<void> {
  const database = createDatabase(connectionString)
  try {
    await migrate(database.db, { migrationsFolder: MIGRATIONS_FOLDER })
  } finally {
    await database.pool.end()
  }
}

async function main(): Promise<void> {
  const env = loadEnv()
  if (!env.DATABASE_URL) {
    console.error('DATABASE_URL must be set to run migrations (see backend/.env.example).')
    process.exit(1)
  }
  await runMigrations(env.DATABASE_URL)
  console.log('Migrations applied.')
}

// Run only when executed directly (not imported by tests).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
