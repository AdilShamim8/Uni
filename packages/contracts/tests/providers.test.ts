import { describe, expect, it } from 'vitest'
import {
  createProviderRequestSchema,
  providerCredentialViewSchema,
  providerDtoSchema,
  providerErrorKindSchema,
  providerReadinessSchema,
  providerTestResponseSchema,
  setCredentialRequestSchema,
  unknownReadiness,
} from '../src/index.js'

/**
 * Provider connections: credentials never leave the server, keyless is
 * only valid where the protocol allows it, readiness is per-axis.
 */
describe('provider DTO', () => {
  it('requires the explicit credential transport on the DTO', () => {
    const dto = {
      id: 'prov_1',
      label: 'Local runtime',
      kind: 'openai-compatible',
      authMode: 'none',
      endpointUrl: 'http://localhost:1234/v1',
      modelId: 'local-model',
      models: ['local-model'],
      credential: {
        present: false,
        keyId: null,
        status: 'untested',
        lastCheckedAt: null,
        lastError: null,
      },
      createdAt: 1,
      updatedAt: 1,
    }
    expect(providerDtoSchema.parse(dto)).toEqual(dto)
    expect(providerDtoSchema.safeParse({ ...dto, authMode: 'proxy' }).success).toBe(false)
  })

  it('the credential view is redacted metadata only', () => {
    const view = {
      present: true,
      keyId: 'key_2026',
      status: 'connected',
      lastCheckedAt: 1,
      lastError: null,
    }
    expect(providerCredentialViewSchema.parse(view)).toEqual(view)
    expect(Object.keys(providerCredentialViewSchema.shape)).not.toContain('apiKey')
  })
})

describe('provider create request', () => {
  it('keyless is allowed only for protocols whose descriptor permits it', () => {
    expect(
      createProviderRequestSchema.safeParse({
        label: 'Local runtime',
        kind: 'openai-compatible',
        authMode: 'none',
        endpointUrl: 'http://localhost:1234/v1',
      }).success,
    ).toBe(true)
    expect(
      createProviderRequestSchema.safeParse({
        label: 'Anthropic',
        kind: 'anthropic',
        authMode: 'none',
        endpointUrl: 'https://api.anthropic.com',
      }).success,
    ).toBe(false)
  })

  it('keyed transports are accepted for either protocol', () => {
    expect(
      createProviderRequestSchema.safeParse({
        label: 'Anthropic',
        kind: 'anthropic',
        authMode: 'native',
        endpointUrl: 'https://api.anthropic.com',
      }).success,
    ).toBe(true)
    expect(
      createProviderRequestSchema.safeParse({
        label: 'OpenRouter',
        kind: 'openai-compatible',
        authMode: 'bearer',
        endpointUrl: 'https://openrouter.ai/api/v1',
      }).success,
    ).toBe(true)
  })
})

describe('credential storage + readiness', () => {
  it('storing a credential requires a bounded non-empty key', () => {
    expect(setCredentialRequestSchema.safeParse({ apiKey: 'sk-live' }).success).toBe(true)
    expect(setCredentialRequestSchema.safeParse({ apiKey: '' }).success).toBe(false)
    expect(setCredentialRequestSchema.safeParse({ apiKey: 'k'.repeat(4097) }).success).toBe(false)
  })

  it('readiness axes are independent; the credential axis knows not-required', () => {
    const readiness = {
      reachability: 'ok',
      catalog: 'ok',
      credential: 'not-required',
      generation: 'unknown',
    }
    expect(providerReadinessSchema.parse(readiness)).toEqual(readiness)
    expect(providerReadinessSchema.safeParse({ ...readiness, credential: 'n/a' }).success).toBe(
      false,
    )
  })

  it('unknownReadiness proves nothing on any axis', () => {
    expect(unknownReadiness()).toEqual({
      reachability: 'unknown',
      catalog: 'unknown',
      credential: 'unknown',
      generation: 'unknown',
    })
  })
})

describe('provider test response', () => {
  it('success carries a null errorKind; failures carry the stable kind', () => {
    const ok = {
      ok: true,
      message: 'Connected.',
      latencyMs: 42,
      discoveredModels: ['m1'],
      readiness: unknownReadiness(),
      errorKind: null,
    }
    expect(providerTestResponseSchema.parse(ok)).toEqual(ok)
    const fail = {
      ok: false,
      message: 'The key was rejected.',
      latencyMs: null,
      discoveredModels: null,
      readiness: unknownReadiness(),
      errorKind: 'rejected-credential',
    }
    expect(providerTestResponseSchema.parse(fail)).toEqual(fail)
    expect(providerTestResponseSchema.safeParse({ ...fail, errorKind: 'mystery' }).success).toBe(
      false,
    )
  })

  it('the error-kind vocabulary stays exactly the ten stable classifications', () => {
    expect([...providerErrorKindSchema.options]).toEqual([
      'unreachable',
      'endpoint-not-allowed',
      'invalid-endpoint',
      'no-credential',
      'rejected-credential',
      'catalog-unavailable',
      'body-too-large',
      'openrouter-key-unknown',
      'cancelled',
      'superseded',
    ])
  })
})
