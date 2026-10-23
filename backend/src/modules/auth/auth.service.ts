import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import type { FastifyInstance } from 'fastify'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import { randomUUID } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import { account, session, user, verification, workspaceMembers, workspaces } from '../../db/schema.js'
import * as schema from '../../db/schema.js'
import { parseCorsOrigins } from '../../config/env.js'
import type { Env } from '../../config/env.js'

export type AppDatabase = NodePgDatabase<typeof schema>

/**
 * Better Auth integration (installed package — MIT; Fastify bridging via
 * the framework-integration pattern, adapted to this codebase).
 *
 * - email/password sign-in with HttpOnly session cookies
 *   (Secure in production; SameSite Lax by default — same-origin/proxied
 *   deployments)
 * - every new user gets one personal workspace (owner membership); a lazy
 *   resolver repairs users whose creation hook failed
 * - registration policy is explicit: `open` (development default) or
 *   `closed` (hosted deployments without configured email verification)
 * - no email service is configured in this milestone: email verification
 *   and password recovery are honestly unavailable
 */
export function buildAuth(app: FastifyInstance) {
  const env: Env = app.env
  const database = app.database
  if (!database) {
    throw new Error('Auth requires DATABASE_URL (attachDatabase must run first)')
  }

  const options: BetterAuthOptions = {
    baseURL: env.APP_URL,
    trustedOrigins: [env.APP_URL, ...parseCorsOrigins(env.CORS_ORIGINS)],
    database: drizzleAdapter(database.db, {
      provider: 'pg',
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      autoSignIn: true,
      disableSignUp: env.AUTH_REGISTRATION === 'closed',
    },
    advanced: {
      cookiePrefix: 'uni-auth',
      useSecureCookies: env.NODE_ENV === 'production',
      // Better Auth silently disables origin checks when it detects a test
      // environment; Uni runs its integration tests against the REAL
      // production behavior instead, so the CSRF/origin defense stays
      // covered. Development and production keep library defaults.
      ...(env.NODE_ENV === 'test' ? { disableOriginCheck: false } : {}),
    },
    rateLimit: {
      enabled: env.NODE_ENV !== 'test',
    },
    databaseHooks: {
      user: {
        create: {
          after: async (newUser) => {
            await ensurePersonalWorkspace(database.db, newUser.id)
          },
        },
      },
    },
  }

  return betterAuth(options)
}

export interface PersonalWorkspace {
  id: string
  name: string
  role: string
}

/**
 * Find the user's personal workspace, creating it lazily when missing
 * (covers users created before the hook existed or hook failures).
 */
export async function ensurePersonalWorkspace(
  db: AppDatabase,
  userId: string,
): Promise<PersonalWorkspace> {
  const existing = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      role: workspaceMembers.role,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(asc(workspaces.createdAt))
    .limit(1)

  const found = existing[0]
  if (found) {
    return { id: found.id, name: found.name, role: found.role }
  }

  const workspaceId = randomUUID()
  await db.transaction(async (tx) => {
    await tx.insert(workspaces).values({
      id: workspaceId,
      name: 'Personal workspace',
      ownerId: userId,
    })
    await tx.insert(workspaceMembers).values({
      workspaceId,
      userId,
      role: 'owner',
    })
  })

  return { id: workspaceId, name: 'Personal workspace', role: 'owner' }
}

/** Verify the user is a member of the workspace (defense for later multi-workspace gates). */
export async function isWorkspaceMember(
  db: AppDatabase,
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const rows = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1)
  return rows.length > 0
}
