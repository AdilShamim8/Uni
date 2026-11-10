import { API_ROOT, apiFetch } from './client'

/**
 * Server MCP API client (T025). Mirrors @uni/contracts mcp DTOs —
 * auth material never appears (only authConfigured/authType).
 */

export type McpServerStatus = 'disconnected' | 'connected' | 'error'

export interface ServerMcpServer {
  id: string
  name: string
  url: string
  status: McpServerStatus
  authConfigured: boolean
  authType: 'none' | 'bearer' | null
  lastError: string | null
  serverInfo: { name: string | null; version: string | null } | null
  createdAt: number
  updatedAt: number
}

export interface ServerMcpTool {
  name: string
  description: string | null
  namespacedName: string
  readOnlyHint: boolean | null
}

export async function listServerMcpServers(): Promise<ServerMcpServer[]> {
  const body = await apiFetch<{ items: ServerMcpServer[] }>(`${API_ROOT}/mcp/servers`)
  return body.items
}

export async function createServerMcpServer(input: {
  name: string
  url: string
  auth?: { type: 'none' } | { type: 'bearer'; token: string }
}): Promise<ServerMcpServer> {
  return apiFetch<ServerMcpServer>(`${API_ROOT}/mcp/servers`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function deleteServerMcpServer(serverId: string): Promise<void> {
  await apiFetch(`${API_ROOT}/mcp/servers/${encodeURIComponent(serverId)}`, {
    method: 'DELETE',
  })
}

export async function testServerMcpServer(serverId: string): Promise<ServerMcpServer> {
  return apiFetch<ServerMcpServer>(`${API_ROOT}/mcp/servers/${encodeURIComponent(serverId)}/test`, {
    method: 'POST',
  })
}

export async function disconnectServerMcpServer(serverId: string): Promise<ServerMcpServer> {
  return apiFetch<ServerMcpServer>(
    `${API_ROOT}/mcp/servers/${encodeURIComponent(serverId)}/disconnect`,
    { method: 'POST' },
  )
}

export async function listServerMcpTools(serverId: string): Promise<ServerMcpTool[]> {
  const body = await apiFetch<{ items: ServerMcpTool[] }>(
    `${API_ROOT}/mcp/servers/${encodeURIComponent(serverId)}/tools`,
  )
  return body.items
}
