/**
 * Provider protocol descriptors — the explicit registry both the
 * browser and server adapters consume for protocol shape (auth style,
 * base-URL policy, discovery path). One source of truth so the two
 * sides can never drift on how a protocol is spoken (U011).
 *
 * `openai-compatible` is deliberately permissive: any unknown
 * OpenAI-shaped endpoint can be configured through it — the registry
 * describes the wire protocol, not a vendor allowlist. `anthropic` is
 * the native protocol with its versioned-base policy.
 */

export type ProviderProtocol = 'openai-compatible' | 'anthropic'

/**
 * How a configured endpoint base is normalized before paths are
 * appended:
 * - `as-configured`: the base is used verbatim (minus trailing
 *   slashes) — OpenAI-compatible servers conventionally expose
 *   `{base}/chat/completions` and `{base}/models` under whatever base
 *   (often `.../v1`) the user configured.
 * - `versioned-v1`: a versioned API base — trailing slashes are
 *   stripped, an explicit trailing `/v1` is kept, and anything else
 *   (bare host or custom gateway prefix) gets `/v1` appended. The AI
 *   SDK appends `/messages` to this base; discovery probes
 *   `{base}/models`.
 */
export type ProviderBasePolicy = 'as-configured' | 'versioned-v1'

export type ProviderAuthStyle = 'authorization-bearer' | 'x-api-key'

export interface ProviderDescriptor {
  protocol: ProviderProtocol
  /** Human-readable protocol label. */
  label: string
  /** Credential transport for API requests. */
  auth: ProviderAuthStyle
  /** Base normalization policy (see ProviderBasePolicy). */
  basePolicy: ProviderBasePolicy
  /** Path appended to the normalized base for model discovery. */
  discoveryPath: string
  /**
   * Whether a genuinely keyless connection is possible for this
   * protocol (local runtimes like Ollama). The registry only states
   * the protocol POSSIBILITY — hosted policy still decides whether a
   * keyless server may be contacted at all.
   */
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
      accept: 'application/json',
    }
  }
  return {
    authorization: `Bearer ${apiKey}`,
    accept: 'application/json',
  }
}
