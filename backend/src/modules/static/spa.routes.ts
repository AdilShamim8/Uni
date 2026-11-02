import fs from 'node:fs'
import path from 'node:path'
import fastifyStatic from '@fastify/static'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { ERROR_CODES } from '@uni/contracts'
import type { Env } from '../../config/env.js'

/**
 * Single-origin production serving (audit F02 / U010).
 *
 * The audited deployment served `/` but direct loads of `/chat`,
 * `/api/auth/get-session`, and `/health/ready` all 404'd: static
 * hosting had no SPA fallback and no backend behind the paths the
 * bundle called. This plugin gives the API process the other half:
 * when FRONTEND_DIST_DIR is configured it serves the built SPA with
 * deep-link fallback under ONE precedence contract —
 *
 * - registered API and health routes always win (static and param
 *   routes outrank the wildcard in the router)
 * - unknown /api/* and /health/* paths answer the JSON error envelope,
 *   NEVER an HTML fallback (an HTML 200 from a catch-all is not an
 *   acceptable API response)
 * - GET/HEAD to any other path serves the real file when one exists,
 *   and index.html for UI routes like /chat (SPA deep links + refresh)
 * - hashed /assets/* cache immutably; index.html revalidates
 */

/** Paths that must never receive the SPA fallback. */
function isReservedPath(pathname: string): boolean {
  return (
    pathname === '/api' ||
    pathname.startsWith('/api/') ||
    pathname === '/health' ||
    pathname.startsWith('/health/')
  )
}

function envelope(reply: FastifyReply, status: number, code: string, message: string): FastifyReply {
  return reply.status(status).send({
    code,
    message,
    requestId: reply.request.id,
  })
}

export async function spaRoutes(app: FastifyInstance): Promise<void> {
  const env = app.env as Env
  const configured = env.FRONTEND_DIST_DIR.trim()
  if (configured === '') return // API-only deployment: explicit opt-in

  const root = path.resolve(configured)
  if (!fs.existsSync(path.join(root, 'index.html'))) {
    app.log.warn(
      { root },
      'FRONTEND_DIST_DIR is set but no index.html was found; serving API only',
    )
    return
  }

  await app.register(fastifyStatic, {
    root,
    // Serving is handled explicitly by the wildcard route below so the
    // precedence contract lives in one place.
    serve: false,
    index: false,
    decorateReply: true,
    setHeaders(reply, assetPath) {
      // Vite hashes /assets/* filenames: they can cache forever.
      // Everything else (index.html, icons, manifest) revalidates so
      // deploys propagate immediately.
      if (assetPath.startsWith(`${root}${path.sep}assets${path.sep}`)) {
        reply.header('cache-control', 'public, max-age=31536000, immutable')
      } else {
        reply.header('cache-control', 'no-cache')
      }
    },
  })

  app.log.info({ root }, 'serving the built frontend with SPA fallback (single-origin mode)')

  app.route({
    method: ['GET', 'HEAD'],
    url: '/*',
    handler: async (request, reply) => {
      let pathname: string
      try {
        pathname = decodeURIComponent((request.raw.url ?? '/').split('?')[0] ?? '/')
      } catch {
        return envelope(reply, 400, ERROR_CODES.VALIDATION, 'The request path is not valid.')
      }

      // Reserved prefixes: JSON errors, never an HTML fallback.
      if (isReservedPath(pathname)) {
        return envelope(reply, 404, ERROR_CODES.NOT_FOUND, 'Resource not found.')
      }

      if (pathname.includes('..') || pathname.includes('\0')) {
        return envelope(reply, 400, ERROR_CODES.VALIDATION, 'The request path is not valid.')
      }

      // A real file (asset, icon, manifest) wins over the fallback.
      const relPath = pathname.replace(/^\/+/, '')
      const candidate = path.resolve(root, relPath)
      if (candidate.startsWith(`${root}${path.sep}`)) {
        try {
          const stat = await fs.promises.stat(candidate)
          if (stat.isFile()) {
            return reply.sendFile(relPath)
          }
        } catch {
          /* not a file — SPA fallback below */
        }
      }

      // SPA deep link (or /): index.html revalidates on every load.
      return reply.sendFile('index.html')
    },
  })
}
