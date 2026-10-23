import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Session, User } from 'better-auth/types'
import { unauthorized } from '../../lib/errors.js'
import { ensurePersonalWorkspace, type PersonalWorkspace } from './auth.service.js'

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by requireSessionScope — never trusted from the client. */
    authSession?: { session: Session; user: User }
    /** Server-derived workspace scope for this request. */
    workspace?: PersonalWorkspace
  }
}

/**
 * Authentication for the /api/v1 plugin scope: resolves the session from
 * the HttpOnly cookie via Better Auth, then derives the caller's
 * workspace from database membership. `userId`/`workspaceId` values from
 * the request body or query are never authoritative.
 */
export function registerSessionScope(app: FastifyInstance): void {
  const auth = app.auth
  if (!auth) {
    throw new Error('Session scope requires app.auth (database must be attached)')
  }

  app.addHook('preHandler', async (request: FastifyRequest, _reply: FastifyReply) => {
    const authSession = await auth.api.getSession({ headers: request.headers })
    if (!authSession) {
      throw unauthorized('Sign in to use the API.')
    }

    request.authSession = authSession
    request.workspace = await ensurePersonalWorkspace(app.database!.db, authSession.user.id)
  })
}
