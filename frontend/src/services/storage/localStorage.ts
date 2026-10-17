import type { PersistedState } from '@/domain/types'

/**
 * Local persistence with schema versioning and safe recovery.
 *
 * - Single key `universe:data`, schema version 1.
 * - Malformed data is quarantined under `universe:backup:<timestamp>`
 *   and the app restarts from the demo seed instead of crashing.
 * - Temporary conversations are filtered out by the serializer before
 *   this layer is ever called.
 */

const STORAGE_KEY = 'universe:data'
const BACKUP_PREFIX = 'universe:backup:'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isValidConversation(value: unknown): boolean {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.temporary === 'boolean' &&
    isRecord(value.nodes)
  )
}

export function isPersistedState(value: unknown): value is PersistedState {
  if (!isRecord(value)) return false
  if (value.version !== 1) return false
  if (!Array.isArray(value.conversations)) return false
  if (!Array.isArray(value.providers)) return false
  if (!isRecord(value.preferences)) return false
  return value.conversations.every(isValidConversation)
}

export interface LoadResult {
  state: PersistedState | null
  /** Set when malformed data was found and quarantined. */
  recoveredFrom?: string
}

export function loadPersisted(): LoadResult {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return { state: null }
  }
  if (raw === null) return { state: null }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (isPersistedState(parsed)) {
      return { state: parsed }
    }
  } catch {
    // fall through to quarantine
  }

  const backupKey = `${BACKUP_PREFIX}${Date.now()}`
  try {
    localStorage.setItem(backupKey, raw)
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* best effort — if storage is full we still start fresh */
  }
  return { state: null, recoveredFrom: backupKey }
}

export function savePersisted(state: PersistedState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    // Quota or privacy-mode failure: keep the session alive in memory.
    return false
  }
}

export function clearPersisted(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
