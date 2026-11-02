import { describe, expect, it } from 'vitest'
import type { ProviderProfile } from '@/domain/types'
import {
  PROVIDER_DESCRIPTORS,
  getProviderDescriptor,
  normalizeProviderBase,
  providerDiscoveryUrl,
  providerAuthHeaders,
} from '@/domain/providerDescriptors'
import { modelsListUrl, testProviderConnection } from '@/services/connection/providerConnection'
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

describe('genuinely no-auth connections (U012)', () => {
  it('a keyless local profile connects with no Authorization header at all', async () => {
    const local = profile('openai-compatible', 'http://127.0.0.1:11434/v1')
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'llama3' }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await testProviderConnection(local, '')
    expect(result.ok).toBe(true)
    expect(result.models).toEqual(['llama3'])
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:11434/v1/models')
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
    expect((init.headers as Record<string, string>).authorization).toBeUndefined()
    vi.unstubAllGlobals()
  })

  it('protocols that require a key fail honestly instead of sending a fake one', async () => {
    const anthropic = profile('anthropic', 'https://api.anthropic.com')
    const result = await testProviderConnection(anthropic, '')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('Enter an API key first.')

    const openRouter = profile('openai-compatible', 'https://openrouter.ai/api/v1')
    const openRouterResult = await testProviderConnection(openRouter, '')
    expect(openRouterResult.ok).toBe(false)
    expect(openRouterResult.message).toContain('Enter an API key first.')
  })

  it('keyless generation sends no credential header (no X-Title either)', async () => {
    const local = profile('openai-compatible', 'http://127.0.0.1:11434/v1')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const adapter = createLiveAdapter(local, '', 'llama3')
    let text = ''
    await adapter.stream(
      { prompt: 'hi', history: [], tools: [], attachments: [], nickname: '', traits: '' },
      {
        onStart: () => undefined,
        onDelta: (delta) => {
          text += delta
        },
        onDone: () => undefined,
        onError: () => undefined,
      },
      new AbortController().signal,
    )
    expect(text).toBe('Hi')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://127.0.0.1:11434/v1/chat/completions')
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
    expect(headers['X-Title']).toBeUndefined()
    vi.unstubAllGlobals()
  })
})
