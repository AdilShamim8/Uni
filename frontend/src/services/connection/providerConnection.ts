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
  /**
   * Verified per-model capability metadata captured from the discovery
   * response (U015) — e.g. OpenRouter's input modalities and supported
   * parameters. Only fields the provider actually reports are present.
   */
  modelMetadata?: Record<string, VerifiedModelMetadata>
}

/** True when the endpoint is OpenRouter (its /models list is public). */
function isOpenRouter(profile: ProviderProfile): boolean {
  try {
    return new URL(profile.endpointUrl).hostname.toLowerCase() === 'openrouter.ai'
  } catch {
    return false
  }
}

/** Hard cap on discovery response bodies (U016): oversized catalogs are rejected, never fully read. */
export const MAX_DISCOVERY_BYTES = 2_000_000
/** Error bodies are only read for a short human snippet. */
const MAX_ERROR_SNIPPET_BYTES = 16_000

/**
 * Read a response body with a hard byte cap (U016): the content-length
 * header is checked first, then the stream is read until the limit —
 * an oversized body aborts instead of exhausting memory.
 */
export async function boundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new Error('response too large')
  }
  if (!response.body) {
    const text = await response.text()
    if (text.length > maxBytes) throw new Error('response too large')
    return text
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let received = 0
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new Error('response too large')
    }
    text += decoder.decode(value, { stream: true })
  }
  return text
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
  providerRequiresCredential,
  type ProviderProtocol,
} from '@/domain/providerDescriptors'
import {
  extractVerifiedModelMetadata,
  type VerifiedModelMetadata,
} from '@/domain/modelCapabilities'
import {
  diagnoseHttpStatus,
  diagnoseTransportError,
  diagnosticMessage,
} from '@/domain/providerDiagnostics'

export { normalizeProviderBase, providerDiscoveryUrl, type ProviderProtocol }

/**
 * Map the domain's provider kinds (which include legacy labels like
 * 'openai'/'google'/'local') onto the two wire protocols the registry
 * describes: everything except Anthropic speaks OpenAI-compatible.
 */
function providerProtocol(kind: ProviderProfile['kind']): ProviderProtocol {
  return kind === 'anthropic' ? 'anthropic' : 'openai-compatible'
}

export function modelsListUrl(profile: ProviderProfile): string {
  return providerDiscoveryUrl(providerProtocol(profile.kind), profile.endpointUrl)
}

function buildHeaders(profile: ProviderProfile, apiKey: string): HeadersInit {
  return providerAuthHeaders(providerProtocol(profile.kind), apiKey)
}

function describeHttpError(status: number, bodyText: string): string {
  // Typed diagnostics (U019): every failure kind carries a concrete
  // retry step; message format keeps the historical prefixes.
  return diagnosticMessage(diagnoseHttpStatus(status, bodyText))
}

/**
 * Hard bound on catalog parsing: a hostile or gigantic endpoint cannot
 * exhaust browser memory. Ordering and display caps happen AFTER this,
 * in the caller, so classification (free-first partitioning) is never
 * applied to an already-truncated list.
 */
const MAX_PARSED_MODEL_IDS = 2000

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
 * Verify a MANUALLY entered model by actually generating with it (U017):
 * some valid inference endpoints expose no /models at all. A minimal
 * one-token request either proves endpoint+key+model work together or
 * reports an honest, distinct failure.
 */
async function verifyModelByGeneration(
  profile: ProviderProfile,
  apiKey: string,
  modelId: string,
  signal: AbortSignal,
  latencyMs: number,
): Promise<ConnectionTestResult> {
  const anthropic = profile.kind === 'anthropic'
  const base = profile.endpointUrl.replace(/\/+$/, '')
  const url = anthropic
    ? `${normalizeProviderBase('anthropic', profile.endpointUrl)}/messages`
    : /\/chat\/completions\/?$/.test(base)
      ? base
      : `${base}/chat/completions`
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...providerAuthHeaders(anthropic ? 'anthropic' : 'openai-compatible', apiKey),
      },
      body: JSON.stringify({ model: modelId, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] }),
      signal,
    })
    if (response.status === 401 || response.status === 403) {
      return { ok: false, latencyMs, message: describeHttpError(response.status, '') }
    }
    if (response.status === 404) {
      return {
        ok: false,
        latencyMs,
        message: `The endpoint does not know the model “${modelId}” — check the exact model id.`,
      }
    }
    if (!response.ok) {
      const bodyText = await boundedText(response, MAX_ERROR_SNIPPET_BYTES).catch(() => '')
      return { ok: false, latencyMs, message: describeHttpError(response.status, bodyText) }
    }
    return {
      ok: true,
      latencyMs,
      message: `Connected — “${modelId}” answered a test generation (manual setup; discovery is unavailable on this endpoint).`,
      models: [modelId],
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return { ok: false, message: 'Connection test cancelled.' }
    }
    return {
      ok: false,
      message: 'The endpoint could not be reached for a test generation — check the URL and CORS.',
    }
  }
}

