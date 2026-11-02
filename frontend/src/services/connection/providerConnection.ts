import type { ProviderProfile } from '@/domain/types'

/**
 * Real provider connection testing and model discovery.
 *
 * Requests go directly from the user's browser to the endpoint the user
 * configured. Nothing is proxied through Uni and no credentials are
 * stored anywhere except this browser's localStorage (separate key).
 *
 * Wire protocols:
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
}

function usesAnthropicProtocol(kind: ProviderProfile['kind']): boolean {
  return kind === 'anthropic'
}

/** True when the endpoint is OpenRouter (its /models list is public). */
function isOpenRouter(profile: ProviderProfile): boolean {
  try {
    return new URL(profile.endpointUrl).hostname.toLowerCase() === 'openrouter.ai'
  } catch {
    return false
  }
}

export function modelsListUrl(profile: ProviderProfile): string {
  const base = profile.endpointUrl.replace(/\/+$/, '')
  if (usesAnthropicProtocol(profile.kind)) {
    return /\/v1$/.test(base) ? `${base}/models` : `${base}/v1/models`
  }
  return `${base}/models`
}

function buildHeaders(profile: ProviderProfile, apiKey: string): HeadersInit {
  if (usesAnthropicProtocol(profile.kind)) {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }
  }
  return { Authorization: `Bearer ${apiKey}` }
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

function parseModelIds(bodyText: string): string[] {
  try {
    const parsed: unknown = JSON.parse(bodyText)
    if (typeof parsed === 'object' && parsed !== null && Array.isArray((parsed as { data?: unknown }).data)) {
      const ids: string[] = []
      for (const entry of (parsed as { data: Array<Record<string, unknown>> }).data) {
        if (typeof entry?.id === 'string' && entry.id.length > 0) ids.push(entry.id)
      }
      return ids.sort((a, b) => a.localeCompare(b)).slice(0, 200)
    }
  } catch {
    /* not JSON — treat as opaque success without model list */
  }
  return []
}

/**
 * OpenRouter sorts its huge catalog with free models first, so the free
 * tier (the fastest path to a zero-cost setup) is visible at the top of
 * the discovered list instead of buried under hundreds of paid ids.
 */
function orderOpenRouterModels(ids: string[]): string[] {
  const free = ids.filter((id) => id.endsWith(':free')).sort((a, b) => a.localeCompare(b))
  const paid = ids.filter((id) => !id.endsWith(':free'))
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

export async function testProviderConnection(
  profile: ProviderProfile,
  apiKey: string,
  signal?: AbortSignal,
): Promise<ConnectionTestResult> {
  const trimmedKey = apiKey.trim()
  if (!trimmedKey) {
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

  const started = performance.now()
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(profile, trimmedKey),
      signal,
    })
    const latencyMs = Math.round(performance.now() - started)

    if (!response.ok) {
      const bodyText = await response.text().catch(() => '')
      return { ok: false, message: describeHttpError(response.status, bodyText), latencyMs }
    }

    const bodyText = await response.text().catch(() => '')

    // OpenRouter's model list is public: a successful /models fetch proves
    // reachability, not the key. Only a verified /key response may claim
    // "connected"; rejected and unknown are distinct honest failures.
    if (isOpenRouter(profile)) {
      const verified = await verifyOpenRouterKey(profile.endpointUrl, trimmedKey, signal)
      if (verified.state !== 'verified') {
        return { ok: false, message: verified.message, latencyMs }
      }
    }

    const models = isOpenRouter(profile)
      ? orderOpenRouterModels(parseModelIds(bodyText))
      : parseModelIds(bodyText)
    return {
      ok: true,
      message:
        models.length > 0
          ? `Connected in ${latencyMs}ms — ${models.length} model${models.length === 1 ? '' : 's'} available.`
          : `Connected in ${latencyMs}ms.`,
      latencyMs,
      models,
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, message: 'Connection test cancelled.' }
    }
    return {
      ok: false,
      message:
        'Could not reach the endpoint from this browser — check the URL, your network, and whether the provider allows direct browser (CORS) requests.',
    }
  }
}
