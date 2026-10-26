import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API_ROOT, ApiError, apiFetch, apiUrl, getApiBase } from '@/services/api/client'

/**
 * B01 frontend wiring: the API client must send credentialed JSON
 * requests, join base URLs safely, and turn every non-2xx response into
 * an ApiError carrying the contract error envelope shape.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('api client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  it('uses same-origin paths by default and joins custom bases without double slashes', () => {
    expect(getApiBase()).toBe('')
    expect(apiUrl('/health/live')).toBe('/health/live')

    vi.stubEnv('VITE_API_BASE_URL', 'https://api.uni.example/')
    expect(getApiBase()).toBe('https://api.uni.example')
    expect(apiUrl('/health/live')).toBe('https://api.uni.example/health/live')
    expect(apiUrl('health/live')).toBe('https://api.uni.example/health/live')
  })

  it('sends credentialed JSON requests and parses JSON responses', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { hello: 'uni' }))

    const result = await apiFetch<{ hello: string }>('/api/v1/ping', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
    })

    expect(result).toEqual({ hello: 'uni' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/ping')
    expect(init.credentials).toBe('include')
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json')
  })

  it('turns error-envelope responses into ApiError with code/message/requestId', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(404, {
        code: 'not_found',
        message: 'Resource not found.',
        requestId: 'req-42',
      }),
    )

    const error = await apiFetch(`${API_ROOT}/conversations/missing`).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    const apiError = error as ApiError
    expect(apiError.status).toBe(404)
    expect(apiError.envelope).toEqual({
      code: 'not_found',
      message: 'Resource not found.',
      requestId: 'req-42',
    })
    expect(apiError.message).toBe('Resource not found.')
  })

  it('falls back to a safe envelope when the error body is not JSON', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('gateway exploded', { status: 502, headers: { 'content-type': 'text/plain' } }),
    )

    const error = (await apiFetch('/api/v1/anything').catch((e: unknown) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(502)
    expect(error.envelope.code).toBe('unexpected_response')
    expect(error.envelope.requestId).toBe('unknown')
  })

  it('treats 204 No Content as undefined', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await expect(apiFetch('/api/v1/things/1', { method: 'DELETE' })).resolves.toBeUndefined()
  })
})
