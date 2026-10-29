import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import { fromNodeHeaders } from 'better-auth/node'
import { parseTrustedProxies, resolveClientIp, SPOOFABLE_HEADERS, CLIENT_IP_HEADER } from './clientIp.js'

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
 * - The client IP is resolved server-side (socket peer, with forwarded
 *   chains honored only from operator-listed trusted proxies) and passed
 *   to Better Auth under a private header; client-supplied forwarded
 *   headers are stripped so per-IP rate limiting cannot be spoofed.
 */
export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  const auth = app.auth
  if (!auth) {
    throw new Error('app.auth is not decorated — buildAuth must run first')
  }
  const trustedProxies = parseTrustedProxies(app.env.AUTH_TRUSTED_PROXIES)

  app.route({
    method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    url: '/*',
    async handler(request, reply) {
      const url = new URL(request.url, app.env.APP_URL)
      const headers = fromNodeHeaders(request.headers)

      // Rate limiting identity: strip anything the client could have set,
      // then inject the server-resolved address Better Auth reads.
      for (const header of SPOOFABLE_HEADERS) {
        headers.delete(header)
      }
      const clientIp = resolveClientIp(
        request.socket.remoteAddress,
        typeof request.headers['x-forwarded-for'] === 'string'
          ? request.headers['x-forwarded-for']
          : Array.isArray(request.headers['x-forwarded-for'])
            ? request.headers['x-forwarded-for'].join(',')
            : undefined,
        trustedProxies,
      )
      if (clientIp) {
        headers.set(CLIENT_IP_HEADER, clientIp)
      }

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
