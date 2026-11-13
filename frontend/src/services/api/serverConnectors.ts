import { API_ROOT, ApiError, apiFetch } from './client'

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
  /** 'available' when this workspace holds a verified credential (T027). */
  status: 'unavailable' | 'available'
}

/** RF-092 — credential presence + verification state; never the token. */
export interface ServerConnectorCredential {
  connectorId: string
  status: 'untested' | 'verified' | 'invalid'
  lastCheckedAt: number | null
  lastError: string | null
}

/** RF-092 — the outcome of a connection test. */
export interface ServerConnectorTestResult {
  connectorId: string
  ok: boolean
  /** The account login the token belongs to (GitHub: /user). */
  login: string | null
  status: number
  error: string | null
}

export async function listServerConnectors(): Promise<ServerConnector[]> {
  const body = await apiFetch<{ items: ServerConnector[] }>(`${API_ROOT}/connectors`)
  return Array.isArray(body.items) ? body.items : []
}

export async function getServerConnector(connectorId: string): Promise<ServerConnector> {
  return apiFetch<ServerConnector>(`${API_ROOT}/connectors/${encodeURIComponent(connectorId)}`)
}

/** RF-092 — store (replace) the connector token; server seals it. */
export async function storeServerConnectorCredential(
  connectorId: string,
  token: string,
): Promise<ServerConnectorCredential> {
  return apiFetch<ServerConnectorCredential>(
    `${API_ROOT}/connectors/${encodeURIComponent(connectorId)}/credential`,
    { method: 'PUT', body: JSON.stringify({ token }) },
  )
}

/** RF-092 — the credential descriptor; null when none is stored. */
export async function getServerConnectorCredential(
  connectorId: string,
): Promise<ServerConnectorCredential | null> {
  try {
    return await apiFetch<ServerConnectorCredential>(
      `${API_ROOT}/connectors/${encodeURIComponent(connectorId)}/credential`,
    )
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** RF-092 — remove the stored credential. */
export async function deleteServerConnectorCredential(connectorId: string): Promise<void> {
  await apiFetch<void>(
    `${API_ROOT}/connectors/${encodeURIComponent(connectorId)}/credential`,
    { method: 'DELETE' },
  )
}

/** RF-092 — test a token now (and record the verdict for the stored one). */
export async function testServerConnector(
  connectorId: string,
  token?: string,
): Promise<ServerConnectorTestResult> {
  return apiFetch<ServerConnectorTestResult>(
    `${API_ROOT}/connectors/${encodeURIComponent(connectorId)}/test`,
    { method: 'POST', body: JSON.stringify(token ? { token } : {}) },
  )
}
