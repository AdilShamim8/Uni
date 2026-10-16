/**
 * ReWoo setup diagnostics — classifies infrastructure misconfiguration so the
 * product can guide its operator instead of failing with opaque 500s.
 *
 * The classic failure this fixes: a fresh Vercel deploy with no DATABASE_URL
 * generates the SQLite Prisma client; SQLite cannot run on the read-only
 * serverless filesystem, so every query fails — and the workspace used to
 * return generic "Try again" errors with no hint of what to do.
 *
 * Classified issues:
 *   - not-configured  : DATABASE_URL is missing entirely
 *   - serverless-sqlite: SQLite URL on a read-only host (Vercel, Lambda…)
 *   - unreachable     : endpoint not reachable / wrong credentials
 *   - schema-missing  : database reachable but tables were never created
 *
 * Deliberately pure (no framework imports) so it is trivially unit-testable.
 * Routes turn these into `503 { code: "setup_required" }` responses; the
 * health endpoint reports them; the client renders a setup screen.
 */

export type DbSetupIssue =
  | "not-configured"
  | "serverless-sqlite"
  | "unreachable"
  | "schema-missing";

export const SETUP_REQUIRED_CODE = "setup_required";

function prismaErrorCode(err: unknown): string | null {
  if (typeof err === "object" && err !== null && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string" && /^P\d{4}$/.test(code)) return code;
  }
  return null;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err ?? "");
}

/**
 * Classify a database error. Returns null when the error is NOT an
 * infrastructure problem (e.g. a unique-constraint violation) so callers can
 * keep their normal handling for genuine application failures.
 */
export function classifyDbError(err: unknown): DbSetupIssue | null {
  const code = prismaErrorCode(err);
  const msg = message(err);

  // No DATABASE_URL at all (Prisma env validation).
  if (/Environment variable not found:\s*`?DATABASE_URL`?/i.test(msg)) {
    return "not-configured";
  }
  // DATABASE_URL disagrees with the client generated at build time (e.g. a
  // Postgres URL handed to the SQLite client) — env changed after install.
  if (/the URL must start with|must be a valid URL/i.test(msg)) {
    return "not-configured";
  }
  // Schema was never pushed (Prisma P2021 table missing / P2022 column
  // missing; raw SQLite phrasing is "no such table").
  if (
    code === "P2021" ||
    code === "P2022" ||
    /does not exist in the current database|no such table/i.test(msg)
  ) {
    return "schema-missing";
  }
  // Connection-level Prisma errors (P1001 can't reach, P1002 timeout,
  // P1003 database does not exist, P1004–P1017 socket/auth/TLS family).
  if (code && /^P10(0[1-9]|1[0-7])$/.test(code)) return "unreachable";
  // SQLite on a read-only filesystem (the typical serverless failure).
  if (/unable to open (the )?database file|attempt to write a readonly database|disk I\/O error/i.test(msg)) {
    return "serverless-sqlite";
  }
  // Postgres connection failures surfaced as raw driver errors.
  if (
    /can't reach the database server|connection terminated|connection refused|ECONNREFUSED|ETIMEDOUT|password authentication failed/i.test(msg)
  ) {
    return "unreachable";
  }
  return null;
}

export const DB_ISSUE_MESSAGES: Record<DbSetupIssue, string> = {
  "not-configured":
    "DATABASE_URL is missing or inconsistent with the build. Set it to a PostgreSQL connection string (Neon, Supabase, Railway…) in your hosting platform's environment variables and redeploy.",
  "serverless-sqlite":
    "The database is set to SQLite, which cannot persist on serverless hosting (the filesystem is read-only). Create a PostgreSQL database and set DATABASE_URL to its connection string.",
  unreachable:
    "The database is unreachable. Check that DATABASE_URL points to a running PostgreSQL database and that its credentials are correct.",
  "schema-missing":
    "The database is reachable, but its tables have not been created yet. Push the schema once (the setup screen shows the command) and reload.",
};

export interface SetupErrorBody {
  error: string;
  code: typeof SETUP_REQUIRED_CODE;
  issue: DbSetupIssue;
}

/**
 * Build a `503 setup_required` response body if (and only if) `err` is an
 * infrastructure misconfiguration. Returns null for application errors.
 */
export function setupErrorBody(err: unknown): SetupErrorBody | null {
  const issue = classifyDbError(err);
  if (!issue) return null;
  return { error: DB_ISSUE_MESSAGES[issue], code: SETUP_REQUIRED_CODE, issue };
}
