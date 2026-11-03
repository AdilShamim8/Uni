/**
 * Postgres error-code helpers shared by services that reason about
 * constraint races (N017/N018). Works through drizzle's error wrapping:
 * node-postgres errors carry `code` directly, while drizzle may rethrow
 * them as DrizzleQueryError with the original on `.cause`.
 */

/** Unique-constraint violation (Postgres SQLSTATE 23505). */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as { code?: unknown; cause?: unknown }
  if (candidate.code === '23505') return true
  const cause = candidate.cause as { code?: unknown } | undefined
  return typeof cause === 'object' && cause !== null && cause.code === '23505'
}
