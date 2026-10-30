import { create } from 'zustand'
import {
  buildKnowledgeIndex,
  chunkDocument,
  searchKnowledge,
  KNOWLEDGE_DOC_CHAR_LIMIT,
  KNOWLEDGE_MAX_CHUNKS_PER_DOC,
  type KnowledgeChunk,
  type KnowledgeDocument,
  type KnowledgeHit,
  type KnowledgeIndex,
  type KnowledgeSource,
  type SearchOptions,
} from '@/domain/knowledgeBase'
import { makeId } from '@/domain/ids'
import {
  clearKnowledgeSlice,
  loadKnowledgeSlice,
  saveKnowledgeSlice,
} from '@/services/storage/workspaceStorage'

/**
 * Knowledge store — the local knowledge base (K1). Documents arrive as
 * pasted text or text files, are chunked for retrieval, and persist under
 * their own slice (`universe:knowledge:v1`), independent of chat data and
 * credentials. Documents are immutable in v1: edit means delete and re-add,
 * which keeps every stored chunk exactly what was ingested.
 *
 * Honesty rules:
 * - Retrieval is local keyword matching; nothing here claims embeddings.
 * - Documents over the size cap are rejected with the real reason, never
 *   silently truncated.
 * - Content leaves this device only through an explicit send that the
 *   context inspector labels.
 */

export interface AddDocumentInput {
  title: string
  text: string
  source: KnowledgeSource
  fileName?: string | null
}

export type AddDocumentResult =
  | { ok: true; id: string; capped: boolean }
  | { ok: false; error: string }

export interface KnowledgeStore {
  hydrated: boolean
  documents: Record<string, KnowledgeDocument>
  /** Chunk lists keyed by document id. */
  chunks: Record<string, KnowledgeChunk[]>
  /** Honest save indicator: null = nothing saved yet, false = last flush failed. */
  lastSaveOk: boolean | null
  lastSavedAt: number | null

  initialize: () => void
  resetDemoData: () => void

  addDocument: (input: AddDocumentInput) => AddDocumentResult
  renameDocument: (id: string, title: string) => void
  deleteDocument: (id: string) => void

  /** Retrieval over the current index (empty query/KB → []). */
  search: (query: string, options?: SearchOptions) => KnowledgeHit[]
  /** Number of ingested documents. */
  documentCount: () => number
}

/** The retrieval index, rebuilt lazily when chunks change. */
let index: KnowledgeIndex | null = null

function invalidateIndex(): void {
  index = null
}

function rebuildIndex(state: Pick<KnowledgeStore, 'documents' | 'chunks'>): KnowledgeIndex {
  if (!index) {
    index = buildKnowledgeIndex(
      Object.values(state.documents).map(({ id, title }) => ({ id, title })),
      state.chunks,
    )
  }
  return index
}

