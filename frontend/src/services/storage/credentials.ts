import type { ProviderCredential } from '@/domain/types'

/**
 * Provider credentials live under their own storage key, deliberately
 * separate from the main `universe:data` blob: exporting or sharing app
 * data must never leak API keys. Keys stay in this browser's storage and
 * are only sent to the provider endpoint the user explicitly configured.
 */

const STORAGE_KEY = 'universe:credentials:v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isValidCredential(value: unknown): value is ProviderCredential {
  return (
    isRecord(value) &&
    typeof value.providerId === 'string' &&
    typeof value.apiKey === 'string' &&
    (value.status === 'untested' || value.status === 'connected' || value.status === 'error') &&
    (value.lastCheckedAt === null || typeof value.lastCheckedAt === 'number') &&
    (value.lastError === null || typeof value.lastError === 'string') &&
    Array.isArray(value.discoveredModels) &&
    value.discoveredModels.every((entry) => typeof entry === 'string')
  )
}

export function loadCredentials(): Record<string, ProviderCredential> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return {}
    const result: Record<string, ProviderCredential> = {}
    for (const [id, entry] of Object.entries(parsed)) {
      if (isValidCredential(entry)) result[id] = entry
    }
    return result
  } catch {
    return {}
  }
}

export function saveCredentials(credentials: Record<string, ProviderCredential>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials))
  } catch {
    /* storage unavailable — credentials stay session-only */
  }
}

export function clearCredentials(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
