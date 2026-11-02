/**
 * Provider protocol descriptors — the browser-side registry for
 * protocol shape (auth style, base-URL policy, discovery path).
 *
 * MIRRORED from `packages/contracts/src/providerDescriptors.ts` (U011):
 * the frontend build is intentionally self-contained for static
 * hosting, so it cannot import the contracts package yet. The shapes
 * and policies are kept identical on purpose; U022 replaces this file
 * with the shared contracts module when the build wires them together.
 *
 * `openai-compatible` is deliberately permissive: any unknown
 * OpenAI-shaped endpoint can be configured through it — the registry
 * describes the wire protocol, not a vendor allowlist.
 */

export type ProviderProtocol = 'openai-compatible' | 'anthropic'

export type ProviderBasePolicy = 'as-configured' | 'versioned-v1'

export type ProviderAuthStyle = 'authorization-bearer' | 'x-api-key'

export interface ProviderDescriptor {
  protocol: ProviderProtocol
  label: string
  auth: ProviderAuthStyle
  basePolicy: ProviderBasePolicy
  discoveryPath: string
  /** Protocol POSSIBILITY of a keyless connection (e.g. local Ollama). */
  allowsNoAuth: boolean
}

export const PROVIDER_DESCRIPTORS: Record<ProviderProtocol, ProviderDescriptor> = {
  'openai-compatible': {
    protocol: 'openai-compatible',
    label: 'OpenAI-compatible',
    auth: 'authorization-bearer',
    basePolicy: 'as-configured',
    discoveryPath: '/models',
    allowsNoAuth: true,
  },
  anthropic: {
    protocol: 'anthropic',
    label: 'Anthropic native',
    auth: 'x-api-key',
    basePolicy: 'versioned-v1',
    discoveryPath: '/models',
    allowsNoAuth: false,
  },
}

export function getProviderDescriptor(protocol: ProviderProtocol): ProviderDescriptor {
  const descriptor = PROVIDER_DESCRIPTORS[protocol]
  if (!descriptor) throw new Error(`Unknown provider protocol: ${protocol}`)
  return descriptor
}

/** Apply a protocol's base normalization policy to a configured endpoint. */
export function normalizeProviderBase(protocol: ProviderProtocol, endpointUrl: string): string {
  const base = endpointUrl.replace(/\/+$/, '')
  if (getProviderDescriptor(protocol).basePolicy === 'versioned-v1') {
    return /\/v1$/.test(base) ? base : `${base}/v1`
  }
  return base
}

/** Discovery (model listing) URL for a configured endpoint. */
export function providerDiscoveryUrl(protocol: ProviderProtocol, endpointUrl: string): string {
  return `${normalizeProviderBase(protocol, endpointUrl)}${getProviderDescriptor(protocol).discoveryPath}`
}

/** True when the protocol cannot work without a credential. */
export function providerRequiresCredential(protocol: ProviderProtocol): boolean {
  return !getProviderDescriptor(protocol).allowsNoAuth
}

/**
 * Credential headers for API requests under a protocol's auth style.
 * An EMPTY key is only valid for protocols that allow no-auth
 * connections (local runtimes like Ollama): those requests carry no
 * credential header at all — never a fake or placeholder key.
 */
export function providerAuthHeaders(protocol: ProviderProtocol, apiKey: string): Record<string, string> {
  const descriptor = getProviderDescriptor(protocol)
  if (apiKey === '' && descriptor.allowsNoAuth) {
    return descriptor.auth === 'x-api-key' ? { accept: 'application/json' } : {}
  }
  if (descriptor.auth === 'x-api-key') {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }
  }
  return { Authorization: `Bearer ${apiKey}` }
}
