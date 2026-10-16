#!/usr/bin/env node
/**
 * Prisma helper — runs a Prisma CLI command against the schema that matches
 * the active DATABASE_URL:
 *
 *   postgres://… postgresql://… neon://…  → prisma/schema.prisma        (PostgreSQL)
 *   file:… (or unset)                    → prisma/schema.sqlite.prisma (SQLite)
 *
 * Usage:
 *   node scripts/prisma.mjs <generate|db push|migrate dev|studio> [extra args…]
 *
 * This keeps local development zero-setup (SQLite) while Vercel and other
 * hosted deployments get the PostgreSQL client generated automatically
 * (via the `postinstall` hook) with no manual steps.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const command = process.argv.slice(2);
if (command.length === 0) {
  console.error("Usage: node scripts/prisma.mjs <prisma command> [extra args…]");
  process.exit(1);
}

/** DATABASE_URL from the environment, falling back to a local .env file. */
function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envPath = join(ROOT, ".env");
  try {
    if (existsSync(envPath)) {
      const match = readFileSync(envPath, "utf8").match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/m);
      if (match) return match[1].trim().replace(/^["']|["']$/g, "");
    }
  } catch {
    // ignore unreadable .env — let Prisma surface the real error
  }
  return "";
}

const url = resolveDatabaseUrl();
const isPostgres = /^(postgres(ql)?|neon|prisma):\/\//i.test(url);
const schema = isPostgres ? "prisma/schema.prisma" : "prisma/schema.sqlite.prisma";

console.log(
  `[prisma] ${isPostgres ? "PostgreSQL" : "SQLite"} DATABASE_URL detected → ${schema}`
);

const bin = join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma");
const result = spawnSync(bin, [...command, "--schema", schema], {
  cwd: ROOT,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
