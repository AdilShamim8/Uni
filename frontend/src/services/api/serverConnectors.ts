import { API_ROOT, apiFetch } from './client'

/**
 * Server connector catalog client (P08). Types mirror @uni/contracts
 * connectors DTOs — local mirrors, no package dependency, exactly like
 * the work/mcp/routines clients.
 */

export type ConnectorKind = 'platform' | 'messaging' | 'mcp'

export type ConnectorCategory =
  | 'messaging'
  | 'featured'
  | 'development'
  | 'productivity'
  | 'data'
  | 'infrastructure'
  | 'web'
  | 'payments'
  | 'support'

export interface ServerConnector {
  id: string
  name: string
  description: string
  kind: ConnectorKind
  category: ConnectorCategory
  docsUrl: string
  routes: string[]
  setup: string[]
  /** Always 'unavailable' in Uni today — never a fabricated connection. */
  status: 'unavailable'
}

export async function listServerConnectors(): Promise<ServerConnector[]> {
  const body = await apiFetch<{ items: ServerConnector[] }>(`${API_ROOT}/connectors`)
  return Array.isArray(body.items) ? body.items : []
}

export async function getServerConnector(connectorId: string): Promise<ServerConnector> {
  return apiFetch<ServerConnector>(`${API_ROOT}/connectors/${encodeURIComponent(connectorId)}`)
}
