/*
 * Uni service worker — a deliberately small, dependency-free app shell.
 *
 * Strategy (kept intentionally conservative — the app is fully local
 * first and must never serve stale chat data):
 *
 *   - navigations (HTML):        network-first, offline fallback to the
 *                                cached shell so the installed app opens
 *                                without a connection.
 *   - static assets (hashed):    stale-while-revalidate — Vite emits
 *                                content-hashed URLs, so a cached copy
 *                                is always safe to reuse.
 *   - everything else (API,
 *     provider traffic):         never cached. BYOK chat requests go
 *                                straight from the page to providers;
 *                                the worker must not sit in that path.
 *
 * Versioning: bump SHELL_VERSION to invalidate every cache on next
 * activation. Keep this file framework-free and small — it is the one
 * piece of the app that runs before everything else.
 */

const SHELL_VERSION = 'uni-shell-v1'
const SHELL_CACHE = `${SHELL_VERSION}:assets`

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        // Best-effort warm-up: the shell + icons. Failures are fine —
        // runtime caching fills the gaps.
        cache.addAll(['/', '/universe-mark.svg', '/manifest.webmanifest']).catch(() => undefined),
      )
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(SHELL_VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)

  // Never touch provider/API traffic or cross-origin calls — BYOK
  // requests belong to the page, not the worker.
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/health')) return

  // Navigations: network-first with an offline shell fallback.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy)).catch(() => undefined)
          return response
        })
        .catch(() => caches.match('/').then((cached) => cached ?? Response.error())),
    )
    return
  }

  // Same-origin static assets: stale-while-revalidate.
  event.respondWith(
    caches.match(request).then((cached) => {
      const refresh = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone()
            caches.open(SHELL_CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined)
          }
          return response
        })
        .catch(() => cached ?? Response.error())
      return cached ?? refresh
    }),
  )
})
