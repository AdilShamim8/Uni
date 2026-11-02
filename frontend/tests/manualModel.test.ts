import { describe, expect, it, vi } from 'vitest'
import type { ProviderProfile } from '@/domain/types'
import { testProviderConnection } from '@/services/connection/providerConnection'

/**
 * Manual model setup when discovery is unsupported (U017), browser
 * side: /models 404 + a manually entered model id is verified by a
 * one-token generation; without a model id the failure explains the
 * manual path instead of guessing.
 */

const profile: ProviderProfile = {
  id: 'manual-1',
  label: 'No discovery',
  kind: 'openai-compatible',
  endpointUrl: 'http://127.0.0.1:9999/v1',
  demo: false,
  models: [],
}

function fetchRouting(modelsStatus: number, generationStatus: number, generationBody = '{}') {
  return vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : String(input)
    if (url.endsWith('/models')) {
      return new Response('{"error":"no such route"}', { status: modelsStatus })
    }
    if (url.endsWith('/chat/completions')) {
      void init
      return new Response(generationBody, { status: generationStatus })
    }
    return new Response('not found', { status: 404 })
  })
}

describe('manual model verification in the browser (U017)', () => {
  it('verifies a manual model by a test generation when /models is 404', async () => {
    const fetchMock = fetchRouting(404, 200)
    vi.stubGlobal('fetch', fetchMock)

    const result = await testProviderConnection(profile, 'sk-key', undefined, {
      manualModelId: 'my-model:latest',
    })
    expect(result.ok).toBe(true)
    expect(result.models).toEqual(['my-model:latest'])
    expect(result.message).toContain('manual setup')

    // The verification POST hit the generation route with the exact model.
    const generationCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/chat/completions'))
    expect(generationCall).toBeDefined()
    const init = generationCall?.[1] as RequestInit
    expect(String(init.body)).toContain('"model":"my-model:latest"')
    expect(String(init.body)).toContain('"max_tokens":1')
    vi.unstubAllGlobals()
  })

  it('without a manual model, the no-discovery endpoint explains the manual path', async () => {
    vi.stubGlobal('fetch', fetchRouting(404, 200))
    const result = await testProviderConnection(profile, 'sk-key')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('does not support model discovery')
    expect(result.message).toContain('model id manually')
    vi.unstubAllGlobals()
  })

  it('an unknown manual model is a distinct honest failure', async () => {
    vi.stubGlobal('fetch', fetchRouting(404, 404))
    const result = await testProviderConnection(profile, 'sk-key', undefined, {
      manualModelId: 'no-such-model',
    })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('does not know the model')
    expect(result.message).toContain('no-such-model')
    vi.unstubAllGlobals()
  })

  it('a rejected key during generation verification is reported as a key failure', async () => {
    vi.stubGlobal('fetch', fetchRouting(404, 401, '{"error":"bad key"}'))
    const result = await testProviderConnection(profile, 'sk-wrong', undefined, {
      manualModelId: 'my-model',
    })
    expect(result.ok).toBe(false)
    expect(result.message).toContain('401')
    vi.unstubAllGlobals()
  })
})
