import type { ProviderProfile } from '@/domain/types'

/**
 * Real provider connection testing and model discovery.
 *
 * Requests go directly from the user's browser to the endpoint the user
 * configured. Nothing is proxied through Uni and no credentials are
 * stored anywhere except this browser's localStorage (separate key).
 *
 * Wire protocols (resolved through the shared descriptor registry,
 * including the kind→protocol mapping):
 * - OpenAI-compatible (OpenAI, Groq, OpenRouter, Together, LM Studio,
 *   Ollama's compat layer, Google's compat endpoint):
 *     GET {base}/models  with  Authorization: Bearer <key>
 * - Anthropic native:
 *     GET {base}/v1/models  with  x-api-key + anthropic-version +
 *     anthropic-dangerous-direct-browser-access (their documented header
 *     for direct browser calls).
 */

export interface ConnectionTestResult {
  ok: boolean
  /** Honest, human-readable outcome (surfaced verbatim in the UI). */
  message: string
  latencyMs?: number
  /** Model ids discovered from the endpoint, when the API provides them. */
  models?: string[]
  /**
   * Per-axis readiness breakdown (N007), mirroring the server model:
   * reachability / catalog / credential / generation are INDEPENDENT —
   * a reachable endpoint with a rejected key reports reachability ok
   * + credential fail, never one blended state.
   */
  readiness?: ProviderReadiness
}

export type ReadinessAxis = 'unknown' | 'ok' | 'fail'

export interface ProviderReadiness {
  reachability: ReadinessAxis
  catalog: ReadinessAxis
  credential: ReadinessAxis | 'not-required'
  generation: ReadinessAxis
}

/** All-unknown readiness — a cancelled check proved nothing (N007). */
export function unknownReadiness(): ProviderReadiness {
  return { reachability: 'unknown', catalog: 'unknown', credential: 'unknown', generation: 'unknown' }
}

/** True when the endpoint is OpenRouter (its /models list is public). */
function isOpenRouter(profile: ProviderProfile): boolean {
  try {
    return new URL(profile.endpointUrl).hostname.toLowerCase() === 'openrouter.ai'
  } catch {
    return false
  }
}

/**
 * Protocol shape comes from the shared provider descriptor registry
 * (U011, mirrored from @uni/contracts): base policy, discovery path,
 * and auth style all live in one place, consumed identically by
 * discovery here and generation in liveChatAdapter.
 */
import {
  normalizeProviderBase,
  providerDiscoveryUrl,
  providerAuthHeaders,
  protocolForKind,
  allowsKeyless,
  authModeForApiKey,
  type ProviderProtocol,
} from '@/domain/providerDescriptors'

export { normalizeProviderBase, providerDiscoveryUrl, type ProviderProtocol }

export function modelsListUrl(profile: ProviderProfile): string {
  return providerDiscoveryUrl(protocolForKind(profile.kind), profile.endpointUrl)
}

/**
 * Whether this profile's protocol can operate genuinely keyless
 * (N003): every kind except Anthropic speaks OpenAI-compatible, and
 * local runtimes (Ollama, LM Studio, vLLM) usually need no key.
 */
export function profileAllowsKeyless(profile: ProviderProfile): boolean {
  return allowsKeyless(protocolForKind(profile.kind))
}

function buildHeaders(profile: ProviderProfile, apiKey: string): HeadersInit {
  const protocol = protocolForKind(profile.kind)
  return providerAuthHeaders(protocol, authModeForApiKey(protocol, apiKey), apiKey)
}

function describeHttpError(status: number, bodyText: string): string {
  const bodySnippet = bodyText.slice(0, 180).replace(/\s+/g, ' ').trim()
  switch (status) {
    case 401:
      return `401 Unauthorized — check the API key${bodySnippet ? ` (${bodySnippet})` : ''}`
    case 403:
      return `403 Forbidden — the key lacks access to this endpoint${bodySnippet ? ` (${bodySnippet})` : ''}`
    case 404:
      return `404 Not found — check the base URL (it usually ends in /v1, and should not include /chat/completions)`
    case 429:
      return `429 Rate limited — try again shortly${bodySnippet ? ` (${bodySnippet})` : ''}`
    default:
      return `HTTP ${status}${bodySnippet ? ` — ${bodySnippet}` : ''}`
  }
}

/**
 * Hard bound on catalog parsing: a hostile or gigantic endpoint cannot
 * exhaust browser memory. Ordering and display caps happen AFTER this,
 * in the caller, so classification (free-first partitioning) is never
 * applied to an already-truncated list.
 */
