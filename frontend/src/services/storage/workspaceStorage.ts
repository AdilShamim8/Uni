import type { WorkspaceState } from '@/domain/workspaceTypes'

/**
 * Workspace persistence — a separately versioned namespace from chat data.
 *
 * - Key: `universe:workspace:v1`. Chat state (`universe:data`) is never
 *   touched, so workspace changes can never quarantine conversations.
 * - Future schema bumps migrate here before falling back to a fresh seed
 *   (a quarantined backup is kept, mirroring the chat-storage policy).
 * - Credentials are never part of this payload.
 */

const STORAGE_KEY = 'universe:workspace:v1'
const BACKUP_PREFIX = 'universe:workspace-backup:'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAgent(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.instructions === 'string' &&
    (value.category === 'personal' || value.category === 'specialist') &&
    typeof value.archived === 'boolean'
  )
}

function isTask(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.goal === 'string' &&
    typeof value.status === 'string' &&
    Array.isArray(value.events)
  )
}

function isArtifact(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.markdown === 'string'
  )
}

export function isWorkspaceState(value: unknown): value is WorkspaceState {
  if (!isRecord(value)) return false
  if (value.version !== 1) return false
  if (!Array.isArray(value.agents) || !value.agents.every(isAgent)) return false
  if (!Array.isArray(value.tasks) || !value.tasks.every(isTask)) return false
  if (!Array.isArray(value.artifacts) || !value.artifacts.every(isArtifact)) return false
  if (!Array.isArray(value.projects)) return false
  if (!Array.isArray(value.memoryNotes)) return false
  if (!Array.isArray(value.schedules)) return false
  return true
}

export interface WorkspaceLoadResult {
  state: WorkspaceState | null
  recoveredFrom?: string
}

export function loadWorkspace(): WorkspaceLoadResult {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(STORAGE_KEY)
  } catch {
    return { state: null }
  }
  if (raw === null) return { state: null }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (isWorkspaceState(parsed)) return { state: parsed }
  } catch {
    // fall through to quarantine
  }

  const backupKey = `${BACKUP_PREFIX}${Date.now()}`
  try {
    localStorage.setItem(backupKey, raw)
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* best effort */
  }
  return { state: null, recoveredFrom: backupKey }
}

export function saveWorkspace(state: WorkspaceState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    // Quota or privacy-mode failure: keep working from memory.
    return false
  }
}

export function clearWorkspace(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
