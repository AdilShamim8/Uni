import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  storeServerConnectorCredential,
  getServerConnectorCredential,
  deleteServerConnectorCredential,
  testServerConnector,
} from '@/services/api/serverConnectors'

/**
 * RF-092 — the connector credential client: typed mirrors of the
 * T027 routes. The token goes in, descriptors come out — never the
 * token — and a missing credential reads as null, not an error.
 */

function jsonResponse(status: number, body?: unknown): Response {
  if (status === 204) return new Response(null, { status })
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('serverConnectors credential client (RF-092)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stores a token by PUT and returns the descriptor (never the token)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { connectorId: 'github', status: 'untested', lastCheckedAt: null, lastError: null }),
    )
    const descriptor = await storeServerConnectorCredential('github', 'ghp_mine')
    expect(descriptor).toMatchObject({ connectorId: 'github', status: 'untested' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/connectors/github/credential')
    expect(init.method).toBe('PUT')
    expect(JSON.parse(init.body as string)).toEqual({ token: 'ghp_mine' })
  })

  it('reads a stored credential as the descriptor', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { connectorId: 'github', status: 'verified', lastCheckedAt: 5, lastError: null }),
    )
    const descriptor = await getServerConnectorCredential('github')
    expect(descriptor).toMatchObject({ connectorId: 'github', status: 'verified' })
  })

  it('reads a missing credential as null (404 is not an error here)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { message: 'No credential stored.' }))
    const descriptor = await getServerConnectorCredential('github')
    expect(descriptor).toBeNull()
  })

  it('surfaces a real failure from a credential read', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { message: 'boom' }))
    await expect(getServerConnectorCredential('github')).rejects.toThrow()
  })

  it('tests a token now and reports the honest outcome', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { connectorId: 'github', ok: true, login: 'adilshamim', status: 200, error: null }),
    )
    const result = await testServerConnector('github', 'ghp_fresh')
    expect(result).toMatchObject({ ok: true, login: 'adilshamim' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/connectors/github/test')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ token: 'ghp_fresh' })
  })

  it('deletes a stored credential', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(204))
    await expect(deleteServerConnectorCredential('github')).resolves.toBeUndefined()
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/connectors/github/credential')
    expect(init.method).toBe('DELETE')
  })
})
