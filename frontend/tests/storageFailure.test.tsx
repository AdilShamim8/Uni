import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  flushLibraryPersistence,
  resetLibraryStoreForTests,
  useLibraryStore,
} from '@/state/libraryStore'
import { resetStoreForTests, useAppStore } from '@/state/store'

/**
 * Milestone 03 reliability: persistence must never be reported as saved
 * when the write actually failed. When localStorage rejects a write, the
 * user gets one honest warning instead of silent data loss.
 */
describe('storage failure honesty', () => {
  beforeEach(() => {
    resetStoreForTests()
    resetLibraryStoreForTests()
    useAppStore.getState().initialize()
    useLibraryStore.getState().initialize()
  })
  afterEach(() => {
    resetStoreForTests()
    resetLibraryStoreForTests()
    vi.restoreAllMocks()
  })

  it('warns once when the library write fails', async () => {
    const failing = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })

    useLibraryStore.getState().addArtifact({
      title: 'Big artifact',
      kind: 'notes',
      markdown: 'x',
    })
    flushLibraryPersistence()

    expect(failing).toHaveBeenCalled()
    // The warning is surfaced through the store's toast (async import).
    await vi.waitFor(() => {
      expect(useAppStore.getState().toast?.message).toMatch(
        /Local storage is full or blocked — library changes/,
      )
    })
    const firstToastId = useAppStore.getState().toast?.id

    // Second failure does not spam a second warning.
    useLibraryStore.getState().addArtifact({
      title: 'Another',
      kind: 'notes',
      markdown: 'y',
    })
    flushLibraryPersistence()
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(useAppStore.getState().toast?.id).toBe(firstToastId)
  })
})
