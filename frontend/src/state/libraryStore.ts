import { create } from 'zustand'
import type { Artifact, Project } from '@/domain/workspaceTypes'
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
 */

export interface LibraryStore {
  hydrated: boolean
  artifacts: Record<string, Artifact>
  projects: Record<string, Project>

  initialize: () => void
  resetDemoData: () => void

  addArtifact: (input: {
    title: string
    kind: Artifact['kind']
    markdown: string
    taskId?: string | null
    projectId?: string | null
    provenance?: Artifact['provenance']
  }) => string
  renameArtifact: (id: string, title: string) => void
  updateArtifact: (id: string, markdown: string) => void
  deleteArtifact: (id: string) => void

  addProject: (input: { name: string; description?: string }) => string
  renameProject: (id: string, name: string) => void
  deleteProject: (id: string) => void
}

export const useLibraryStore = create<LibraryStore>()((set, get) => ({
  hydrated: false,
  artifacts: {},
  projects: {},

  initialize: () => {
    if (get().hydrated) return
    const loaded = loadLibrarySlice()
    if (loaded.state) {
      const artifacts: Record<string, Artifact> = {}
      for (const artifact of loaded.state.artifacts) artifacts[artifact.id] = artifact
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
      artifacts: { ...state.artifacts, [id]: { ...artifact, markdown, updatedAt: Date.now() } },
    }))
  },

  deleteArtifact: (id) => {
    set((state) => {
      const artifacts = { ...state.artifacts }
      delete artifacts[id]
      return { artifacts }
    })
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
  useLibraryStore.setState({ hydrated: false, artifacts: {}, projects: {} })
}
