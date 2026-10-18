import { create } from 'zustand'
import type { Artifact, ArtifactSource, ArtifactVersion, Project } from '@/domain/workspaceTypes'
import { makeId } from '@/domain/ids'
import {
  clearLibrarySlice,
  loadLibrarySlice,
  saveLibrarySlice,
} from '@/services/storage/workspaceStorage'

/**
 * Library store — the shared local artifact collection and lightweight
 * project context groups. One collection, reachable from Work, Agents,
 * and navigation; no duplicate per-task libraries.
 *
 * Artifacts carry a bounded version history and a separate working draft:
 * edits autosave as a draft (never a version per keystroke); explicit
 * saves and named snapshots create versions; restoring appends a new
 * version instead of erasing history.
 */

/** Version history bound — oldest entries (beyond the initial) drop off. */
export const MAX_ARTIFACT_VERSIONS = 20

function makeVersion(
  markdown: string,
  label: string,
  kind: ArtifactVersion['kind'],
): ArtifactVersion {
  return { id: makeId('ver'), label: label.slice(0, 80), createdAt: Date.now(), markdown, kind }
}

/** Bound the version list, always keeping the initial entry alive. */
function boundVersions(versions: ArtifactVersion[]): ArtifactVersion[] {
  if (versions.length <= MAX_ARTIFACT_VERSIONS) return versions
  const kept = versions.slice(0, MAX_ARTIFACT_VERSIONS)
  const initial = versions[versions.length - 1]
  if (initial && initial.kind === 'initial' && !kept.some((v) => v.kind === 'initial')) {
    kept[kept.length - 1] = initial
  }
  return kept
}

/**
 * Normalize an artifact loaded from storage. Pre-version artifacts (from
 * `universe:library:v1` before Milestone 04) gain an `initial` version
 * built from their existing markdown — no data is wiped or rewritten.
 */
function migrateArtifact(raw: Artifact): Artifact {
  const versions =
    Array.isArray(raw.versions) && raw.versions.length > 0
      ? raw.versions
      : [makeVersion(raw.markdown, 'Imported', 'initial')]
  return {
    ...raw,
    versions: boundVersions(versions),
    workingDraft: typeof raw.workingDraft === 'string' ? raw.workingDraft : null,
    draftUpdatedAt: typeof raw.draftUpdatedAt === 'number' ? raw.draftUpdatedAt : null,
    source: raw.source ?? null,
  }
}

/** The content an editing/exporting surface should use right now. */
export function effectiveContent(artifact: Artifact): string {
  return artifact.workingDraft ?? artifact.markdown
}

export interface LibraryStore {
  hydrated: boolean
  artifacts: Record<string, Artifact>
  projects: Record<string, Project>
  /** Honest save indicator: null = nothing saved yet, false = last flush failed. */
  lastSaveOk: boolean | null
  lastSavedAt: number | null

  initialize: () => void
  resetDemoData: () => void

  addArtifact: (input: {
    title: string
    kind: Artifact['kind']
    markdown: string
    taskId?: string | null
    projectId?: string | null
    provenance?: Artifact['provenance']
    source?: ArtifactSource | null
  }) => string
  renameArtifact: (id: string, title: string) => void
  /** Commit content directly (no draft cycle) — used by migration-safe flows. */
  updateArtifact: (id: string, markdown: string) => void
  deleteArtifact: (id: string) => void

  /** Autosaved working draft — separate from versions. */
  setWorkingDraft: (id: string, markdown: string) => void
  discardWorkingDraft: (id: string) => void
  /** Commit the working draft as a new version (explicit save). */
  commitDraft: (id: string, label?: string) => void
  /** Named snapshot of the current editing content. */
  createSnapshot: (id: string, label: string) => void
  /** Restore a version as a NEW version; history is never erased. */
  restoreVersion: (id: string, versionId: string) => void

  addProject: (input: { name: string; description?: string }) => string
  renameProject: (id: string, name: string) => void
  deleteProject: (id: string) => void
}

