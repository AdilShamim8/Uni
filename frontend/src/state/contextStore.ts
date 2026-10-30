import { create } from 'zustand'

/**
 * Project context store — the explicit selection of local items a chat or
 * task can see. Persisted under its own key `universe:context:v1`,
 * completely independent of credentials and of chat/workspace data.
 *
 * Honesty rules:
 * - Only real local content is selectable; file metadata alone is never
 *   presented as understanding.
 * - Content leaves this browser only when the user sends/runs a live
 *   action — the UI previews exactly what would be included.
 * - Every item has explicit size limits; oversized content is truncated
 *   and labeled, never silently sent in full.
 * - Deleted references resolve to "unavailable" — never a raw orphan id.
 */

export type ContextItemKind = 'artifact' | 'project' | 'note' | 'knowledge'

export interface ContextItem {
  id: string
  kind: ContextItemKind
  /** Library id for artifacts/projects; null for freeform notes. */
  refId: string | null
  /** Title snapshot at add time (stable label across renames). */
  title: string
  /** Freeform note content (notes only). */
  content: string | null
  addedAt: number
}

export interface ContextState {
  version: 1
  savedAt: number
  /** Keyed by conversation id or task id. */
  selections: Record<string, ContextItem[]>
}

/** Per-item content cap — generous but bounded. */
export const CONTEXT_ITEM_LIMIT = 16000
/** Total characters included per live send. */
export const CONTEXT_TOTAL_LIMIT = 48000

const CONTEXT_KEY = 'universe:context:v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isContextItem(value: unknown): value is ContextItem {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    (value.kind === 'artifact' ||
      value.kind === 'project' ||
      value.kind === 'note' ||
      value.kind === 'knowledge') &&
    typeof value.title === 'string'
  )
}

