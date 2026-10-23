import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, vi } from 'vitest'
import { App } from '@/app/App'
import { createMockAdapter } from '@/services/mock/mockChatAdapter'
import { resetStoreForTests, setChatAdapter, useAppStore } from '@/state/store'
import { resetAgentsStoreForTests } from '@/state/agentsStore'
import { resetWorkStoreForTests } from '@/state/workStore'
import { resetLibraryStoreForTests } from '@/state/libraryStore'
import { resetWorkspaceUiForTests } from '@/state/workspaceUiStore'
import { resetContextStoreForTests } from '@/state/contextStore'
import { resetCompareStoreForTests } from '@/state/compareStore'
import { resetPluginsStoreForTests, usePluginsStore } from '@/state/pluginsStore'
import { resetComposerDraftsForTests } from '@/features/chat/composerDrafts'
import { resetThreadDraftsForTests } from '@/features/conversation/threadDrafts'
import { useServerSessionStore } from '@/state/serverSessionStore'

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
    resetAgentsStoreForTests()
    resetWorkStoreForTests()
    resetLibraryStoreForTests()
    resetWorkspaceUiForTests()
    resetContextStoreForTests()
    resetCompareStoreForTests()
    resetComposerDraftsForTests()
    resetThreadDraftsForTests()
    resetPluginsStoreForTests()
    useServerSessionStore.getState().resetForTests()
    setChatAdapter(
      createMockAdapter({ chunkDelay: options.chunkDelay ?? 0, firstTokenDelay: 0 }),
    )
    useAppStore.getState().initialize()
    usePluginsStore.getState().initialize()
  })
  afterEach(() => {
    cleanup()
    resetStoreForTests()
    resetAgentsStoreForTests()
    resetWorkStoreForTests()
    resetLibraryStoreForTests()
    resetWorkspaceUiForTests()
    resetContextStoreForTests()
    resetCompareStoreForTests()
    resetComposerDraftsForTests()
    resetThreadDraftsForTests()
    resetPluginsStoreForTests()
    useServerSessionStore.getState().resetForTests()
  })
}

/** Simulate a page reload: keep storage, rebuild in-memory state. */
export function reloadForTests(): void {
  cleanup()
  resetStoreForTests({ keepStorage: true })
  useAppStore.getState().initialize()
}

/**
 * The app probes the server session at boot (GET /api/auth/get-session).
 * Fetch-mocking tests that render the whole app must serve that probe;
 * this wrapper answers it with a signed-out session and delegates every
 * other request to the test's own mock (so call assertions stay intact).
 */
export function sessionAwareFetch(mock: ReturnType<typeof vi.fn>): ReturnType<typeof vi.fn> {
  return vi.fn(async (url: string | URL, init?: RequestInit) => {
    if (String(url).includes('/api/auth/get-session')) {
      return new Response('null', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    return mock(url, init)
  })
}
