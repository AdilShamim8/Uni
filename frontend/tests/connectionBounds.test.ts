import { describe, expect, it, vi } from 'vitest'
import type { ProviderProfile } from '@/domain/types'
import {
  boundedText,
  MAX_DISCOVERY_BYTES,
  testProviderConnection,
} from '@/services/connection/providerConnection'

/**
 * Connection checks are bounded and cancellable (U016): a hanging
 * connect can be stopped, every outbound request runs under a deadline,
 * and oversized bodies are rejected before they can exhaust memory.
 */

const localProfile: ProviderProfile = {
  id: 'bounded-1',
  label: 'Bounded local',
  kind: 'openai-compatible',
  endpointUrl: 'http://127.0.0.1:11434/v1',
  demo: false,
  models: [],
}

describe('boundedText — oversized bodies are rejected, never fully read', () => {
  it('rejects a body that declares an oversized content-length without reading it', async () => {
    const response = new Response('{"data":[]}', {
      status: 200,
      headers: { 'content-length': String(MAX_DISCOVERY_BYTES + 1) },
    })
    await expect(boundedText(response, MAX_DISCOVERY_BYTES)).rejects.toThrow('response too large')
  })

  it('rejects a streamed body that exceeds the cap and cancels the stream', async () => {
    const huge = 'x'.repeat(MAX_DISCOVERY_BYTES + 100)
    const response = new Response(huge, { status: 200 })
    await expect(boundedText(response, MAX_DISCOVERY_BYTES)).rejects.toThrow('response too large')
  })

  it('reads normal bodies through', async () => {
    const response = new Response('{"ok":true}', { status: 200 })
    await expect(boundedText(response, MAX_DISCOVERY_BYTES)).resolves.toBe('{"ok":true}')
  })
})

describe('testProviderConnection — deadline and cancellation (U016)', () => {
  it('an aborted signal stops a hanging check with the honest cancelled message', async () => {
    const controller = new AbortController()
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            )
          }),
      ),
    )
    const pending = testProviderConnection(localProfile, '', controller.signal)
    controller.abort()
    const result = await pending
    expect(result.ok).toBe(false)
    expect(result.message).toBe('Connection test cancelled.')
    vi.unstubAllGlobals()
  })

  it('a deadline aborts a hanging endpoint instead of waiting forever', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            )
          }),
      ),
    )
    const result = await testProviderConnection(localProfile, '', undefined, { timeoutMs: 60 })
    expect(result.ok).toBe(false)
    expect(result.message).toBe('The provider endpoint timed out.')
    vi.unstubAllGlobals()
  })

  it('an oversized catalog fails honestly instead of succeeding partially', async () => {
    const huge = JSON.stringify({ data: [{ id: 'm' + 'x'.repeat(500) }].concat() }) + 'x'.repeat(MAX_DISCOVERY_BYTES)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(huge, { status: 200 })),
    )
    const result = await testProviderConnection(localProfile, '')
    expect(result.ok).toBe(false)
    expect(result.message).toContain('too large')
    vi.unstubAllGlobals()
  })
})
