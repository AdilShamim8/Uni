import { describe, expect, it } from 'vitest'
import { PROVIDER_ERROR_LABELS, providerErrorLabel } from '@/features/settings/providerErrors'

/** The N012 glanceable labels shared by the server checks and BYOK path. */
describe('providerErrorLabel', () => {
  it('returns null for absent error kinds', () => {
    expect(providerErrorLabel(null)).toBeNull()
    expect(providerErrorLabel(undefined)).toBeNull()
  })

  it('labels every stable error kind', () => {
    expect(providerErrorLabel('unreachable')).toBe('Unreachable')
    expect(providerErrorLabel('endpoint-not-allowed')).toBe('Blocked endpoint')
    expect(providerErrorLabel('invalid-endpoint')).toBe('Bad endpoint URL')
    expect(providerErrorLabel('no-credential')).toBe('No key')
    expect(providerErrorLabel('rejected-credential')).toBe('Key rejected')
    expect(providerErrorLabel('catalog-unavailable')).toBe('No model list')
    expect(providerErrorLabel('body-too-large')).toBe('Response too large')
    expect(providerErrorLabel('openrouter-key-unknown')).toBe('Key unverified')
    expect(providerErrorLabel('cancelled')).toBe('Cancelled')
    expect(providerErrorLabel('superseded')).toBe('Discarded')
  })

  it('an unknown kind falls back to null instead of a wrong label', () => {
    expect(providerErrorLabel('mystery' as 'unreachable')).toBeNull()
  })

  it('the label table covers exactly the ten N012 kinds', () => {
    expect(Object.keys(PROVIDER_ERROR_LABELS)).toHaveLength(10)
  })
})
