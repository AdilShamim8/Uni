import { describe, expect, it, vi } from 'vitest'
import type { ProviderProfile } from '@/domain/types'
import {
  controlVerdict,
  extractVerifiedModelMetadata,
  resolveModelCapabilities,
  TEXT_ONLY_ADAPTER,
  type AdapterCapabilities,
} from '@/domain/modelCapabilities'
import { testProviderConnection } from '@/services/connection/providerConnection'

/**
 * Verified model capability metadata (U015): support comes from verified
 * provider metadata or documented families — never guessed. Capability
 * controls are enabled only when BOTH the adapter and the model support
 * the capability; anything unverified is labeled unknown.
 */

describe('resolveModelCapabilities — documented families vs unknown', () => {
  it('documented families resolve supported without verified metadata', () => {
    const claude = resolveModelCapabilities('claude-3-5-sonnet-20241022')
    expect(claude.imageInput).toBe('supported')
    expect(claude.toolUse).toBe('supported')
    expect(claude.reasoning).toBe('unknown')

    expect(resolveModelCapabilities('gpt-4o').imageInput).toBe('supported')
    expect(resolveModelCapabilities('deepseek-r1').reasoning).toBe('supported')
    expect(resolveModelCapabilities('gpt-3.5-turbo').toolUse).toBe('supported')
    expect(resolveModelCapabilities('qwen2.5-vl-72b-instruct').imageInput).toBe('supported')
  })

  it('models outside documented families are honestly unknown, never guessed', () => {
    const unknown = resolveModelCapabilities('mystery-fine-tune-7b')
    expect(unknown).toEqual({
      imageInput: 'unknown',
      audioInput: 'unknown',
      toolUse: 'unknown',
      reasoning: 'unknown',
    })
  })

  it('verified provider metadata overrides family knowledge in both directions', () => {
    // The provider REPORTS no image support for a model family that
    // usually has it — the verified answer wins.
    const reported = resolveModelCapabilities('claude-3-5-sonnet', { imageInput: false })
    expect(reported.imageInput).toBe('unsupported')

    // And reports support for a model nobody knows.
    const endorsed = resolveModelCapabilities('mystery-fine-tune-7b', { toolUse: true })
    expect(endorsed.toolUse).toBe('supported')

    // Absent fields stay on family/unknown resolution.
    const partial = resolveModelCapabilities('mystery-fine-tune-7b', { reasoning: false })
    expect(partial.reasoning).toBe('unsupported')
    expect(partial.imageInput).toBe('unknown')
  })
})

describe('extractVerifiedModelMetadata — discovery responses', () => {
  it('captures OpenRouter-style modalities and supported parameters', () => {
    const body = JSON.stringify({
      data: [
        {
          id: 'vendor/vision-model',
          architecture: { input_modalities: ['text', 'image'] },
          supported_parameters: ['tools', 'max_tokens'],
        },
        {
          id: 'vendor/text-model',
          architecture: { input_modalities: ['text'] },
          supported_parameters: ['max_tokens'],
        },
      ],
    })
    const metadata = extractVerifiedModelMetadata(body)
    expect(metadata.get('vendor/vision-model')).toEqual({
      imageInput: true,
      audioInput: false,
      toolUse: true,
      reasoning: false,
    })
    expect(metadata.get('vendor/text-model')).toEqual({
      imageInput: false,
      audioInput: false,
      toolUse: false,
      reasoning: false,
    })
  })

  it('entries without capability fields are simply absent', () => {
    const metadata = extractVerifiedModelMetadata(
      JSON.stringify({ data: [{ id: 'plain-model' }, { id: 'other-model', context_length: 8192 }] }),
    )
    expect(metadata.size).toBe(0)
  })

  it('non-JSON and malformed bodies yield no metadata', () => {
    expect(extractVerifiedModelMetadata('not json').size).toBe(0)
    expect(extractVerifiedModelMetadata('{"data": "nope"}').size).toBe(0)
  })
})

describe('controlVerdict — both adapter AND model must support (U015)', () => {
  const labels = { model: 'Test model', adapter: 'test adapter' }

  it('is enabled only when the adapter implements it and the model supports it', () => {
    const visionAdapter: AdapterCapabilities = { ...TEXT_ONLY_ADAPTER, imageInput: true }
    const verdict = controlVerdict(
      'imageInput',
      visionAdapter,
      resolveModelCapabilities('gpt-4o'),
      labels,
    )
    expect(verdict).toEqual({ enabled: true, state: 'supported', reason: '' })
  })

  it('model-unsupported beats everything else', () => {
    const verdict = controlVerdict(
      'imageInput',
      { ...TEXT_ONLY_ADAPTER, imageInput: true },
      { imageInput: 'unsupported', audioInput: 'unknown', toolUse: 'unknown', reasoning: 'unknown' },
      labels,
    )
    expect(verdict.enabled).toBe(false)
    expect(verdict.state).toBe('unsupported')
    expect(verdict.reason).toContain('does not support')
  })

  it('a capable model behind a text-only adapter stays disabled with the honest reason', () => {
    const verdict = controlVerdict(
      'imageInput',
      TEXT_ONLY_ADAPTER,
      resolveModelCapabilities('gpt-4o'),
      labels,
    )
    expect(verdict.enabled).toBe(false)
    expect(verdict.state).toBe('adapter-unsupported')
    expect(verdict.reason).toContain('does not send this capability yet')
  })

  it('unknown model support is labeled unknown and stays disabled', () => {
    const visionAdapter: AdapterCapabilities = { ...TEXT_ONLY_ADAPTER, imageInput: true }
    const verdict = controlVerdict(
      'imageInput',
      visionAdapter,
      resolveModelCapabilities('mystery-model'),
      labels,
    )
    expect(verdict.enabled).toBe(false)
    expect(verdict.state).toBe('unknown')
    expect(verdict.reason).toContain('unknown')
  })
})

describe('discovery propagates verified metadata (U015)', () => {
  it('a successful discovery returns per-model verified metadata', async () => {
    const profile: ProviderProfile = {
      id: 'gateway-1',
      label: 'OpenRouter-shaped gateway',
      kind: 'openai-compatible',
      endpointUrl: 'https://gateway.example/api/v1',
      demo: false,
      models: [],
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                id: 'vendor/vision-model',
                architecture: { input_modalities: ['text', 'image'] },
                supported_parameters: ['tools'],
              },
              { id: 'plain-model' },
            ],
          }),
          { status: 200 },
        ),
      ),
    )
    const result = await testProviderConnection(profile, 'sk-gateway-key')
    expect(result.ok).toBe(true)
    expect(result.modelMetadata).toEqual({
      'vendor/vision-model': { imageInput: true, audioInput: false, toolUse: true, reasoning: false },
    })
    // And the model ids are still discovered normally.
    expect(result.models).toEqual(['plain-model', 'vendor/vision-model'])
    vi.unstubAllGlobals()
  })
})
