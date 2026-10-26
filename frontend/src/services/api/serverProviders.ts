import { API_ROOT, apiFetch } from './client'

/**
 * Server-provider API calls (B03): providers saved on the server with
 * encrypted credentials — deliberately separate from the browser BYOK
 * providers in the local store. A server credential is write-only:
 * creation sends the key once and every later response is redacted
 * metadata.
 */

export type ServerProviderKind = 'openai-compatible' | 'anthropic'

export interface ServerProvider {
  id: string
  label: string
  kind: ServerProviderKind
  endpointUrl: string
  modelId: string | null
  models: string[]
  credential: {
    present: boolean
    keyId: string | null
    status: 'untested' | 'connected' | 'error'
    lastCheckedAt: number | null
    lastError: string | null
  }
  createdAt: number
  updatedAt: number
}

export async function listServerProviders(): Promise<ServerProvider[]> {
  // The backend returns a page-shaped { items } envelope.
  const page = await apiFetch<{ items: ServerProvider[] }>(`${API_ROOT}/providers`)
  return Array.isArray(page.items) ? page.items : []
}

export async function createServerProvider(input: {
  label: string
  kind: ServerProviderKind
  endpointUrl: string
  modelId?: string
}): Promise<ServerProvider> {
  return apiFetch<ServerProvider>(`${API_ROOT}/providers`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function setServerProviderCredential(
  providerId: string,
  apiKey: string,
): Promise<ServerProvider> {
  return apiFetch<ServerProvider>(`${API_ROOT}/providers/${encodeURIComponent(providerId)}/credential`, {
    method: 'PUT',
    body: JSON.stringify({ apiKey }),
  })
}

export interface ServerProviderTestResponse {
  ok: boolean
  message: string
  latencyMs: number | null
  discoveredModels: string[] | null
}

/**
 * Test the connection AND persist the discovered model list on the server
 * (the provider row's `models` field). Server chat needs a model — either
 * one the user set at creation or the first discovered here — so the UI's
 * "Test" action uses this route, which supersedes the backend's plain
 * /test (same check, without the persistence).
 */
export async function discoverServerProviderModels(
  providerId: string,
): Promise<ServerProviderTestResponse> {
  return apiFetch<ServerProviderTestResponse>(
    `${API_ROOT}/providers/${encodeURIComponent(providerId)}/models`,
    { method: 'POST' },
  )
}
