import type { ProviderProfile } from '@/domain/types'

/**
 * Real provider connection testing and model discovery.
 *
 * Requests go directly from the user's browser to the endpoint the user
 * configured. Nothing is proxied through Universe and no credentials are
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
    const models = parseModelIds(bodyText)
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
