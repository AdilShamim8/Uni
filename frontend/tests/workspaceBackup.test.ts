import { describe, expect, it, beforeEach } from 'vitest'
import {
  buildWorkspaceBackup,
  parseWorkspaceBackup,
  restoreWorkspaceBackup,
} from '@/services/storage/workspaceBackup'
import { useAppStore, resetStoreForTests } from '@/state/store'
import {
  resetAgentsStoreForTests,
  useAgentsStore,
} from '@/state/agentsStore'
import { resetWorkStoreForTests, useWorkStore } from '@/state/workStore'
import { resetLibraryStoreForTests, useLibraryStore } from '@/state/libraryStore'
import { resetKnowledgeStoreForTests, flushKnowledgePersistence, useKnowledgeStore } from '@/state/knowledgeStore'
import { resetPluginsStoreForTests, usePluginsStore } from '@/state/pluginsStore'
import {
  loadWorkSlice,
  loadLibrarySlice,
  loadKnowledgeSlice,
  saveWorkSlice,
} from '@/services/storage/workspaceStorage'

/**
 * Milestone 07 regression suite (F08): honest export scope + a real
 * workspace backup that round-trips into a fresh profile with its
 * relationships intact — and refuses invalid input without touching
 * existing data.
 */

beforeEach(() => {
  resetStoreForTests()
  resetAgentsStoreForTests()
  resetWorkStoreForTests()
  resetLibraryStoreForTests()
  resetKnowledgeStoreForTests()
  resetPluginsStoreForTests()
  useAppStore.getState().initialize()
  useAgentsStore.getState().initialize()
  useKnowledgeStore.getState().initialize()
  usePluginsStore.getState().initialize()
  localStorage.clear()
})

describe('workspace backup', () => {
  it('round-trips a representative workspace into fresh storage', () => {
    // Build a representative workspace in memory.
    const taskId = useWorkStore.getState().createTask({
      title: 'Backup round-trip task',
      goal: 'Prove backups work',
      deliverable: 'research-report',
    })
    useLibraryStore.getState().addArtifact({
      title: 'Backup document',
      kind: 'document',
      markdown: '# Hello',
      provenance: 'user-authored',
      taskId,
    })
    usePluginsStore.getState().enablePlugin('documents')
    useAppStore.getState().newConversation()
    const agents = Object.values(useAgentsStore.getState().agents)
    useAgentsStore.getState().addMemoryNote(agents[0].id, 'Backup note')
    useKnowledgeStore.getState().addDocument({
      title: 'Backup knowledge',
      text: '# Retrieval\n\nBacked-up knowledge stays retrievable after a restore.',
      source: 'paste',
    })

    const backup = buildWorkspaceBackup()
    const json = JSON.stringify(backup)

    // Fresh profile: wipe storage, restore from the file content only.
    localStorage.clear()
    const parsed = parseWorkspaceBackup(json)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.counts.tasks).toBe(1)
    expect(parsed.counts.artifacts).toBe(1)
    expect(parsed.counts.memoryNotes).toBe(1)
    expect(parsed.counts.enabledPlugins).toBe(1)
    expect(parsed.counts.knowledgeDocuments).toBe(1)

    const restored = restoreWorkspaceBackup(parsed.backup)
    expect(restored.ok).toBe(true)

    // The stores' own loaders see the restored slices — with the task
    // linked to its artifact preserved.
    const work = loadWorkSlice()
    const library = loadLibrarySlice()
    expect(work.state?.tasks[0]?.title).toBe('Backup round-trip task')
    expect(library.state?.artifacts[0]?.title).toBe('Backup document')
    expect(library.state?.artifacts[0]?.taskId).toBe(work.state?.tasks[0]?.id)
    expect(localStorage.getItem('universe:plugins:v1')).toContain('documents')
    expect(localStorage.getItem('universe:credentials:v1')).toBeNull()

    // Knowledge documents and their chunks survive the round-trip and
    // stay retrievable from the restored slice.
    const knowledge = loadKnowledgeSlice()
    expect(knowledge.state?.documents[0]?.title).toBe('Backup knowledge')
    expect(knowledge.state?.chunks.length).toBe(1)
    expect(knowledge.state?.chunks[0]?.text).toContain('stays retrievable')
  })

  it('a backup without a knowledge section empties the base on restore (replace semantics)', () => {
    useKnowledgeStore.getState().addDocument({
      title: 'Current knowledge',
      text: '# Now\n\nThis document exists before the restore.',
      source: 'paste',
    })
    const withKnowledge = buildWorkspaceBackup()
    // Simulate a pre-knowledge-era backup: same payload, no knowledge key.
    const legacy = {
      ...withKnowledge,
      payload: { ...withKnowledge.payload, knowledge: undefined },
    }
    const parsed = parseWorkspaceBackup(JSON.stringify(legacy))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.counts.knowledgeDocuments).toBe(0)

    const restored = restoreWorkspaceBackup(parsed.backup)
    expect(restored.ok).toBe(true)
    expect(loadKnowledgeSlice().state).toBeNull()
  })

  it('rejects a present-but-invalid knowledge section without touching data', () => {
    useKnowledgeStore.getState().addDocument({
      title: 'Current knowledge',
      text: '# Now\n\nMust survive an invalid restore attempt.',
      source: 'paste',
    })
    // Persist the current document so survival is provable in storage.
    flushKnowledgePersistence()
    const backup = buildWorkspaceBackup()
    const corrupted = JSON.parse(JSON.stringify(backup))
    corrupted.payload.knowledge = { documents: 'not-an-array' }
    const parsed = parseWorkspaceBackup(JSON.stringify(corrupted))
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.error).toContain('knowledge base section failed validation')
    const knowledge = loadKnowledgeSlice()
    expect(knowledge.state?.documents[0]?.title).toBe('Current knowledge')
  })

  it('rejects invalid input and leaves existing data untouched', () => {
    useWorkStore.getState().createTask({
      title: 'Existing task',
      goal: 'Must survive',
      deliverable: 'research-report',
    })
    saveWorkSlice({ tasks: Object.values(useWorkStore.getState().tasks) })
    const before = localStorage.getItem('universe:work:v1')

    const bad = parseWorkspaceBackup('{"kind": "uni-workspace-backup", "version": 1, "payload": {"app": 42}}')
    expect(bad.ok).toBe(false)
    const notJson = parseWorkspaceBackup('not json at all')
    expect(notJson.ok).toBe(false)

    expect(localStorage.getItem('universe:work:v1')).toBe(before)
  })

  it('never contains credentials or temporary conversations', () => {
    const temporaryId = useAppStore.getState().newConversation({ temporary: true })
    useAppStore.getState().setCredential('provider-1', {
      providerId: 'provider-1',
      apiKey: 'sk-super-secret',
      status: 'connected',
      lastCheckedAt: Date.now(),
      lastError: null,
      discoveredModels: [],
    })

    const json = JSON.stringify(buildWorkspaceBackup())
    expect(json).not.toContain('sk-super-secret')
    expect(json).not.toContain(temporaryId)
  })
})
