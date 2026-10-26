import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { fromNodeHeaders } from 'better-auth/node'

/**
 * Bridge Better Auth into Fastify under /api/auth/*.
 *
 * Adapted from the official Better Auth Fastify integration example
 * (better-auth/better-auth, docs/content/docs/integrations/fastify.mdx,
 * commit 88f36c63cf70c4142cf6b03c28cbeca84c981775, MIT — recorded in
 * docs/opensource-reuse.md). Modifications for Uni:
 * - URL base comes from the operator-configured APP_URL env, never from
 *   the request Host header.
 * - Multi-value Set-Cookie headers are forwarded via getSetCookie().
 * - Fastify's own JSON body parsing is kept (no raw-stream hijacking), so
 *   injection-based tests behave exactly like production traffic.
 */
export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const auth = app.auth
  if (!auth) {
    throw new Error('app.auth is not decorated — buildAuth must run first')
  }

  app.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/*',
    async handler(request, reply) {
      const url = new URL(request.url, app.env.APP_URL)
      const headers = fromNodeHeaders(request.headers)
      const hasBody = request.body !== undefined && request.body !== null

      const authRequest = new Request(url.toString(), {
        method: request.method,
        headers,
        ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
      })

      const response = await auth.handler(authRequest)

      reply.status(response.status)
      const setCookies =
        typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') return
        reply.header(key, value)
      })
      if (setCookies.length > 0) {
        reply.header('set-cookie', setCookies)
      }

      const text = await response.text()
      return reply.send(text === '' ? null : text)
    },
  })
}