export async function testProviderConnection(
  profile: ProviderProfile,
  apiKey: string,
  signal?: AbortSignal,
  options?: { timeoutMs?: number; manualModelId?: string },
): Promise<ConnectionTestResult> {
  const trimmedKey = apiKey.trim()
  // A genuinely no-auth connection (local runtimes like Ollama) sends
  // NO credential header — never a fake stored key. Only protocols
  // whose descriptor allows it may connect keylessly; OpenRouter is a
  // hosted service whose models list is public, so it always needs a
  // real key.
  if (!trimmedKey && (providerRequiresCredential(providerProtocol(profile.kind)) || isOpenRouter(profile))) {
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

  // Bounded and cancellable work (U016): every outbound request runs
  // under a deadline and can be stopped; oversized bodies are rejected
  // before they can exhaust memory.
  const deadline = new AbortController()
  let deadlineFired = false
  const timer = setTimeout(() => {
    deadlineFired = true
    deadline.abort(new Error('deadline'))
  }, options?.timeoutMs ?? 20_000)
  if (signal) {
    if (signal.aborted) deadline.abort(signal.reason)
    else signal.addEventListener('abort', () => deadline.abort(signal.reason), { once: true })
  }

  const started = performance.now()
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(profile, trimmedKey),
      signal: deadline.signal,
    })
    const latencyMs = Math.round(performance.now() - started)

    if (!response.ok) {
      // Manual model setup (U017): endpoints with no /models (404/501)
      // can still be verified by generating with the manually entered
      // model — without one, this is an honest failure, not a guess.
      const manualModelId = options?.manualModelId?.trim()
      if ((response.status === 404 || response.status === 501) && manualModelId) {
        return verifyModelByGeneration(profile, trimmedKey, manualModelId, deadline.signal, latencyMs)
      }
      const bodyText = await boundedText(response, MAX_ERROR_SNIPPET_BYTES).catch(() => '')
      if (response.status === 404 || response.status === 501) {
        return {
          ok: false,
          latencyMs,
          message:
            'This endpoint does not support model discovery (no /models). Enter a model id manually, then Test again to verify it with a test generation.',
        }
      }
      return { ok: false, message: describeHttpError(response.status, bodyText), latencyMs }
    }

    const bodyText = await boundedText(response, MAX_DISCOVERY_BYTES)

    // OpenRouter's model list is public: a successful /models fetch proves
    // reachability, not the key. Only a verified /key response may claim
    // "connected"; rejected and unknown are distinct honest failures.
    if (isOpenRouter(profile)) {
      const verified = await verifyOpenRouterKey(profile.endpointUrl, trimmedKey, deadline.signal)
      if (verified.state !== 'verified') {
        return { ok: false, message: verified.message, latencyMs }
      }
    }

    const models = isOpenRouter(profile)
      ? orderOpenRouterModels(parseModelIds(bodyText))
      : parseModelIds(bodyText)
          .slice()
          .sort((a, b) => a.localeCompare(b))
          .slice(0, 200)
    // Verified capability metadata captured from what the provider
    // actually reported (U015) — providers that say nothing leave
    // capabilities unknown, never guessed.
    const modelMetadata = extractVerifiedModelMetadata(bodyText)
    return {
      ok: true,
      message:
        models.length > 0
          ? `Connected in ${latencyMs}ms — ${models.length} model${models.length === 1 ? '' : 's'} available.`
          : `Connected in ${latencyMs}ms.`,
      latencyMs,
      models,
      ...(modelMetadata.size > 0 ? { modelMetadata: Object.fromEntries(modelMetadata) } : {}),
    }
  } catch (error) {
    if (error instanceof Error && error.message === 'response too large') {
      return {
        ok: false,
        message: `The provider's response was too large (over ${Math.round(MAX_DISCOVERY_BYTES / 1_000_000)} MB) — Uni stopped reading it. Use a smaller catalog or a different endpoint.`,
      }
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      return {
        ok: false,
        message: deadlineFired ? 'The provider endpoint timed out.' : 'Connection test cancelled.',
      }
    }
    if (error instanceof Error && error.message === 'deadline') {
      return { ok: false, message: 'The provider endpoint timed out.' }
    }
    // Typed transport diagnostics (U019): network vs CORS guidance with
    // a concrete retry step, never a credential echo.
    return { ok: false, message: diagnosticMessage(diagnoseTransportError(error)) }
  } finally {
    clearTimeout(timer)
  }
}