function loadContextState(): ContextState | null {
  try {
    const raw = localStorage.getItem(CONTEXT_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (isRecord(parsed) && parsed.version === 1 && isRecord(parsed.payload)) {
      const selections: Record<string, ContextItem[]> = {}
      const rawSelections = (parsed.payload as { selections?: unknown }).selections
      if (isRecord(rawSelections)) {
        for (const [key, value] of Object.entries(rawSelections)) {
          if (Array.isArray(value) && value.every(isContextItem)) {
            selections[key] = value
          }
        }
      }
      return { version: 1, savedAt: 0, selections }
    }
  } catch {
    /* unreadable context falls back to empty */
  }
  return null
}

function saveContextState(state: ContextState): boolean {
  try {
    localStorage.setItem(CONTEXT_KEY, JSON.stringify({ version: 1, savedAt: Date.now(), payload: state }))
    return true
  } catch {
    return false
  }
}

export interface ContextStore {
  hydrated: boolean
  selections: Record<string, ContextItem[]>

  initialize: () => void
  getSelection: (targetKey: string) => ContextItem[]
  addArtifactContext: (targetKey: string, input: { refId: string; title: string }) => void
  addProjectContext: (targetKey: string, input: { refId: string; title: string }) => void
  addNoteContext: (targetKey: string, input: { title: string; content: string }) => void
  /** Attach knowledge-base retrieval (one per target; runs at send). */
  addKnowledgeContext: (targetKey: string) => void
  removeContextItem: (targetKey: string, itemId: string) => void
  clearContext: (targetKey: string) => void
  /** Drop every selection — used by data resets. */
  reset: () => void
  /** Cross-store cleanup when a referenced record disappears. */
  pruneReferences: (input: { artifactId?: string; projectId?: string }) => void
}

function makeContextId(): string {
  return `ctx-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const useContextStore = create<ContextStore>()((set, get) => ({
  hydrated: false,
  selections: {},

  initialize: () => {
    if (get().hydrated) return
    const loaded = loadContextState()
    set({ hydrated: true, selections: loaded?.selections ?? {} })
  },

  getSelection: (targetKey) => get().selections[targetKey] ?? [],

  addArtifactContext: (targetKey, input) => {
    set((state) => {
      const existing = state.selections[targetKey] ?? []
      if (existing.some((item) => item.kind === 'artifact' && item.refId === input.refId)) {
        return state
      }
      const item: ContextItem = {
        id: makeContextId(),
        kind: 'artifact',
        refId: input.refId,
        title: input.title,
        content: null,
        addedAt: Date.now(),
      }
      return { selections: { ...state.selections, [targetKey]: [...existing, item] } }
    })
  },

  addProjectContext: (targetKey, input) => {
    set((state) => {
      const existing = state.selections[targetKey] ?? []
      if (existing.some((item) => item.kind === 'project' && item.refId === input.refId)) {
        return state
      }
      const item: ContextItem = {
        id: makeContextId(),
        kind: 'project',
        refId: input.refId,
        title: input.title,
        content: null,
        addedAt: Date.now(),
      }
      return { selections: { ...state.selections, [targetKey]: [...existing, item] } }
    })
  },

  addNoteContext: (targetKey, input) => {
    set((state) => {
      const existing = state.selections[targetKey] ?? []
      const item: ContextItem = {
        id: makeContextId(),
        kind: 'note',
        refId: null,
        title: input.title.trim() || 'Note',
        // Notes carry their own bounded content.
        content: input.content.slice(0, CONTEXT_ITEM_LIMIT),
        addedAt: Date.now(),
      }
      return { selections: { ...state.selections, [targetKey]: [...existing, item] } }
    })
  },

  addKnowledgeContext: (targetKey) => {
    set((state) => {
      const existing = state.selections[targetKey] ?? []
      // One retrieval source per target — adding twice changes nothing.
      if (existing.some((item) => item.kind === 'knowledge')) return state
      const item: ContextItem = {
        id: makeContextId(),
        kind: 'knowledge',
        refId: null,
        title: 'Knowledge base',
        content: null,
        addedAt: Date.now(),
      }
      return { selections: { ...state.selections, [targetKey]: [...existing, item] } }
    })
  },

  removeContextItem: (targetKey, itemId) => {
    set((state) => {
      const existing = state.selections[targetKey]
      if (!existing) return state
      return {
        selections: { ...state.selections, [targetKey]: existing.filter((i) => i.id !== itemId) },
      }
    })
  },

  clearContext: (targetKey) => {
    set((state) => {
      if (!state.selections[targetKey]) return state
      const selections = { ...state.selections }
      delete selections[targetKey]
      return { selections }
    })
  },

  reset: () => {
    try {
      localStorage.removeItem(CONTEXT_KEY)
    } catch {
      /* ignore */
    }
    set({ selections: {} })
  },

  pruneReferences: ({ artifactId, projectId }) => {
    set((state) => {
      let changed = false
      const selections: Record<string, ContextItem[]> = {}
      for (const [key, items] of Object.entries(state.selections)) {
        const kept = items.filter((item) => {
          if (artifactId && item.kind === 'artifact' && item.refId === artifactId) return false
          if (projectId && item.kind === 'project' && item.refId === projectId) return false
          return true
        })
        if (kept.length !== items.length) changed = true
        if (kept.length > 0) selections[key] = kept
      }
      return changed ? { selections } : state
    })
  },
}))

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

let contextSaveTimer: ReturnType<typeof setTimeout> | undefined
let contextStorageWarned = false

function persistContext(): void {
  if (contextSaveTimer) clearTimeout(contextSaveTimer)
  contextSaveTimer = setTimeout(() => {
    const state = useContextStore.getState()
    if (!state.hydrated) return
    const ok = saveContextState({ version: 1, savedAt: Date.now(), selections: state.selections })
    if (!ok && !contextStorageWarned) {
      contextStorageWarned = true
      import('@/state/store').then(({ useAppStore }) => {
        useAppStore
          .getState()
          .showToast('Local storage is full — context selections may not survive a reload.')
      })
    }
  }, 400)
}

useContextStore.subscribe(() => {
  if (useContextStore.getState().hydrated) persistContext()
})

export function flushContextPersistence(): void {
  if (contextSaveTimer) {
    clearTimeout(contextSaveTimer)
    contextSaveTimer = undefined
  }
  const state = useContextStore.getState()
  if (!state.hydrated) return
  saveContextState({ version: 1, savedAt: Date.now(), selections: state.selections })
}

/** Test-only: wipe context state (and optionally storage). */
export function resetContextStoreForTests(options: { keepStorage?: boolean } = {}): void {
  if (!options.keepStorage) {
    try {
      localStorage.removeItem(CONTEXT_KEY)
    } catch {
      /* ignore */
    }
  }
  if (contextSaveTimer) {
    clearTimeout(contextSaveTimer)
    contextSaveTimer = undefined
  }
  useContextStore.setState({ hydrated: false, selections: {} })
}
