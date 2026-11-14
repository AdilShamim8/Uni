import { describe, expect, it } from 'vitest'
import {
  allowsKeyless,
  anthropicApiBase,
  defaultAuthModeFor,
  normalizeProviderBase,
  providerDiscoveryUrl,
} from '../src/lib/providerUrls.js'

/**
 * providerUrls delegates the per-protocol policies to @uni/contracts
 * (U011) — these tests pin the delegation so a future refactor cannot
 * quietly fork the policy.
 */
describe('providerUrls', () => {
  it('anthropicApiBase applies the versioned-v1 policy exactly once', () => {
    expect(anthropicApiBase('https://api.anthropic.com')).toBe('https://api.anthropic.com/v1')
    expect(anthropicApiBase('https://api.anthropic.com/v1')).toBe('https://api.anthropic.com/v1')
  })

  it('re-exports the shared descriptor functions unchanged', () => {
    expect(normalizeProviderBase('openai-compatible', 'http://localhost:1234/v1/')).toBe(
      'http://localhost:1234/v1',
    )
    expect(providerDiscoveryUrl('anthropic', 'https://api.anthropic.com')).toBe(
      'https://api.anthropic.com/v1/models',
    )
    expect(allowsKeyless('anthropic')).toBe(false)
    expect(defaultAuthModeFor('anthropic')).toBe('native')
  })
})
