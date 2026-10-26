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
  return apiFetch<ServerProvider[]>(`${API_ROOT}/providers`)
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

export async function testServerProvider(providerId: string): Promise<ServerProviderTestResponse> {
  return apiFetch<ServerProviderTestResponse>(
    `${API_ROOT}/providers/${encodeURIComponent(providerId)}/test`,
    { method: 'POST' },
  )
}
