import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  resetWorkspaceUiForTests,
  useWorkspaceUiStore,
} from '@/state/workspaceUiStore'

/**
 * Phase B chat-surface mode: the explicit local/server choice for the
 * Chat destination. The mode must default to local, persist across
 * reloads, hydrate strictly (only the exact saved value 'server' counts
 * — anything else, including legacy payloads without the field, stays
 * local), and never auto-flip.
 */

const LAYOUT_KEY = 'universe:layout:v1'

function savedLayout(payload: Record<string, unknown>): void {
  localStorage.setItem(
    LAYOUT_KEY,
    JSON.stringify({ version: 1, savedAt: Date.now(), payload }),
  )
}

describe('workspaceUiStore — chat surface mode', () => {
  beforeEach(() => {
    resetWorkspaceUiForTests()
  })

  it('defaults to the local chat surface', () => {
    useWorkspaceUiStore.getState().initialize()
    expect(useWorkspaceUiStore.getState().chatMode).toBe('local')
  })

  it('setChatMode switches explicitly and reports the change', () => {
    useWorkspaceUiStore.getState().initialize()
    useWorkspaceUiStore.getState().setChatMode('server')
    expect(useWorkspaceUiStore.getState().chatMode).toBe('server')
    useWorkspaceUiStore.getState().setChatMode('local')
    expect(useWorkspaceUiStore.getState().chatMode).toBe('local')
  })

  it('persists the chosen mode and restores it after a reload', () => {
    useWorkspaceUiStore.getState().initialize()
    // The persist path debounces on a 250ms timer — drive it with fake
    // timers so the storage write is deterministic in the test.
    vi.useFakeTimers()
    useWorkspaceUiStore.getState().setChatMode('server')
    vi.advanceTimersByTime(300)
    vi.useRealTimers()
    expect(localStorage.getItem(LAYOUT_KEY)).toContain('"chatMode":"server"')

    // Simulated reload: fresh store hydrating from the same storage.
    resetWorkspaceUiForTests({ keepStorage: true })
    useWorkspaceUiStore.getState().initialize()
    expect(useWorkspaceUiStore.getState().chatMode).toBe('server')
  })

  it('hydrates a legacy layout payload (no chatMode field) as local', () => {
    savedLayout({ focusMode: true, inspectorOpen: false })
    useWorkspaceUiStore.getState().initialize()
    expect(useWorkspaceUiStore.getState().chatMode).toBe('local')
  })

  it('rejects corrupt chatMode values instead of adopting them', () => {
    savedLayout({ chatMode: 'cloud' })
    useWorkspaceUiStore.getState().initialize()
    expect(useWorkspaceUiStore.getState().chatMode).toBe('local')

    savedLayout({ chatMode: 42 })
    useWorkspaceUiStore.getState().initialize()
    expect(useWorkspaceUiStore.getState().chatMode).toBe('local')
  })
})
