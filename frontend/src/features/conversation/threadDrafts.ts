/**
 * Per-thread composer drafts (milestone 06). Keyed by a thread-specific
 * draft key (`work:<taskId>`, `work:new`, `agent:<agentId>`), so switching
 * threads, surfaces, or the Chat/Work/Agent mode never mixes or loses
 * drafts. Text only — attachments and tools stay a chat-composer concern.
 */

const STORAGE_PREFIX = 'universe:thread-drafts:v1'

type DraftMap = Record<string, string>

function loadMap(): DraftMap {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as DraftMap
  } catch {
    /* unreadable drafts start fresh */
  }
  return {}
}

function saveMap(map: DraftMap): void {
  try {
    localStorage.setItem(STORAGE_PREFIX, JSON.stringify(map))
  } catch {
    /* quota or privacy mode — drafts stay in memory for this session */
  }
}

export function loadThreadDraft(key: string): string {
  return loadMap()[key] ?? ''
}

export function saveThreadDraft(key: string, text: string): void {
  const map = loadMap()
  const trimmed = text.trim()
  if (trimmed) map[key] = text
  else delete map[key]
  saveMap(map)
}

export function resetThreadDraftsForTests(): void {
  try {
    localStorage.removeItem(STORAGE_PREFIX)
  } catch {
    /* ignore */
  }
}
