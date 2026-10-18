import { beforeEach, describe, expect, it } from 'vitest'
import {
  effectiveContent,
  flushLibraryPersistence,
  resetLibraryStoreForTests,
  useLibraryStore,
} from '@/state/libraryStore'

/**
 * Artifact version history — migration from pre-version data, draft/snapshot
 * separation, bounded history, and restore-as-new-version semantics.
 */

const OLD_FIXTURE = {
  id: 'art-old',
  title: 'Legacy report',
  kind: 'report',
  taskId: null,
  projectId: null,
  markdown: '# Legacy content\n\nWritten before versions existed.',
  createdAt: 1700000000000,
  updatedAt: 1700000000000,
  provenance: 'demo-simulation',
}

function seedLegacyArtifact() {
  localStorage.setItem(
    'universe:library:v1',
    JSON.stringify({ version: 1, savedAt: Date.now(), payload: { artifacts: [OLD_FIXTURE], projects: [] } }),
  )
}

beforeEach(() => {
  resetLibraryStoreForTests()
  localStorage.clear()
})

describe('artifact migration', () => {
  it('migrates a real pre-v2 artifact into a versioned one without wiping content', () => {
    seedLegacyArtifact()
    useLibraryStore.getState().initialize()

    const artifact = useLibraryStore.getState().artifacts['art-old']
    expect(artifact).toBeTruthy()
    expect(artifact.markdown).toBe(OLD_FIXTURE.markdown)
    expect(artifact.versions).toHaveLength(1)
    expect(artifact.versions[0].kind).toBe('initial')
    expect(artifact.versions[0].markdown).toBe(OLD_FIXTURE.markdown)
    expect(artifact.workingDraft).toBeNull()
  })

  it('keeps migrated artifacts loadable across a save/reload cycle', () => {
    seedLegacyArtifact()
    useLibraryStore.getState().initialize()
    flushLibraryPersistence()

    resetLibraryStoreForTests({ keepStorage: true })
    useLibraryStore.getState().initialize()
    const artifact = useLibraryStore.getState().artifacts['art-old']
    expect(artifact.versions).toHaveLength(1)
    expect(artifact.markdown).toBe(OLD_FIXTURE.markdown)
  })
})

describe('working drafts and versions', () => {
  function makeArtifact() {
    return useLibraryStore.getState().addArtifact({
      title: 'Working doc',
      kind: 'document',
      markdown: '# v1',
    })
  }

  it('autosaves edits as a draft without creating versions per keystroke', () => {
    const id = makeArtifact()
    const store = useLibraryStore.getState()

    store.setWorkingDraft(id, '# v2 draft')
    store.setWorkingDraft(id, '# v2 draft more typing')

    const artifact = useLibraryStore.getState().artifacts[id]
    expect(artifact.workingDraft).toBe('# v2 draft more typing')
    // No version was created by typing.
    expect(artifact.versions).toHaveLength(1)
    // Effective content (what edit/export surfaces use) reflects the draft.
    expect(effectiveContent(artifact)).toBe('# v2 draft more typing')
  })

  it('treats a draft identical to committed content as clean', () => {
    const id = makeArtifact()
    useLibraryStore.getState().setWorkingDraft(id, '# v1')
    expect(useLibraryStore.getState().artifacts[id].workingDraft).toBeNull()
  })

  it('committing a draft creates one version and clears the draft', () => {
    const id = makeArtifact()
    const store = useLibraryStore.getState()
    store.setWorkingDraft(id, '# v2')
    store.commitDraft(id, 'Second draft')

    const artifact = useLibraryStore.getState().artifacts[id]
    expect(artifact.markdown).toBe('# v2')
    expect(artifact.workingDraft).toBeNull()
    expect(artifact.versions).toHaveLength(2)
    expect(artifact.versions[0].label).toBe('Second draft')
    expect(artifact.versions[0].kind).toBe('snapshot')
  })

  it('discarding a draft reverts to committed content and keeps history', () => {
    const id = makeArtifact()
    const store = useLibraryStore.getState()
    store.setWorkingDraft(id, '# v2')
    store.commitDraft(id, 'v2')
    store.setWorkingDraft(id, '# v3 experiment')
    store.discardWorkingDraft(id)

    const artifact = useLibraryStore.getState().artifacts[id]
    expect(artifact.markdown).toBe('# v2')
    expect(artifact.workingDraft).toBeNull()
    expect(artifact.versions).toHaveLength(2)
  })

  it('named snapshots capture the current editing content', () => {
    const id = makeArtifact()
    const store = useLibraryStore.getState()
    store.setWorkingDraft(id, '# in progress')
    store.createSnapshot(id, 'Before big rewrite')

    const artifact = useLibraryStore.getState().artifacts[id]
    expect(artifact.markdown).toBe('# in progress')
    expect(artifact.versions[0].label).toBe('Before big rewrite')
    expect(artifact.versions[0].markdown).toBe('# in progress')
  })

  it('restoring a version appends a new version and never erases history', () => {
    const id = makeArtifact()
    const store = useLibraryStore.getState()
    store.setWorkingDraft(id, '# v2')
    store.commitDraft(id, 'v2')
    store.setWorkingDraft(id, '# v3')
    store.commitDraft(id, 'v3')

    const before = useLibraryStore.getState().artifacts[id]
    expect(before.versions).toHaveLength(3)
    const originalVersion = before.versions[before.versions.length - 1]

    store.restoreVersion(id, originalVersion.id)

    const after = useLibraryStore.getState().artifacts[id]
    expect(after.markdown).toBe('# v1')
    // Restoration ADDED a version; nothing was removed.
    expect(after.versions).toHaveLength(4)
    expect(after.versions[0].kind).toBe('restore')
    expect(after.versions[0].markdown).toBe('# v1')
    // The intermediate versions are still in the history.
    expect(after.versions.some((v) => v.markdown === '# v3')).toBe(true)
  })

  it('bounds the version history while keeping the initial version reachable', () => {
    const id = makeArtifact()
    const store = useLibraryStore.getState()
    for (let i = 2; i <= 30; i += 1) {
      store.setWorkingDraft(id, `# v${i}`)
      store.commitDraft(id, `v${i}`)
    }
    const artifact = useLibraryStore.getState().artifacts[id]
    expect(artifact.versions.length).toBeLessThanOrEqual(20)
    // The initial version survives the bound.
    expect(artifact.versions[artifact.versions.length - 1].kind).toBe('initial')
  })

  it('records provenance and source when saving from a conversation', () => {
    const id = useLibraryStore.getState().addArtifact({
      title: 'Reply worth keeping',
      kind: 'document',
      markdown: 'Assistant response content',
      provenance: 'model-output',
      source: { conversationId: 'c-123', messageId: 'm-456', taskId: null },
    })
    const artifact = useLibraryStore.getState().artifacts[id]
    expect(artifact.provenance).toBe('model-output')
    expect(artifact.source?.conversationId).toBe('c-123')
    expect(artifact.source?.messageId).toBe('m-456')
    // Credentials never live in artifacts — no key-like fields exist at all.
    expect(JSON.stringify(artifact)).not.toContain('apiKey')
  })
})
