import { z } from 'zod'
import { config as loadDotenv } from 'dotenv'

/**
 * Schema-validated environment configuration. Real deployments inject
 * environment variables; local development may use an ignored `.env`
 * file. Committed defaults exist only for development convenience —
 * production requires an explicit DATABASE_URL.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  /** Bind host. Default binds locally only; containers set 0.0.0.0. */
  HOST: z.string().default('127.0.0.1'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** PostgreSQL connection string. Required in production. */
  DATABASE_URL: z.string().min(1).optional(),
  /** Comma-separated list of allowed browser origins (no wildcard with credentials). */
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://127.0.0.1:5173'),
})

export type Env = z.infer<typeof envSchema>

export class EnvValidationError extends Error {
  constructor(readonly issues: string) {
    super('Environment configuration is invalid.')
    this.name = 'EnvValidationError'
  }
}

export function loadEnv(source?: Record<string, string | undefined>): Env {
  // Local development convenience only; never in production.
  if (!source) {
    if (process.env.NODE_ENV !== 'production') {
      loadDotenv()
    }
    source = process.env as Record<string, string | undefined>
  }

  const parsed = envSchema.safeParse(source)
  if (!parsed.success) {
    throw new EnvValidationError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    )
  }

  if (parsed.data.NODE_ENV === 'production' && !parsed.data.DATABASE_URL) {
    throw new EnvValidationError('DATABASE_URL: required in production')
  }

  return parsed.data
}

export function parseCorsOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0 && origin !== '*')
}
