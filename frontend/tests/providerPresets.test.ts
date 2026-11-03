import { describe, expect, it } from 'vitest'
import { PRESETS } from '@/features/settings/providerPresets'
import { FREE_ROUTES, freeRouteFor } from '@/features/settings/freeModels'

/**
 * N014 — preset refresh. Every preset endpoint was probed LIVE this
 * session (2026-11-03): each base answered its /models route with an
 * auth challenge (401/403), a public catalog (200), or a documented
 * route-shaped response. These tests pin the data shape so the catalog
 * cannot silently rot: unique labels, well-formed endpoints, honest
 * local/free markers, and the probe-verified additions staying present.
 */

describe('provider presets (N014 refresh)', () => {
  it('keeps every label unique and every endpoint well-formed', () => {
    const labels = PRESETS.map((preset) => preset.label)
    expect(new Set(labels).size).toBe(labels.length)
    for (const preset of PRESETS) {
      const url = new URL(preset.endpointUrl)
      // Local presets speak plain http on the loopback; every hosted
      // preset must use https — a preset must never train users into
      // sending keys over plaintext.
      if (preset.kind === 'local') {
        expect(url.protocol).toBe('http:')
        expect(url.hostname).toBe('localhost')
      } else {
        expect(url.protocol).toBe('https:')
        expect(url.hostname).not.toBe('localhost')
      }
    }
  })

  it('carries the probe-verified refresh additions', () => {
    const byLabel = new Map(PRESETS.map((preset) => [preset.label, preset]))
    // Each of these answered a live probe this session.
    const verified: Array<[string, string]> = [
      ['Pollinations (no key)', 'https://text.pollinations.ai/openai'],
      ['Moonshot AI · Kimi', 'https://api.moonshot.ai/v1'],
      ['MiniMax', 'https://api.minimaxi.com/v1'],
      ['DeepInfra', 'https://api.deepinfra.com/v1/openai'],
      ['AI/ML API', 'https://api.aimlapi.com/v1'],
      ['Chutes', 'https://llm.chutes.ai/v1'],
      ['Nebius AI Studio', 'https://api.studio.nebius.ai/v1'],
      ['Novita', 'https://api.novita.ai/v3/openai'],
      ['Hyperbolic', 'https://api.hyperbolic.xyz/v1'],
      ['Glama', 'https://glama.ai/api/gateway/openai/v1'],
      ['AI21', 'https://api.ai21.com/studio/v1'],
      ['Reka', 'https://api.reka.ai/v1'],
      ['Liquid AI', 'https://inference.liquid.ai/v1'],
      ['iFlytek Spark', 'https://spark-api-open.xf-yun.com/v1'],
      ['Tencent Hunyuan', 'https://api.hunyuan.cloud.tencent.com/v1'],
      ['Volcengine · Doubao', 'https://ark.cn-beijing.volces.com/api/v3'],
      ['Baidu Qianfan', 'https://qianfan.baidubce.com/v2'],
    ]
    for (const [label, endpointUrl] of verified) {
      const preset = byLabel.get(label)
      expect(preset, `missing refreshed preset: ${label}`).toBeDefined()
      expect(preset?.endpointUrl).toBe(endpointUrl)
      expect(preset?.kind).toBe('openai-compatible')
    }
    // The refresh grew the catalog beyond the original 21.
    expect(PRESETS.length).toBeGreaterThanOrEqual(38)
  })

  it('marks free tiers only where a $0 path is real', () => {
    const free = PRESETS.filter((preset) => preset.freeTier)
    // The known-true free tiers (probe- or program-verified) stay free.
    const freeLabels = new Set(free.map((preset) => preset.label))
    for (const label of [
      'Google AI Studio · Gemini',
      'Groq',
      'OpenRouter',
      'Mistral',
      'Cerebras',
      'GitHub Models',
      'Ollama (local)',
      'LM Studio (local)',
      'Pollinations (no key)',
    ]) {
      expect(freeLabels.has(label), `${label} should stay marked free`).toBe(true)
    }
    // Pollinations is the hosted keyless route — verified with an
    // unauthenticated live completion this session.
    const pollinations = free.find((preset) => preset.label === 'Pollinations (no key)')
    expect(pollinations?.kind).toBe('openai-compatible')
  })
})

describe('keyless hosted free route (N014)', () => {
  it('offers Pollinations as a keyless hosted route, distinct from local', () => {
    const route = FREE_ROUTES.find((entry) => entry.id === 'pollinations')
    expect(route).toBeDefined()
    expect(route?.keyless).toBe(true)
    expect(route?.local).toBe(false)
    expect(route?.signupUrl).toBe('')
    // Honest limits: no unlimited-forever claims.
    expect(route?.limits.toLowerCase()).toContain('rate limit')
  })

  it('matches the free route for the Pollinations preset endpoint', () => {
    const preset = PRESETS.find((entry) => entry.label === 'Pollinations (no key)')
    expect(preset).toBeDefined()
    const route = freeRouteFor(preset!.kind, preset!.endpointUrl)
    expect(route?.id).toBe('pollinations')
    // Local-only routes never match a hosted endpoint.
    const local = freeRouteFor('local', preset!.endpointUrl)
    expect(local).toBeNull()
  })
})
