import { create } from 'zustand'

/**
 * Workspace UI store — cross-destination shell state: focus mode, the
 * right-hand inspector panel (persistent Canvas / context), the selected
 * project scope, and the remembered split layout.
 *
 * Persisted under its own tiny key `universe:layout:v1` so layout survives
 * reloads without touching chat/workspace/credential data. The panel's open
 * state and artifact are persisted too, so a reload restores the working
 * context — and closes gracefully when the artifact no longer exists.
 */

export type InspectorTab = 'canvas' | 'context'

interface LayoutPayload {
  focusMode: boolean
  selectedProjectId: string | null
  inspectorOpen: boolean
  inspectorTab: InspectorTab
  inspectorArtifactId: string | null
  inspectorWidth: number
}

export interface WorkspaceUiState {
  hydrated: boolean
  focusMode: boolean
  selectedProjectId: string | null
  inspectorOpen: boolean
  inspectorTab: InspectorTab
  inspectorArtifactId: string | null
  inspectorWidth: number

  initialize: () => void
  setFocusMode: (on: boolean) => void
  toggleFocusMode: () => void
  setSelectedProject: (projectId: string | null) => void
  openInspector: (options?: { tab?: InspectorTab; artifactId?: string | null }) => void
  closeInspector: () => void
  setInspectorTab: (tab: InspectorTab) => void
  setInspectorArtifact: (artifactId: string | null) => void
  setInspectorWidth: (width: number) => void
  resetInspectorWidth: () => void
}

const LAYOUT_KEY = 'universe:layout:v1'
export const INSPECTOR_DEFAULT_WIDTH = 420
export const INSPECTOR_MIN_WIDTH = 360
export const INSPECTOR_MAX_WIDTH = 560

function clampWidth(width: number): number {
  if (!Number.isFinite(width)) return INSPECTOR_DEFAULT_WIDTH
  return Math.min(INSPECTOR_MAX_WIDTH, Math.max(INSPECTOR_MIN_WIDTH, Math.round(width)))
}

function loadLayout(): Partial<LayoutPayload> | null {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY)
    if (raw === null) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { version?: unknown }).version === 1
    ) {
      return (parsed as { payload: Partial<LayoutPayload> }).payload ?? null
    }
  } catch {
    /* unreadable layout falls back to defaults */
  }
  return null
}

let saveTimer: ReturnType<typeof setTimeout> | undefined

function persistLayout(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const state = useWorkspaceUiStore.getState()
    if (!state.hydrated) return
    try {
      localStorage.setItem(
        LAYOUT_KEY,
        JSON.stringify({
          version: 1,
          savedAt: Date.now(),
          payload: {
            focusMode: state.focusMode,
            selectedProjectId: state.selectedProjectId,
            inspectorOpen: state.inspectorOpen,
            inspectorTab: state.inspectorTab,
            inspectorArtifactId: state.inspectorArtifactId,
            inspectorWidth: state.inspectorWidth,
          },
        }),
      )
    } catch {
      /* quota/private mode — layout simply is not remembered */
    }
  }, 250)
}

export const useWorkspaceUiStore = create<WorkspaceUiState>()((set) => ({
  hydrated: false,
  focusMode: false,
  selectedProjectId: null,
  inspectorOpen: false,
  inspectorTab: 'canvas',
  inspectorArtifactId: null,
  inspectorWidth: INSPECTOR_DEFAULT_WIDTH,

  initialize: () => {
    const saved = loadLayout()
    set({
      hydrated: true,
      focusMode: saved?.focusMode === true,
      selectedProjectId: saved?.selectedProjectId ?? null,
      inspectorOpen: saved?.inspectorOpen === true,
      inspectorTab: saved?.inspectorTab === 'context' ? 'context' : 'canvas',
      inspectorArtifactId: saved?.inspectorArtifactId ?? null,
      inspectorWidth: clampWidth(saved?.inspectorWidth ?? INSPECTOR_DEFAULT_WIDTH),
    })
  },

  setFocusMode: (on) => set({ focusMode: on }),
  toggleFocusMode: () => set((state) => ({ focusMode: !state.focusMode })),
  setSelectedProject: (projectId) => set({ selectedProjectId: projectId }),

  openInspector: (options) =>
    set((state) => ({
      inspectorOpen: true,
      inspectorTab: options?.tab ?? state.inspectorTab,
      inspectorArtifactId:
        options?.artifactId !== undefined ? options.artifactId : state.inspectorArtifactId,
    })),

  closeInspector: () => set({ inspectorOpen: false }),

  setInspectorTab: (tab) => set({ inspectorTab: tab }),

  setInspectorArtifact: (artifactId) => set({ inspectorArtifactId: artifactId }),

  setInspectorWidth: (width) => set({ inspectorWidth: clampWidth(width) }),

  resetInspectorWidth: () => set({ inspectorWidth: INSPECTOR_DEFAULT_WIDTH }),
}))

useWorkspaceUiStore.subscribe(() => {
  if (useWorkspaceUiStore.getState().hydrated) persistLayout()
})

/** Test-only: reset store (and optionally storage) for a fresh run. */
export function resetWorkspaceUiForTests(options: { keepStorage?: boolean } = {}): void {
  if (!options.keepStorage) {
    try {
      localStorage.removeItem(LAYOUT_KEY)
    } catch {
      /* ignore */
    }
  }
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  useWorkspaceUiStore.setState({
    hydrated: false,
    focusMode: false,
    selectedProjectId: null,
    inspectorOpen: false,
    inspectorTab: 'canvas',
    inspectorArtifactId: null,
    inspectorWidth: INSPECTOR_DEFAULT_WIDTH,
  })
}
