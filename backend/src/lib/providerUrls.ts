/**
 * Provider endpoint base normalization and URL/auth helpers, delegated
 * to the shared descriptor registry in @uni/contracts (U011) so
 * discovery, generation, and every future surface apply ONE policy per
 * protocol.
 */
export {
  normalizeProviderBase,
  providerDiscoveryUrl,
  providerAuthHeaders,
  providerRequiresCredential,
  type ProviderProtocol,
  type ProviderDescriptor,
} from '@uni/contracts'

import { normalizeProviderBase } from '@uni/contracts'

/** The Anthropic versioned-base policy (kept for existing call sites). */
export function anthropicApiBase(endpointUrl: string): string {
  return normalizeProviderBase('anthropic', endpointUrl)
}
