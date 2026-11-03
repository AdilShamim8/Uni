import type { ProviderErrorKind } from '@/services/connection/providerConnection'
import type { ServerProviderErrorKind } from '@/services/api/serverProviders'

/**
 * Short, stable labels for the N012 error kinds — one vocabulary shared
 * by the server checks and the browser BYOK path, rendered as a small
 * tag next to the human message so a failure is glanceable before it is
 * readable.
 */

export const PROVIDER_ERROR_LABELS: Record<ProviderErrorKind, string> = {
  unreachable: 'Unreachable',
  'endpoint-not-allowed': 'Blocked endpoint',
  'invalid-endpoint': 'Bad endpoint URL',
  'no-credential': 'No key',
  'rejected-credential': 'Key rejected',
  'catalog-unavailable': 'No model list',
  'body-too-large': 'Response too large',
  'openrouter-key-unknown': 'Key unverified',
  cancelled: 'Cancelled',
  superseded: 'Discarded',
}

export function providerErrorLabel(
  errorKind: ProviderErrorKind | ServerProviderErrorKind | null | undefined,
): string | null {
  if (!errorKind) return null
  return PROVIDER_ERROR_LABELS[errorKind] ?? null
}
