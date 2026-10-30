/**
 * Service-worker registration for the Uni PWA.
 *
 * Registers only in production builds (`import.meta.env.PROD`) and only
 * in secure contexts — Vite's dev server reloads often enough that a
 * worker adds nothing there, and jsdom test environments have no
 * `serviceWorker` at all. Failures are logged and otherwise ignored:
 * the app is fully functional without a worker; the worker only adds
 * installability and offline shell opening.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  if (!window.isSecureContext) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('[uni] service worker registration failed:', error)
    })
  })
}
