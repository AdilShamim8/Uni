import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach } from 'vitest'
import { App } from '@/app/App'
import { createMockAdapter } from '@/services/mock/mockChatAdapter'
import { resetStoreForTests, setChatAdapter, useAppStore } from '@/state/store'

/** Render the full app with an in-memory router. */
export function renderApp(initialEntry = '/'): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <App />
    </MemoryRouter>,
  )
}

/**
 * Standard setup for app-level tests: fresh store, fast deterministic
 * adapter, seeded demo data; auto-cleanup afterwards.
 */
export function setupAppTest(options: { chunkDelay?: number } = {}): void {
  beforeEach(() => {
    resetStoreForTests()
    setChatAdapter(
      createMockAdapter({ chunkDelay: options.chunkDelay ?? 0, firstTokenDelay: 0 }),
    )
    useAppStore.getState().initialize()
  })
  afterEach(() => {
    cleanup()
    resetStoreForTests()
  })
}

/** Simulate a page reload: keep storage, rebuild in-memory state. */
export function reloadForTests(): void {
  cleanup()
  resetStoreForTests({ keepStorage: true })
  useAppStore.getState().initialize()
}
