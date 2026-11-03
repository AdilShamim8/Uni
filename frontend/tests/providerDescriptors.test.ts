import { describe, expect, it } from 'vitest'
import type { ProviderProfile } from '@/domain/types'
import {
  PROVIDER_DESCRIPTORS,
  getProviderDescriptor,
  normalizeProviderBase,
  providerDiscoveryUrl,
  providerAuthHeaders,
  protocolForKind,
} from '@/domain/providerDescriptors'
import { modelsListUrl } from '@/services/connection/providerConnection'
import { createLiveAdapter } from '@/services/live/liveChatAdapter'
import { vi } from 'vitest'

/**
 * Provider descriptor registry (U011): browser adapters consume one
 * explicit registry for protocol shape — base policy, discovery path,
 * auth style — instead of scattered kind checks. The registry mirrors
 * packages/contracts/src/providerDescriptors.ts and is locked to the
 * same behaviors; unknown OpenAI-shaped endpoints stay configurable
 * through the permissive openai-compatible descriptor.
 */

const profile = (kind: ProviderProfile['kind'], endpointUrl: string): ProviderProfile => ({
  id: `provider-${kind}`,
  label: 'Test',
  kind,
  endpointUrl,
  demo: false,
  models: [],
})

describe('provider descriptor registry (U011)', () => {
  it('describes both protocols explicitly', () => {
    expect(PROVIDER_DESCRIPTORS['openai-compatible']).toMatchObject({
      auth: 'authorization-bearer',
      basePolicy: 'as-configured',
      discoveryPath: '/models',
      allowsNoAuth: true,
    })
    expect(PROVIDER_DESCRIPTORS.anthropic).toMatchObject({
      auth: 'x-api-key',
      basePolicy: 'versioned-v1',
      discoveryPath: '/models',
      allowsNoAuth: false,
    })
    expect(() => getProviderDescriptor('openai-compatible' as const)).not.toThrow()
  })

  it('as-configured bases are used verbatim (unknown endpoints stay configurable)', () => {
    // A gateway nobody has heard of still works through the permissive
    // OpenAI-compatible descriptor — the registry describes the wire
    // protocol, not a vendor allowlist.
    expect(normalizeProviderBase('openai-compatible', 'https://gw.example/custom/prefix/')).toBe(
      'https://gw.example/custom/prefix',
    )
    expect(providerDiscoveryUrl('openai-compatible', 'https://gw.example/custom/prefix')).toBe(
      'https://gw.example/custom/prefix/models',
    )
  })

  it('versioned-v1 bases normalize root, /v1 and gateway prefixes without doubling', () => {
    expect(normalizeProviderBase('anthropic', 'https://api.anthropic.com')).toBe('https://api.anthropic.com/v1')
    expect(normalizeProviderBase('anthropic', 'https://api.anthropic.com/')).toBe('https://api.anthropic.com/v1')
    expect(normalizeProviderBase('anthropic', 'https://gw.example/anthropic')).toBe('https://gw.example/anthropic/v1')
    expect(normalizeProviderBase('anthropic', 'https://gw.example/anthropic/v1')).toBe('https://gw.example/anthropic/v1')
  })

  it('builds protocol-appropriate credential headers', () => {
    expect(providerAuthHeaders('openai-compatible', 'sk-1')).toEqual({ Authorization: 'Bearer sk-1' })
    expect(providerAuthHeaders('anthropic', 'sk-2')).toEqual({
      'x-api-key': 'sk-2',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    })
  })

  it('maps every user-facing provider kind to a wire protocol', () => {
    // Product kinds are labels; the registry owns the mapping. Every
    // non-Anthropic kind speaks the OpenAI-compatible wire protocol.
    expect(protocolForKind('openai')).toBe('openai-compatible')
    expect(protocolForKind('google')).toBe('openai-compatible')
    expect(protocolForKind('openai-compatible')).toBe('openai-compatible')
    expect(protocolForKind('local')).toBe('openai-compatible')
    expect(protocolForKind('anthropic')).toBe('anthropic')
  })
})

describe('browser adapters consume the registry (U011)', () => {
  it('discovery URLs come from the descriptor policy for both protocols', () => {
    expect(modelsListUrl(profile('openai-compatible', 'https://api.groq.example/openai/v1'))).toBe(
      'https://api.groq.example/openai/v1/models',
    )
    expect(modelsListUrl(profile('anthropic', 'https://gw.example/anthropic'))).toBe(
      'https://gw.example/anthropic/v1/models',
    )
  })

  it('discovery works for every product kind, not just protocol names', () => {
    // The kinds the preset list actually creates — openai, google, local —
    // must resolve through the mapping, not be passed as protocols.
    expect(modelsListUrl(profile('openai', 'https://api.openai.com/v1'))).toBe(
      'https://api.openai.com/v1/models',
    )
    expect(
      modelsListUrl(profile('google', 'https://generativelanguage.googleapis.com/v1beta/openai')),
    ).toBe('https://generativelanguage.googleapis.com/v1beta/openai/models')
    expect(modelsListUrl(profile('local', 'http://localhost:11434/v1'))).toBe(
      'http://localhost:11434/v1/models',
    )
  })

  it('generation routes through the same base policy as discovery', async () => {
    const anthropic = profile('anthropic', 'https://gw.example/anthropic')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('data: [DONE]\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const adapter = createLiveAdapter(anthropic, 'ant-key', 'claude-test')
    await adapter.stream(
      { prompt: 'hi', history: [], tools: [], attachments: [], nickname: '', traits: '' },
      { onStart: () => undefined, onDelta: () => undefined, onDone: () => undefined, onError: () => undefined },
      new AbortController().signal,
    )
    const [url] = fetchMock.mock.calls[0] as [string]
    expect(url).toBe('https://gw.example/anthropic/v1/messages')
    vi.unstubAllGlobals()
  })
})