export const useKnowledgeStore = create<KnowledgeStore>()((set, get) => ({
  hydrated: false,
  documents: {},
  chunks: {},
  lastSaveOk: null,
  lastSavedAt: null,

  initialize: () => {
    if (get().hydrated) return
    invalidateIndex()
    const loaded = loadKnowledgeSlice()
    if (loaded.state) {
      const documents: Record<string, KnowledgeDocument> = {}
      for (const doc of loaded.state.documents) documents[doc.id] = doc
      const chunks: Record<string, KnowledgeChunk[]> = {}
      for (const chunk of loaded.state.chunks) {
        // A chunk without its document is an orphan — dropped, not shown.
        if (!documents[chunk.docId]) continue
        const list = chunks[chunk.docId] ?? []
        list.push(chunk)
        chunks[chunk.docId] = list
      }
      for (const list of Object.values(chunks)) list.sort((a, b) => a.ordinal - b.ordinal)
      set({ hydrated: true, documents, chunks })
    } else {
      set({ hydrated: true, documents: {}, chunks: {} })
    }
  },

  resetDemoData: () => {
    clearKnowledgeSlice()
    invalidateIndex()
    set({ hydrated: true, documents: {}, chunks: {} })
  },

  addDocument: (input) => {
    const text = input.text
    if (text.trim().length === 0) {
      return { ok: false, error: 'There is no text to add — paste content or pick a text file.' }
    }
    if (text.length > KNOWLEDGE_DOC_CHAR_LIMIT) {
      return {
        ok: false,
        error: `That text is ${text.length.toLocaleString()} characters — the per-document limit is ${KNOWLEDGE_DOC_CHAR_LIMIT.toLocaleString()}. Split it into smaller documents.`,
      }
    }
    const id = makeId('kb')
    const { chunks, capped } = chunkDocument(id, text)
    if (chunks.length === 0) {
      return { ok: false, error: 'That text has no retrievable content.' }
    }
    if (chunks.length >= KNOWLEDGE_MAX_CHUNKS_PER_DOC) {
      return {
        ok: false,
        error: `That text would need more than ${KNOWLEDGE_MAX_CHUNKS_PER_DOC} chunks — split it into smaller documents.`,
      }
    }
    const now = Date.now()
    const title =
      input.title.trim() ||
      (input.fileName ? input.fileName.replace(/\.[^.]+$/, '') : '') ||
      (chunks[0].heading) ||
      'Untitled document'
    const document: KnowledgeDocument = {
      id,
      title: title.slice(0, 120),
      source: input.source,
      fileName: input.source === 'file' ? (input.fileName ?? null) : null,
      createdAt: now,
      updatedAt: now,
      charCount: text.length,
      chunkCount: chunks.length,
    }
    invalidateIndex()
    set((state) => ({
      documents: { ...state.documents, [id]: document },
      chunks: { ...state.chunks, [id]: chunks },
    }))
    return { ok: true, id, capped }
  },

  renameDocument: (id, title) => {
    const doc = get().documents[id]
    const trimmed = title.trim()
    if (!doc || !trimmed) return
    invalidateIndex()
    set((state) => ({
      documents: { ...state.documents, [id]: { ...doc, title: trimmed.slice(0, 120), updatedAt: Date.now() } },
    }))
  },

  deleteDocument: (id) => {
    if (!get().documents[id]) return
    invalidateIndex()
    set((state) => {
      const documents = { ...state.documents }
      delete documents[id]
      const chunks = { ...state.chunks }
      delete chunks[id]
      return { documents, chunks }
    })
    // A knowledge context selection survives an empty base honestly (the
    // inspector shows the empty state), so no cross-store pruning needed.
  },

  search: (query, options) => searchKnowledge(rebuildIndex(get()), query, options),

  documentCount: () => Object.keys(get().documents).length,
}))

/* ------------------------------------------------------------------ */
/* Persistence wiring                                                  */
/* ------------------------------------------------------------------ */

let saveTimer: ReturnType<typeof setTimeout> | undefined

let knowledgeStorageWarned = false

export function flushKnowledgePersistence(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  const state = useKnowledgeStore.getState()
  if (!state.hydrated) return
  const saved = saveKnowledgeSlice({
    documents: Object.values(state.documents),
    chunks: Object.values(state.chunks).flat(),
  })
  useKnowledgeStore.setState({ lastSaveOk: saved, lastSavedAt: saved ? Date.now() : state.lastSavedAt })
  if (!saved && !knowledgeStorageWarned) {
    knowledgeStorageWarned = true
    import('@/state/store').then(({ useAppStore }) => {
      useAppStore.getState().showToast(
        'Local storage is full or blocked — knowledge base changes may not survive a reload.',
      )
    })
  }
}

useKnowledgeStore.subscribe(() => {
  const state = useKnowledgeStore.getState()
  if (!state.hydrated) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushKnowledgePersistence, 400)
})

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushKnowledgePersistence)
}

/** Test-only: wipe knowledge state (and optionally storage). */
export function resetKnowledgeStoreForTests(options: { keepStorage?: boolean } = {}): void {
  if (!options.keepStorage) clearKnowledgeSlice()
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  invalidateIndex()
  useKnowledgeStore.setState({ hydrated: false, documents: {}, chunks: {}, lastSaveOk: null, lastSavedAt: null })
}
