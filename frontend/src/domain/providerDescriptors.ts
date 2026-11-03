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

import type { ProviderKind } from './types'

export type ProviderProtocol = 'openai-compatible' | 'anthropic'

export type ProviderBasePolicy = 'as-configured' | 'versioned-v1'

export type ProviderAuthStyle = 'authorization-bearer' | 'x-api-key'

/**
 * The explicit credential transport a connection uses (N001, mirrored
 * from @uni/contracts):
 * - `none`: no credential header at all — genuinely keyless operation,
 *   only meaningful for protocols whose descriptor `allowsNoAuth`.
 * - `bearer`: `Authorization: Bearer <key>` regardless of protocol.
 * - `native`: the protocol's native credential header — `x-api-key` for
 *   Anthropic, the bearer header for OpenAI-compatible.
 */
export type ProviderAuthMode = 'none' | 'bearer' | 'native'

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

/** Map a user-facing provider kind to the wire protocol its endpoint
 * speaks. Kinds are product-level labels (presets, free-tier guides);
 * protocols are the two wire shapes the descriptors describe. Every
 * non-Anthropic kind — openai, google, openai-compatible, local —
 * speaks the OpenAI-compatible wire protocol (Authorization: Bearer,
 * {base}/models, {base}/chat/completions). The mapping lives with the
 * registry so no adapter ever guesses it again.
 */
export function protocolForKind(kind: ProviderKind): ProviderProtocol {
  return kind === 'anthropic' ? 'anthropic' : 'openai-compatible'
}

/** The default credential transport for a protocol when a key is used. */
export function defaultAuthModeFor(protocol: ProviderProtocol): ProviderAuthMode {
  return getProviderDescriptor(protocol).auth === 'x-api-key' ? 'native' : 'bearer'
}

/** Whether a protocol can operate genuinely keyless (e.g. local runtimes). */
export function allowsKeyless(protocol: ProviderProtocol): boolean {
  return getProviderDescriptor(protocol).allowsNoAuth
}

/**
 * The auth mode a browser BYOK connection effectively uses: a stored
 * key rides the protocol's native transport; an empty key is genuinely
 * keyless (N003) — never a dummy header.
 */
export function authModeForApiKey(protocol: ProviderProtocol, apiKey: string): ProviderAuthMode {
  return apiKey.trim() ? defaultAuthModeFor(protocol) : 'none'
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

/**
 * Credential headers for API requests under an explicit auth mode.
 * The Anthropic protocol additionally carries their documented header
 * for direct browser calls. `none` sends no credential header at all —
 * a keyless probe must not smuggle a dummy Authorization header.
 */
export function providerAuthHeaders(
  protocol: ProviderProtocol,
  authMode: ProviderAuthMode,
  apiKey: string,
): Record<string, string> {
  if (authMode === 'none') {
    return {}
  }
  if (authMode === 'bearer') {
    return { Authorization: `Bearer ${apiKey}` }
  }
  if (getProviderDescriptor(protocol).auth === 'x-api-key') {
    return {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }
  }
  return { Authorization: `Bearer ${apiKey}` }
}
