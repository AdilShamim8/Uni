import { PrismaClient } from '@prisma/client'
import { join } from 'node:path'

// Local zero-setup: default to a SQLite database when DATABASE_URL is unset,
// so a fresh clone runs with `bun install` + `bun run dev` — no .env copy.
//
// The path is ABSOLUTE (resolved from the project root at process start) so
// the runtime client and `bun run db:push` (which defaults to the same file
// via scripts/prisma.mjs) always target the same database, regardless of how
// any tool resolves relative SQLite URLs.
//
// Hosted platforms (Vercel, …) that deploy without any DATABASE_URL fall
// through to this SQLite default too, which cannot run on their read-only
// filesystem. That failure is classified precisely and surfaces as the
// "Setup required" screen instead of opaque 500s — see src/lib/setup.ts.
const DEFAULT_SQLITE_PATH = join(process.cwd(), 'prisma', 'db', 'rewoo.db')
process.env.DATABASE_URL ||= `file:${DEFAULT_SQLITE_PATH}`

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
