import { describe, expect, it } from 'vitest'
import {
  PROVIDER_DESCRIPTORS,
  allowsKeyless,
  defaultAuthModeFor,
  normalizeProviderBase,
  providerAuthHeaders,
  providerDiscoveryUrl,
} from '../src/index.js'

/**
 * The per-protocol policies both sides share: base normalization,
 * discovery paths, default transports, and keyless permission.
 */
describe('provider descriptors', () => {
  it('openai-compatible allows keyless; anthropic requires a key', () => {
    expect(PROVIDER_DESCRIPTORS['openai-compatible'].allowsNoAuth).toBe(true)
    expect(PROVIDER_DESCRIPTORS.anthropic.allowsNoAuth).toBe(false)
    expect(allowsKeyless('openai-compatible')).toBe(true)
    expect(allowsKeyless('anthropic')).toBe(false)
  })

  it('the default keyed transport follows the protocol auth style', () => {
    expect(defaultAuthModeFor('openai-compatible')).toBe('bearer')
    expect(defaultAuthModeFor('anthropic')).toBe('native')
  })
})

describe('endpoint normalization', () => {
  it('anthropic normalizes to the versioned v1 base exactly once', () => {
    expect(normalizeProviderBase('anthropic', 'https://api.anthropic.com')).toBe(
      'https://api.anthropic.com/v1',
    )
    expect(normalizeProviderBase('anthropic', 'https://api.anthropic.com/v1')).toBe(
      'https://api.anthropic.com/v1',
    )
  })

  it('openai-compatible strips trailing slashes but never invents a version', () => {
    expect(normalizeProviderBase('openai-compatible', 'http://localhost:1234/v1///')).toBe(
      'http://localhost:1234/v1',
    )
    expect(normalizeProviderBase('openai-compatible', 'https://openrouter.ai/api/v1')).toBe(
      'https://openrouter.ai/api/v1',
    )
  })

  it('discovery lands on the protocol path with the normalized base', () => {
    expect(providerDiscoveryUrl('anthropic', 'https://api.anthropic.com')).toBe(
      'https://api.anthropic.com/v1/models',
    )
    expect(providerDiscoveryUrl('openai-compatible', 'http://localhost:1234/v1/')).toBe(
      'http://localhost:1234/v1/models',
    )
  })
})

describe('auth headers', () => {
  it('the none transport sends no credential header at all', () => {
    const headers = providerAuthHeaders('openai-compatible', 'none', 'sk-anything')
    expect(headers).toEqual({ accept: 'application/json' })
    expect(Object.keys(headers)).not.toContain('authorization')
  })

  it('bearer sends the standard authorization header', () => {
    expect(providerAuthHeaders('openai-compatible', 'bearer', 'sk-live')).toEqual({
      authorization: 'Bearer sk-live',
      accept: 'application/json',
    })
  })

  it('anthropic native sends x-api-key plus the pinned protocol version', () => {
    expect(providerAuthHeaders('anthropic', 'native', 'sk-ant')).toEqual({
      'x-api-key': 'sk-ant',
      'anthropic-version': '2023-06-01',
      accept: 'application/json',
    })
  })
})
