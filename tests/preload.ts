/**
 * Bun test preload — runs before any test module is loaded.
 *
 * 1. Points DATABASE_URL at a dedicated throwaway SQLite database
 *    (never the developer's real DB) and pushes the schema to it.
 * 2. Sets a fixed vault master key so crypto tests are deterministic and
 *    no key files are written during the test run.
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEST_DB_RELATIVE = "file:./db/rewoo-test.db"; // resolved by Prisma against prisma/
const TEST_DB_FILE = join(ROOT, "prisma", "db", "rewoo-test.db");

process.env.DATABASE_URL = TEST_DB_RELATIVE;
process.env.REWOO_MASTER_KEY = "a".repeat(64); // deterministic test key (hex)

// Fresh DB on every run: delete + re-push the schema.
try {
  if (existsSync(TEST_DB_FILE)) rmSync(TEST_DB_FILE);
} catch {
  // best-effort; prisma db push will handle existing files anyway
}

const bin = join(ROOT, "node_modules", ".bin", "prisma");
const result = spawnSync(
  bin,
  ["db", "push", "--schema", join(ROOT, "prisma", "schema.sqlite.prisma"), "--skip-generate"],
  { cwd: ROOT, stdio: "pipe", env: { ...process.env, DATABASE_URL: TEST_DB_RELATIVE } }
);

if (result.status !== 0) {
  console.error("[test-preload] prisma db push failed:", result.stderr?.toString() ?? "");
  process.exit(1);
}

// Prisma resolves relative SQLite URLs against the schema directory at
// generate time; the pushed file and the client's runtime target are the
// same (prisma/db/rewoo-test.db). Nothing further to wire up.
export {};
