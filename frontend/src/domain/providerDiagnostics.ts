/**
 * Typed provider diagnostics (U019): every failure a provider
 * connection or generation can produce maps to a distinct, useful
 * state — auth, quota, invalid model, timeout, network/CORS, oversized
 * response, stale configuration, cancelled, or unknown — each with a
 * concrete retry step. Error text NEVER includes credentials: request
 * headers are never echoed, and body snippets are passed through
 * already-size-capped readers.
 */

export type ProviderDiagnosticKind =
  | 'auth'
  | 'quota'
  | 'invalid-model'
  | 'timeout'
  | 'network'
  | 'cors'
  | 'unreachable'
  | 'too-large'
  | 'stale-config'
  | 'cancelled'
  | 'unknown'

export interface ProviderDiagnostic {
  kind: ProviderDiagnosticKind
  /** Short human title, e.g. '401 Unauthorized — check the API key'. */
  title: string
  /** What happened, including a capped provider body snippet when useful. */
  detail: string
  /** The concrete next step to try. */
  retry: string
  /** Whether simply trying again can plausibly help. */
  retryable: boolean
}

/**
 * Credential-shaped text is stripped from provider snippets before it
 * can ever reach an error message: a hostile endpoint that echoes the
 * Authorization header back must not get the key re-displayed (U019).
 */
const CREDENTIAL_PATTERN = /(?:bearer|authorization|x-api-key|api[_-]?key)["'\s:=]+[A-Za-z0-9._~+/=-]{8,}/gi

export function redactSecrets(text: string): string {
  return text.replace(CREDENTIAL_PATTERN, '[redacted]')
}

function snippet(bodyText: string, cap = 180): string {
  return redactSecrets(
    bodyText
      .slice(0, cap)
      .replace(/\s+/g, ' ')
      .trim(),
  )
}

/** Diagnose an HTTP status from a provider endpoint. */
export function diagnoseHttpStatus(status: number, bodyText = ''): ProviderDiagnostic {
  const extra = snippet(bodyText) ? ` (${snippet(bodyText)})` : ''
  switch (status) {
    case 401:
    case 403:
      return {
        kind: 'auth',
        title: `${status} ${status === 401 ? 'Unauthorized' : 'Forbidden'} — check the API key${extra}`,
        detail: 'The provider rejected the credential for this request.',
        retry: 'Open the provider console, check the key is valid and has access to this model, then paste it again.',
        retryable: true,
      }
    case 404:
      return {
        kind: 'invalid-model',
        title: `404 Not found — check the base URL and the model id${extra}`,
        detail: 'The endpoint does not know this route or model.',
        retry: 'The base URL usually ends in /v1 and must not include /chat/completions; verify the exact model id too.',
        retryable: true,
      }
    case 408:
      return {
        kind: 'timeout',
        title: '408 Request timeout — the provider was too slow to answer.',
        detail: 'The provider accepted the request but did not finish in time.',
        retry: 'Try again, or switch to a smaller/faster model on this provider.',
        retryable: true,
      }
    case 429:
      return {
        kind: 'quota',
        title: `429 Rate limited — try again shortly${extra}`,
        detail: 'The free-tier or account limit for this provider is exhausted right now.',
        retry: 'Wait a minute and retry, lower the request rate, or use another provider/model.',
        retryable: true,
      }
    case 402:
      return {
        kind: 'quota',
        title: `402 Payment required — this model needs credits${extra}`,
        detail: 'The account has no credit for this model.',
        retry: 'Add credit on the provider console, or switch to a :free model on OpenRouter.',
        retryable: false,
      }
    default:
      if (status >= 500) {
        return {
          kind: 'unreachable',
          title: `${status} — the provider is having trouble right now${extra}`,
          detail: 'A server-side failure at the provider.',
          retry: 'Try again in a moment; if it persists, check the provider status page.',
          retryable: true,
        }
      }
      return {
        kind: 'unknown',
        title: `The provider endpoint answered ${status}${extra}`,
        detail: 'An unexpected response from the endpoint.',
        retry: 'Check the endpoint URL and model, then try again.',
        retryable: true,
      }
  }
}

/**
 * Diagnose a fetch/stream transport failure (no HTTP status): browsers
 * report CORS and network problems nearly identically, so the guidance
 * covers both honest possibilities instead of guessing one.
 */
export function diagnoseTransportError(error: unknown): ProviderDiagnostic {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return {
      kind: 'cancelled',
      title: 'Request cancelled.',
      detail: 'The request was stopped before the provider finished.',
      retry: 'Send the message again whenever you are ready.',
      retryable: true,
    }
  }
  return {
    kind: 'network',
    title: 'Could not reach the endpoint from this browser',
    detail:
      error instanceof Error && error.message
        ? `The request failed before a response arrived (${error.message}).`
        : 'The request failed before a response arrived.',
    retry:
      'Check the URL and your network. If both look right, the provider probably does not allow direct browser (CORS) requests — use its server-compatible endpoint or another provider.',
    retryable: true,
  }
}

export const STALE_CONFIGURATION_DIAGNOSTIC: ProviderDiagnostic = {
  kind: 'stale-config',
  title: 'The provider configuration changed while checking',
  detail: 'The result arrived after the endpoint or key was edited, so it speaks for the old setup.',
  retry: 'Run Test again against the new configuration.',
  retryable: true,
}

export const OVERSIZED_RESPONSE_DIAGNOSTIC: ProviderDiagnostic = {
  kind: 'too-large',
  title: 'The provider response was too large',
  detail: 'Uni stopped reading the response at its size cap.',
  retry: 'Use a provider with a smaller catalog, or enter the model id manually.',
  retryable: false,
}

/** Render a diagnostic as the honest user-facing message. */
export function diagnosticMessage(diagnostic: ProviderDiagnostic): string {
  return `${diagnostic.title} — ${diagnostic.retry}`
}
