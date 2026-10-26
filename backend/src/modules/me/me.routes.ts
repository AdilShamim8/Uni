import type { FastifyInstance } from 'fastify'
import type { MeResponse } from '@uni/contracts'

/** GET /api/v1/me — session-scoped identity + resolved workspace. */
export async function meRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Reply: MeResponse }>('/me', async (request) => {
    const { authSession, workspace } = request
    if (!authSession || !workspace) {
      // preHandler guarantees these for /api/v1; this is a typed guard.
      throw new Error('Session scope missing on /me')
    }
    return {
      user: {
        id: authSession.user.id,
        email: authSession.user.email,
        name: authSession.user.name,
        createdAt: authSession.user.createdAt instanceof Date
          ? authSession.user.createdAt.getTime()
          : Math.floor(new Date(authSession.user.createdAt).getTime()),
      },
      workspace,
    }
  })
}