const MAX_PARSED_MODEL_IDS = 2000

/**
 * Hard bounds on provider response BODIES (N009): content-length is
 * checked before a single byte is read and the stream is cancelled the
 * moment it passes the cap — a hostile or looping endpoint can never
 * exhaust browser memory through an oversized catalog. A body over its
 * cap fails honestly with nothing adopted.
 */
const MAX_CATALOG_BODY_BYTES = 2 * 1024 * 1024
const MAX_ERROR_BODY_BYTES = 64 * 1024

async function readBodyBounded(response: Response, capBytes: number): Promise<{ ok: boolean; text: string }> {
  const declared = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > capBytes) {
    // Refused before reading a single byte; cancel the stream so the
    // connection is released instead of lingering.
    await response.body?.cancel().catch(() => {})
    return { ok: false, text: '' }
  }
  if (response.body) {
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let received = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      received += value.byteLength
      if (received > capBytes) {
        await reader.cancel().catch(() => {})
        return { ok: false, text: '' }
      }
      chunks.push(value)
    }
    const total = new Uint8Array(received)
    let offset = 0
    for (const chunk of chunks) {
      total.set(chunk, offset)
      offset += chunk.byteLength
    }
    return { ok: true, text: new TextDecoder().decode(total) }
  }
  const text = await response.text()
  if (text.length > capBytes) return { ok: false, text: '' }
  return { ok: true, text }
}

function parseModelIds(bodyText: string): string[] {
  try {
    const parsed: unknown = JSON.parse(bodyText)
    if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { data?: unknown }).data)) {
      const ids: string[] = []
      for (const entry of (parsed as { data: Array<Record<string, unknown>> }).data) {
        if (ids.length >= MAX_PARSED_MODEL_IDS) break
        if (typeof entry?.id === 'string' && entry.id.length > 0) ids.push(entry.id)
      }
      return ids
    }
  } catch {
    /* not JSON — treat as opaque success without model list */
  }
  return []
}

/**
 * OpenRouter sorts its huge catalog with free models first, so the free
 * tier (the fastest path to a zero-cost setup) is visible at the top of
 * the discovered list instead of buried under hundreds of paid ids. The
 * free/paid partition happens BEFORE the display cap — a free model
 * that sorts after the first 200 paid ids must stay discoverable.
 */
function orderOpenRouterModels(ids: string[]): string[] {
  const free = ids.filter((id) => id.endsWith(':free')).sort((a, b) => a.localeCompare(b))
  const paid = ids.filter((id) => !id.endsWith(':free')).sort((a, b) => a.localeCompare(b))
  return [...free, ...paid].slice(0, 200)
}

/**
 * Outcome of OpenRouter's auth-protected /key check. Its /models list
 * is public, so only /key can speak for the key. When /key cannot
 * answer conclusively (rate limit, 5xx, network failure, unexpected
 * body) the honest result is UNKNOWN — never "verified" (a public
 * catalog proves nothing about the key) and never a false "rejected".
 */
type OpenRouterKeyVerification =
  | { state: 'verified' }
  | { state: 'rejected'; message: string }
  | { state: 'unknown'; message: string }

async function verifyOpenRouterKey(
  base: string,
  apiKey: string,
  signal?: AbortSignal,
): Promise<OpenRouterKeyVerification> {
  try {
    const response = await fetch(`${base.replace(/\/+$/, '')}/key`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
      signal,
    })
    if (response.status === 401 || response.status === 403) {
      return {
        state: 'rejected',
        message:
          'OpenRouter answered, but the API key was rejected — check it at openrouter.ai/keys (the model list itself is public, so only /key proves the key).',
      }
    }
    if (!response.ok) {
      return {
        state: 'unknown',
        message: `OpenRouter’s key check is unavailable right now (HTTP ${response.status}) — the key could not be verified. The model list is public, so reachability alone proves nothing; try again in a moment.`,
      }
    }
    const body = await response.json().catch(() => null)
    if (body === null || typeof body !== 'object') {
      return {
        state: 'unknown',
        message:
          'OpenRouter’s key check returned an unexpected response — the key could not be verified. Try again.',
      }
    }
    return { state: 'verified' }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { state: 'unknown', message: 'Connection test cancelled.' }
    }
    return {
      state: 'unknown',
      message:
        'OpenRouter’s key check could not be reached from this browser — the key could not be verified. Check the network and try again.',
    }
  }
}

/**
 * Whether the catalog body carried a usable model list: a parseable
 * `data` array is a catalog (even an empty one); a 200 without it is
 * not (N007 — the catalog axis fails independently of reachability).
 */
