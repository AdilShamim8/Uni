import { isIP } from 'node:net'
import { Agent } from 'undici'
import { resolveProviderEndpoint, type UrlGuardOptions } from './urlGuard.js'
import type { Env } from '../config/env.js'

/**
 * The single guarded outbound transport for provider traffic — used by
 * connection tests, model discovery, and AI SDK generation alike.
 *
 * DEPENDENCY NOTE (2026-11-13): undici is pinned to 7.x ON PURPOSE.
 * The guarded fetch passes an npm-undici `Agent` as the `dispatcher`
 * of Node's BUNDLED global fetch; undici 8's dispatch validates a new
 * handler protocol (`onRequestStart`/`onResponseError`) that Node's
 * bundled fetch does not implement, so every provider request dies
 * with "invalid onRequestStart method" (observed on main after an
 * unverified 8.12.4 bump). Unpinning requires routing fetch through
 * undici 8's own `fetch` (same-package dispatcher) and re-verifying
 * the whole provider suite — not a casual dependabot merge.
 *
 * Properties enforced on EVERY outbound request:
 * - SSRF validation first: the URL is parsed and its hostname resolved
 *   through `resolveProviderEndpoint` (private/loopback/link-local/
 *   metadata ranges rejected under hosted policy before any socket is
 *   opened).
 * - DNS pinning: the connection's `lookup` answers ONLY with the
 *   addresses that were validated. The OS resolver is never consulted
 *   again for that request, so a DNS record that changed between the
 *   check and the connection (or a second resolution landing on a
 *   different address) cannot re-route traffic to an unvalidated host.
 *   TLS hostname verification is untouched — certificates are still
 *   checked against the URL's hostname.
 * - Redirects are refused outright (`redirect: 'error'`): a 3xx must
 *   never silently move the request to a destination the guard did not
 *   validate.
 * - Deadlines ABORT the underlying request through an AbortController
 *   instead of racing a timer that leaves the socket running, and a
 *   caller-supplied signal (run cancellation) aborts it the same way.
 */

export function urlGuardOptions(env: Env): UrlGuardOptions {
  return {
    allowLocalEndpoints: env.ALLOW_LOCAL_MODEL_ENDPOINTS === 'true',
    allowlist: env.LOCAL_MODEL_ENDPOINT_ALLOWLIST.split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  }
}

/* ------------------------------------------------------------------ */
/* Pinned dispatchers                                                  */
/* ------------------------------------------------------------------ */

interface PinnedAddress {
  address: string
  family: 4 | 6
}

type LookupCallback = (
  err: Error | null,
  address?: string | PinnedAddress[],
  family?: number,
) => void

/**
 * undici `connect.lookup` replacement: answers every DNS question with
 * the pre-validated address set. `net.connect` calls this with
 * `options.all = true` when it wants the full candidate list
 * (autoSelectFamily) and with a single-address contract otherwise —
 * both callback shapes are honored.
 */
function pinnedLookup(addresses: PinnedAddress[]) {
  return (_hostname: string, options: { all?: boolean }, callback: LookupCallback): void => {
    if (options?.all) {
      callback(null, addresses)
      return
    }
    const first = addresses[0]
    if (!first) {
      callback(new Error('No validated address available for this endpoint.'))
      return
    }
    callback(null, first.address, first.family)
  }
}

/**
 * Dispatchers are pooled per validated address set (bounded): reusing
 * one per endpoint keeps connection pooling intact while guaranteeing
 * every connection on that dispatcher can only resolve to the
 * validated addresses.
 */
const MAX_PINNED_AGENTS = 64
const agentCache = new Map<string, Agent>()

function pinnedAgent(addresses: string[]): Agent {
  const key = addresses.join(',')
  const cached = agentCache.get(key)
  if (cached) return cached

  const entries: PinnedAddress[] = addresses.map((address) => ({
    address,
    family: isIP(address) === 6 ? 6 : 4,
  }))
  const agent = new Agent({
    connect: {
      lookup: pinnedLookup(entries) as never,
    },
  })
  agentCache.set(key, agent)

  if (agentCache.size > MAX_PINNED_AGENTS) {
    const oldestKey = agentCache.keys().next().value
    if (oldestKey !== undefined) {
      const evicted = agentCache.get(oldestKey)
      agentCache.delete(oldestKey)
      void evicted?.close().catch(() => undefined)
    }
  }
  return agent
}

/* ------------------------------------------------------------------ */
/* Guarded fetch                                                       */
/* ------------------------------------------------------------------ */

export type GuardedFetchInit = RequestInit & { duplex?: 'half' }
export type GuardedFetch = (input: string | URL | Request, init?: GuardedFetchInit) => Promise<Response>

export function createGuardedFetch(env: Env, timeoutMs = 10_000): GuardedFetch {
  const options = urlGuardOptions(env)
  return async (input, init = {}) => {
    const rawUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const resolved = await resolveProviderEndpoint(rawUrl, options)

    const controller = new AbortController()
    let timedOut = false
    const callerSignal = init.signal ?? null
    if (callerSignal) {
      if (callerSignal.aborted) {
        controller.abort(callerSignal.reason)
      } else {
        callerSignal.addEventListener(
          'abort',
          () => controller.abort((callerSignal as AbortSignal).reason),
          { once: true },
        )
      }
    }
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort(new Error('provider request timeout'))
    }, timeoutMs)
    if (typeof timer.unref === 'function') timer.unref()

    try {
      const request =
        input instanceof Request
          ? new Request(input, { ...init, redirect: 'error', signal: controller.signal })
          : new Request(resolved.url.toString(), {
              ...init,
              redirect: 'error',
              signal: controller.signal,
            })
      return (await fetch(request, {
        dispatcher: pinnedAgent(resolved.addresses),
      } as RequestInit)) as Response
    } catch (error) {
      if (timedOut) throw new Error('provider request timeout')
      throw error
    } finally {
      clearTimeout(timer)
    }
  }
}