export const useLibraryStore = create<LibraryStore>()((set, get) => ({
  hydrated: false,
  artifacts: {},
  projects: {},
  lastSaveOk: null,
  lastSavedAt: null,

  initialize: () => {
    if (get().hydrated) return
    const loaded = loadLibrarySlice()
    if (loaded.state) {
      const artifacts: Record<string, Artifact> = {}
      for (const raw of loaded.state.artifacts) artifacts[raw.id] = migrateArtifact(raw)
      const projects: Record<string, Project> = {}
      for (const project of loaded.state.projects) projects[project.id] = project
      set({ hydrated: true, artifacts, projects })
    } else {
      set({ hydrated: true, artifacts: {}, projects: {} })
    }
  },

  resetDemoData: () => {
    clearLibrarySlice()
    set({ hydrated: true, artifacts: {}, projects: {} })
  },

  addArtifact: (input) => {
    const now = Date.now()
    const artifact: Artifact = {
      id: makeId('art'),
      title: input.title.trim() || 'Untitled',
      kind: input.kind,
      markdown: input.markdown,
      workingDraft: null,
      draftUpdatedAt: null,
      versions: [makeVersion(input.markdown, 'Created', 'initial')],
      source: input.source ?? null,
      taskId: input.taskId ?? null,
      projectId: input.projectId ?? null,
      createdAt: now,
      updatedAt: now,
      provenance: input.provenance ?? 'user-authored',
    }
    set((state) => ({ artifacts: { ...state.artifacts, [artifact.id]: artifact } }))
    return artifact.id
  },

  renameArtifact: (id, title) => {
    const artifact = get().artifacts[id]
    const trimmed = title.trim()
    if (!artifact || !trimmed) return
    set((state) => ({
      artifacts: { ...state.artifacts, [id]: { ...artifact, title: trimmed, updatedAt: Date.now() } },
    }))
  },

  updateArtifact: (id, markdown) => {
    const artifact = get().artifacts[id]
    if (!artifact) return
    set((state) => ({
      artifacts: {
        ...state.artifacts,
        [id]: { ...artifact, markdown, workingDraft: null, draftUpdatedAt: null, updatedAt: Date.now() },
      },
    }))
  },

  deleteArtifact: (id) => {
    set((state) => {
      const artifacts = { ...state.artifacts }
      delete artifacts[id]
      return { artifacts }
    })
  },

  setWorkingDraft: (id, markdown) => {
    const artifact = get().artifacts[id]
    if (!artifact) return
    // A draft identical to the committed content is not a draft.
    const isClean = markdown === artifact.markdown
    set((state) => ({
      artifacts: {
        ...state.artifacts,
        [id]: {
          ...artifact,
          workingDraft: isClean ? null : markdown,
          draftUpdatedAt: isClean ? null : Date.now(),
          updatedAt: Date.now(),
        },
      },
    }))
  },

  discardWorkingDraft: (id) => {
    const artifact = get().artifacts[id]
    if (!artifact) return
    set((state) => ({
      artifacts: {
        ...state.artifacts,
        [id]: { ...artifact, workingDraft: null, draftUpdatedAt: null },
      },
    }))
  },

  commitDraft: (id, label) => {
    const artifact = get().artifacts[id]
    if (!artifact) return
    // Nothing to commit without a pending draft (snapshots cover the
    // unchanged-content case).
    if (artifact.workingDraft === null) return
    const content = artifact.workingDraft
    const version = makeVersion(
      content,
      label?.trim() || `Saved ${new Date().toLocaleString()}`,
      'snapshot',
    )
    set((state) => ({
      artifacts: {
        ...state.artifacts,
        [id]: {
          ...artifact,
          markdown: content,
          workingDraft: null,
          draftUpdatedAt: null,
          versions: boundVersions([version, ...artifact.versions]),
          updatedAt: Date.now(),
        },
      },
    }))
  },

  createSnapshot: (id, label) => {
    const artifact = get().artifacts[id]
    const trimmed = label.trim()
    if (!artifact || !trimmed) return
    const content = artifact.workingDraft ?? artifact.markdown
    const version = makeVersion(content, trimmed, 'snapshot')
    set((state) => ({
      artifacts: {
        ...state.artifacts,
        [id]: {
          ...artifact,
          markdown: content,
          workingDraft: null,
          draftUpdatedAt: null,
          versions: boundVersions([version, ...artifact.versions]),
          updatedAt: Date.now(),
        },
      },
    }))
  },

  restoreVersion: (id, versionId) => {
    const artifact = get().artifacts[id]
    if (!artifact) return
    const version = artifact.versions.find((entry) => entry.id === versionId)
    if (!version) return
    const restored = makeVersion(version.markdown, `Restored “${version.label}”`, 'restore')
    set((state) => ({
      artifacts: {
        ...state.artifacts,
        [id]: {
          ...artifact,
          markdown: version.markdown,
          workingDraft: null,
          draftUpdatedAt: null,
          versions: boundVersions([restored, ...artifact.versions]),
          updatedAt: Date.now(),
        },
      },
    }))
  },

  addProject: (input) => {
    const project: Project = {
      id: makeId('proj'),
      name: input.name.trim() || 'Untitled project',
      description: input.description?.trim() ?? '',
      createdAt: Date.now(),
    }
    set((state) => ({ projects: { ...state.projects, [project.id]: project } }))
    return project.id
  },

  renameProject: (id, name) => {
    const project = get().projects[id]
    const trimmed = name.trim()
    if (!project || !trimmed) return
    set((state) => ({
      projects: { ...state.projects, [id]: { ...project, name: trimmed } },
    }))
  },

  deleteProject: (id) => {
    set((state) => {
      const projects = { ...state.projects }
      delete projects[id]
      // Tasks keep their projectId reference; the work page shows the raw
      // id if the project disappears. Artifacts are kept — only the group
      // is removed.
      return { projects }
    })
  },
}))

/* ------------------------------------------------------------------ */
/* Persistence wiring                                                  */
/* ------------------------------------------------------------------ */

let saveTimer: ReturnType<typeof setTimeout> | undefined

let libraryStorageWarned = false

export function flushLibraryPersistence(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  const state = useLibraryStore.getState()
  if (!state.hydrated) return
  const saved = saveLibrarySlice({
    artifacts: Object.values(state.artifacts),
    projects: Object.values(state.projects),
  })
  useLibraryStore.setState({ lastSaveOk: saved, lastSavedAt: saved ? Date.now() : state.lastSavedAt })
  if (!saved && !libraryStorageWarned) {
    libraryStorageWarned = true
    import('@/state/store').then(({ useAppStore }) => {
      useAppStore.getState().showToast(
        'Local storage is full or blocked — library changes may not survive a reload.',
      )
    })
  }
}

useLibraryStore.subscribe(() => {
  const state = useLibraryStore.getState()
  if (!state.hydrated) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushLibraryPersistence, 400)
})

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushLibraryPersistence)
}

/** Test-only: wipe library state (and optionally storage). */
export function resetLibraryStoreForTests(options: { keepStorage?: boolean } = {}): void {
  if (!options.keepStorage) clearLibrarySlice()
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  useLibraryStore.setState({ hydrated: false, artifacts: {}, projects: {}, lastSaveOk: null, lastSavedAt: null })
}
