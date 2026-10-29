import { describe, expect, it } from 'vitest'
import { suggestedModelsFor } from '@/features/settings/suggestedModels'

describe('suggestedModelsFor', () => {
  it('matches OpenAI by endpoint hostname', () => {
    const models = suggestedModelsFor('openai-compatible', 'https://api.openai.com/v1')
    expect(models.length).toBeGreaterThan(0)
    expect(models.every((model) => model.id.length > 0 && model.label.length > 0)).toBe(true)
  })

  it('matches Anthropic by endpoint hostname with dashed ids', () => {
    const models = suggestedModelsFor('anthropic', 'https://api.anthropic.com')
    expect(models.some((model) => model.id.includes('claude'))).toBe(true)
    expect(models.some((model) => /-5-5|-4-5/.test(model.id))).toBe(true)
  })

  it('matches OpenRouter and surfaces free picks', () => {
    const models = suggestedModelsFor('openai-compatible', 'https://openrouter.ai/api/v1')
    expect(models.some((model) => model.id.endsWith(':free'))).toBe(true)
    expect(models.some((model) => model.id.includes('/'))).toBe(true)
  })

  it('matches local servers on loopback hosts', () => {
    expect(suggestedModelsFor('local', 'http://localhost:1234/v1').length).toBeGreaterThan(0)
    expect(suggestedModelsFor('local', 'http://127.0.0.1:11434/v1').length).toBeGreaterThan(0)
  })

  it('falls back to the provider kind when the host is unknown', () => {
    const viaKind = suggestedModelsFor('openai', 'https://not-a-known-host.example/v1')
    const viaHost = suggestedModelsFor('openai-compatible', 'https://api.openai.com/v1')
    expect(viaKind).toEqual(viaHost)
  })

  it('returns an empty list for unknown hosts on a generic kind', () => {
    expect(suggestedModelsFor('openai-compatible', 'https://my-private-gateway.example/v1')).toEqual(
      [],
    )
  })

  it('ignores an unparsable endpoint and uses the kind fallback', () => {
    expect(suggestedModelsFor('anthropic', 'not a url')).toEqual(
      suggestedModelsFor('anthropic', 'https://api.anthropic.com'),
    )
  })

  it('treats hostnames case-insensitively', () => {
    expect(suggestedModelsFor('openai-compatible', 'https://API.OPENAI.COM/v1')).toEqual(
      suggestedModelsFor('openai-compatible', 'https://api.openai.com/v1'),
    )
  })
})
