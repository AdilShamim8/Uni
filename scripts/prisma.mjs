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
import { existsSync, mkdirSync, readFileSync } from "node:fs";
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

// Canonical zero-setup SQLite location — MUST match the runtime default in
// src/lib/db.ts (absolute path, so CLI and runtime always target the same file).
const DEFAULT_SQLITE_URL = `file:${join(ROOT, "prisma", "db", "rewoo.db")}`;

const url = resolveDatabaseUrl();
const usedDefault = url === "";
const effectiveUrl = usedDefault ? DEFAULT_SQLITE_URL : url;
const isPostgres = /^(postgres(ql)?|neon|prisma):\/\//i.test(effectiveUrl);
const schema = isPostgres ? "prisma/schema.prisma" : "prisma/schema.sqlite.prisma";

console.log(
  `[prisma] ${isPostgres ? "PostgreSQL" : "SQLite"} DATABASE_URL detected → ${schema}` +
    (usedDefault ? " (zero-setup default)" : "")
);

// Local SQLite robustness: Prisma creates the database file but not missing
// parent directories (e.g. the default `file:./db/rewoo.db` from .env).
const sqliteFile = effectiveUrl.match(/^file:(?!\/\/)(.+)$/i)?.[1];
if (!isPostgres && sqliteFile && !/^(\/|\\|[A-Za-z]:)/.test(sqliteFile)) {
  const dir = join(ROOT, "prisma", dirname(sqliteFile));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`[prisma] created SQLite directory: prisma/${dirname(sqliteFile)}/`);
  }
}
if (!isPostgres && sqliteFile && /^([A-Za-z]:|\/)/.test(sqliteFile)) {
  const dir = dirname(sqliteFile);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    console.log(`[prisma] created SQLite directory: ${dir}`);
  }
}

const bin = join(ROOT, "node_modules", ".bin", process.platform === "win32" ? "prisma.cmd" : "prisma");

// ── Hosted-platform build guard ────────────────────────────────────────────────
// Vercel sets VERCEL during builds. Catch the two classic misconfigurations
// early with actionable guidance, instead of deploying a workspace that fails
// on every request. (The app itself also detects these at runtime and shows
// a setup screen — see src/lib/setup.ts — this is the build-time early warn.)
if (process.env.VERCEL && command[0] === "generate") {
  const warnings = [];
  if (!isPostgres) {
    warnings.push(
      `DATABASE_URL is ${effectiveUrl ? "a SQLite file URL" : "not set"}. SQLite cannot run on Vercel's read-only ` +
        `filesystem — the app will deploy in "Setup required" mode. Create a PostgreSQL database ` +
        `(free tier: https://neon.tech) and set DATABASE_URL in Vercel → Settings → Environment Variables.`
    );
  } else {
    warnings.push(
      "PostgreSQL detected. If this is a fresh database, remember to push the schema once: " +
        'DATABASE_URL="postgresql://…" bun run db:push'
    );
  }
  if (!process.env.REWOO_MASTER_KEY && !process.env.YOU_MASTER_KEY) {
    warnings.push(
      "REWOO_MASTER_KEY is not set. Provider API keys cannot be encrypted persistently without it. " +
        "Generate one with: openssl rand -hex 32"
    );
  }
  for (const w of warnings) console.warn(`\n[rewoo] WARNING: ${w}\n`);
}

// ── Fresh-clone zero-setup ─────────────────────────────────────────────────────
// `bun install` on a fresh clone (no .env, no DATABASE_URL, not hosted/CI)
// provisions the local SQLite database automatically, so the app runs with
// `bun run dev` immediately. Existing databases are never touched — the
// auto-provisioning runs only when the target file does not exist yet.
if (
  command[0] === "generate" &&
  usedDefault &&
  !process.env.VERCEL &&
  !process.env.CI &&
  !existsSync(sqliteFile)
) {
  console.log("[prisma] fresh local setup detected — creating the SQLite database and schema…");
  const push = spawnSync(
    bin,
    ["db", "push", "--schema", join(ROOT, "prisma", "schema.sqlite.prisma"), "--skip-generate"],
    { cwd: ROOT, stdio: "inherit", env: { ...process.env, DATABASE_URL: DEFAULT_SQLITE_URL } }
  );
  if (push.status === 0) {
    console.log(`[prisma] zero-setup complete — local database ready at prisma/db/rewoo.db`);
  } else {
    // Non-fatal: the app will show its setup screen with the exact command.
    console.warn("[prisma] automatic schema push failed — run `bun run db:push` manually.");
  }
}

const result = spawnSync(bin, [...command, "--schema", schema], {
  cwd: ROOT,
  stdio: "inherit",
  env: usedDefault ? { ...process.env, DATABASE_URL: DEFAULT_SQLITE_URL } : process.env,
});

process.exit(result.status ?? 1);
