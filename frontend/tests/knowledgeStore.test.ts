import { afterEach, describe, expect, it } from 'vitest'
import {
  flushKnowledgePersistence,
  resetKnowledgeStoreForTests,
  useKnowledgeStore,
} from '@/state/knowledgeStore'
import { loadKnowledgeSlice } from '@/services/storage/workspaceStorage'

afterEach(() => {
  resetKnowledgeStoreForTests()
})

describe('knowledge store', () => {
  it('adds a document, chunks it, and answers queries from the index', () => {
    useKnowledgeStore.getState().initialize()
    const result = useKnowledgeStore.getState().addDocument({
      title: 'Runbook',
      text: '# Incidents\n\nTo page on-call, use the escalation policy in PagerDuty.',
      source: 'paste',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const state = useKnowledgeStore.getState()
    expect(state.documents[result.id]).toMatchObject({
      title: 'Runbook',
      source: 'paste',
      fileName: null,
      chunkCount: 1,
    })
    expect(state.chunks[result.id]).toHaveLength(1)

    const hits = useKnowledgeStore.getState().search('escalation policy on-call')
    expect(hits).toHaveLength(1)
    expect(hits[0].docTitle).toBe('Runbook')
    expect(hits[0].heading).toBe('Incidents')
  })

  it('rejects empty and whitespace-only text with honest errors', () => {
    useKnowledgeStore.getState().initialize()
    const empty = useKnowledgeStore.getState().addDocument({ title: 'X', text: '   \n\t ', source: 'paste' })
    expect(empty).toEqual({
      ok: false,
      error: 'There is no text to add — paste content or pick a text file.',
    })
  })

  it('rejects oversized documents instead of silently truncating them', () => {
    useKnowledgeStore.getState().initialize()
    const huge = 'a'.repeat(400_001)
    const result = useKnowledgeStore.getState().addDocument({ title: 'Huge', text: huge, source: 'paste' })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('400,000')
    expect(useKnowledgeStore.getState().documentCount()).toBe(0)
  })

  it('derives a title from the file name or first heading when none is given', () => {
    useKnowledgeStore.getState().initialize()
    const fromFile = useKnowledgeStore.getState().addDocument({
      title: '',
      text: 'plain body',
      source: 'file',
      fileName: 'release-notes.md',
    })
    expect(fromFile.ok).toBe(true)
    if (!fromFile.ok) return
    expect(useKnowledgeStore.getState().documents[fromFile.id].title).toBe('release-notes')

    const fromHeading = useKnowledgeStore.getState().addDocument({
      title: '',
      text: '# Escalation Policy\n\nBody.',
      source: 'paste',
    })
    expect(fromHeading.ok).toBe(true)
    if (!fromHeading.ok) return
    expect(useKnowledgeStore.getState().documents[fromHeading.id].title).toBe('Escalation Policy')
  })

  it('renames and deletes documents, keeping the index consistent', () => {
    useKnowledgeStore.getState().initialize()
    const a = useKnowledgeStore.getState().addDocument({
      title: 'Old title',
      text: '# Section\n\nkubernetes pods eviction details',
      source: 'paste',
    })
    expect(a.ok).toBe(true)
    if (!a.ok) return

    useKnowledgeStore.getState().renameDocument(a.id, 'New title')
    expect(useKnowledgeStore.getState().documents[a.id].title).toBe('New title')
    expect(useKnowledgeStore.getState().search('kubernetes pods')[0].docTitle).toBe('New title')

    useKnowledgeStore.getState().deleteDocument(a.id)
    expect(useKnowledgeStore.getState().documentCount()).toBe(0)
    expect(useKnowledgeStore.getState().search('kubernetes pods')).toEqual([])
  })

  it('persists under its own slice and reloads with retrieval intact', () => {
    useKnowledgeStore.getState().initialize()
    useKnowledgeStore.getState().addDocument({
      title: 'Pricing',
      text: '# Plans\n\nThe free tier includes every feature; the pro tier adds priority capacity.',
      source: 'paste',
    })
    flushKnowledgePersistence()

    // Simulate a reload: fresh state, same storage.
    resetKnowledgeStoreForTests({ keepStorage: true })
    useKnowledgeStore.getState().initialize()

    const state = useKnowledgeStore.getState()
    expect(state.documentCount()).toBe(1)
    const doc = Object.values(state.documents)[0]
    expect(doc.title).toBe('Pricing')
    expect(state.chunks[doc.id]).toHaveLength(1)
    const hits = useKnowledgeStore.getState().search('priority capacity')
    expect(hits[0].docTitle).toBe('Pricing')
  })

  it('quarantines a corrupt slice instead of crashing (empty base, honest state)', () => {
    localStorage.setItem(
      'universe:knowledge:v1',
      JSON.stringify({ version: 1, savedAt: 1, payload: { documents: 'nope' } }),
    )
    useKnowledgeStore.getState().initialize()
    expect(useKnowledgeStore.getState().documentCount()).toBe(0)
    expect(useKnowledgeStore.getState().search('anything')).toEqual([])
  })

  it('drops orphan chunks whose document is missing on load', () => {
    useKnowledgeStore.getState().initialize()
    const result = useKnowledgeStore.getState().addDocument({
      title: 'Doc',
      text: '# H\n\nreal content about databases',
      source: 'paste',
    })
    expect(result.ok).toBe(true)
    flushKnowledgePersistence()
    // Corrupt the persisted slice: keep the chunk, remove the document.
    const slice = loadKnowledgeSlice()
    expect(slice.state).not.toBeNull()
    if (!slice.state) return
    localStorage.setItem(
      'universe:knowledge:v1',
      JSON.stringify({
        version: 1,
        savedAt: 1,
        payload: { documents: [], chunks: slice.state.chunks },
      }),
    )
    resetKnowledgeStoreForTests({ keepStorage: true })
    useKnowledgeStore.getState().initialize()
    expect(useKnowledgeStore.getState().documentCount()).toBe(0)
    expect(useKnowledgeStore.getState().search('databases')).toEqual([])
  })

  it('resetDemoData clears everything including storage', () => {
    useKnowledgeStore.getState().initialize()
    useKnowledgeStore.getState().addDocument({ title: 'T', text: 'words about reliability', source: 'paste' })
    flushKnowledgePersistence()
    useKnowledgeStore.getState().resetDemoData()
    expect(useKnowledgeStore.getState().documentCount()).toBe(0)
    expect(loadKnowledgeSlice().state).toBeNull()
  })
})