function bodyHasCatalog(bodyText: string): { catalog: boolean; ids: string[] } {
  try {
    const parsed: unknown = JSON.parse(bodyText)
    if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { data?: unknown }).data)) {
      return { catalog: true, ids: parseModelIds(bodyText) }
    }
  } catch {
    /* not JSON — no catalog */
  }
  return { catalog: false, ids: [] }
}

export async function testProviderConnection(
  profile: ProviderProfile,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ConnectionTestResult> {
  const trimmedKey = apiKey.trim()
  const keyless = trimmedKey.length === 0
  if (keyless && !profileAllowsKeyless(profile)) {
    return { ok: false, message: 'Enter an API key first.' }
  }

  const url = modelsListUrl(profile)
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return { ok: false, message: 'The endpoint URL is not valid — include https:// (or http:// for local servers).' }
  }
  if (!/^https?:$/.test(parsedUrl.protocol)) {
    return { ok: false, message: 'The endpoint must use http(s).' }
  }

  const readiness = unknownReadiness()
  const started = performance.now()
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(profile, trimmedKey),
      signal,
    })
    const latencyMs = Math.round(performance.now() - started)

    // Any HTTP answer — including 401/403/404 — proves reachability (N007).
    readiness.reachability = 'ok'

    if (!response.ok) {
      readiness.catalog = 'fail'
      if (response.status === 401 || response.status === 403) {
        readiness.credential = 'fail'
      }
      // The error body is bounded too (N009): only a short snippet is
      // ever shown, so an oversized error body contributes nothing.
      const errorBody = await readBodyBounded(response, MAX_ERROR_BODY_BYTES)
      return {
        ok: false,
        message: describeHttpError(response.status, errorBody.ok ? errorBody.text : ''),
        latencyMs,
        readiness,
      }
    }

    // N009: the catalog body is hard-bounded — declared-oversize and
    // streaming-past-cap responses fail honestly with nothing adopted.
    const catalogBody = await readBodyBounded(response, MAX_CATALOG_BODY_BYTES)
    if (!catalogBody.ok) {
      readiness.catalog = 'fail'
      return {
        ok: false,
        message:
          'The model list response was too large (over 2 MB) — nothing was adopted from it. This can mean a misconfigured endpoint; nothing was saved.',
        latencyMs,
        readiness,
      }
    }
    const bodyText = catalogBody.text
    const { catalog, ids } = bodyHasCatalog(bodyText)
    readiness.catalog = catalog ? 'ok' : 'fail'

    // OpenRouter's model list is public: a successful /models fetch proves
    // reachability, not the key. Only a verified /key response may claim
    // "connected"; rejected and unknown are distinct honest failures. A
    // keyless connection claims no key at all, so there is nothing to
    // verify on /key.
    if (isOpenRouter(profile) && !keyless) {
      const verified = await verifyOpenRouterKey(profile.endpointUrl, trimmedKey, signal)
      if (verified.state !== 'verified') {
        readiness.credential = verified.state === 'rejected' ? 'fail' : 'unknown'
        return { ok: false, message: verified.message, latencyMs, readiness }
      }
      readiness.credential = 'ok'
    } else {
      // A 2xx catalog answer speaks for the key on plain providers; a
      // keyless connection has no key to verify at all (N007).
      readiness.credential = keyless ? 'not-required' : 'ok'
    }

    const models = isOpenRouter(profile)
      ? orderOpenRouterModels(ids)
      : ids
          .slice()
          .sort((a, b) => a.localeCompare(b))
          .slice(0, 200)
    return {
      ok: true,
      message: keyless
        ? models.length > 0
          ? `Connected in ${latencyMs}ms without a key — ${models.length} model${models.length === 1 ? '' : 's'} available.`
          : `Connected in ${latencyMs}ms without a key.`
        : models.length > 0
          ? `Connected in ${latencyMs}ms — ${models.length} model${models.length === 1 ? '' : 's'} available.`
          : `Connected in ${latencyMs}ms.`,
      latencyMs,
      models,
      readiness,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, message: 'Connection test cancelled.', readiness: unknownReadiness() }
    }
    // Network-level failure (offline, DNS, CORS): the endpoint was never
    // reached; every other axis stays honestly unknown (N007).
    readiness.reachability = 'fail'
    return {
      ok: false,
      message:
        'Could not reach the endpoint from this browser — check the URL, your network, and whether the provider allows direct browser (CORS) requests.',
      readiness,
    }
  }
}
