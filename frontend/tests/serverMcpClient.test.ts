import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  createServerMcpServer,
  deleteServerMcpServer,
  disconnectServerMcpServer,
  listServerMcpServers,
  listServerMcpTools,
  testServerMcpServer,
} from '@/services/api/serverMcp'

/** Server MCP client (T023): servers, connect tests, tools. */
function jsonResponse(status: number, body?: unknown): Response {
  if (status === 204) return new Response(null, { status })
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('serverMcp client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists configured servers', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [{ id: 'mcp_1' }] }))
    const servers = await listServerMcpServers()
    expect(servers).toHaveLength(1)
  })

  it('creates a server with optional bearer auth', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 'mcp_2', status: 'disconnected' }))
    await createServerMcpServer({
      name: 'Company tools',
      url: 'https://mcp.example.test',
      auth: { type: 'bearer', token: 'tok' },
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/mcp/servers')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      name: 'Company tools',
      url: 'https://mcp.example.test',
      auth: { type: 'bearer', token: 'tok' },
    })
  })

  it('tests a server by POST and returns the refreshed row', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'mcp_1', status: 'connected' }))
    const server = await testServerMcpServer('mcp_1')
    expect(server).toMatchObject({ status: 'connected' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/mcp/servers/mcp_1/test')
    expect(init.method).toBe('POST')
  })

  it('disconnects a server by POST', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'mcp_1', status: 'disconnected' }))
    const server = await disconnectServerMcpServer('mcp_1')
    expect(server).toMatchObject({ status: 'disconnected' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/mcp/servers/mcp_1/disconnect')
    expect(init.method).toBe('POST')
  })

  it('lists a server’s tools', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [{ name: 'list_prs' }] }))
    const tools = await listServerMcpTools('mcp_1')
    expect(tools).toHaveLength(1)
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/mcp/servers/mcp_1/tools')
  })

  it('deletes a server', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(204))
    await deleteServerMcpServer('mcp_1')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/mcp/servers/mcp_1')
    expect(init.method).toBe('DELETE')
  })
})
