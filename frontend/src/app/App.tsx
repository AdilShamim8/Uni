import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { ThemeProvider } from '@/app/ThemeProvider'
import { AppShell } from '@/components/layout/AppShell'
import { ToastHost } from '@/components/ui/Toast'
import { useAppStore } from '@/state/store'
import { useAgentsStore } from '@/state/agentsStore'
import { useWorkStore } from '@/state/workStore'
import { useLibraryStore } from '@/state/libraryStore'
import { ChatPage } from '@/features/chat/ChatPage'
import { SearchDialog } from '@/features/chat/SearchDialog'
import { PreviewHost } from '@/features/previews/PreviewHost'
import { SettingsDialog } from '@/features/settings/SettingsDialog'
import { WorkPage } from '@/features/work/WorkPage'
import { AgentsPage } from '@/features/agents/AgentsPage'
import { LibraryPage } from '@/features/library/LibraryPage'

export function App() {
  const initialize = useAppStore((state) => state.initialize)
  const setUi = useAppStore((state) => state.setUi)
  const density = useAppStore((state) => state.preferences.density)
  const textSize = useAppStore((state) => state.preferences.textSize)
  const reducedTransparency = useAppStore((state) => state.preferences.reducedTransparency)
  const location = useLocation()

  useEffect(() => {
    initialize()
    // Workspace slices hydrate independently; a corrupt slice re-seeds
    // only itself and never touches chat data.
    useAgentsStore.getState().initialize()
    useWorkStore.getState().initialize()
    useLibraryStore.getState().initialize()
  }, [initialize])

  // Apply display preferences to the document root.
  useEffect(() => {
    const root = document.documentElement
    root.setAttribute('data-density', density)
    root.setAttribute('data-textsize', textSize)
  }, [density, textSize])

  // Translucent materials turn opaque when the user asks for it or when the
  // OS reports a reduced-transparency preference. The OS setting is tracked
  // live so the UI follows system changes without a reload.
  useEffect(() => {
    const root = document.documentElement
    const query = window.matchMedia?.('(prefers-reduced-transparency: reduce)')
    const apply = () => {
      const off = reducedTransparency || (query?.matches ?? false)
      root.setAttribute('data-transparency', off ? 'off' : 'on')
    }
    apply()
    if (query) {
      query.addEventListener('change', apply)
      return () => query.removeEventListener('change', apply)
    }
  }, [reducedTransparency])

  // Global shortcuts: Ctrl/Cmd+K opens conversation search;
  // Ctrl/Cmd+, opens Settings (the platform convention).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()
      if (key === 'k') {
        event.preventDefault()
        setUi({ searchOpen: true })
      } else if (key === ',') {
        event.preventDefault()
        setUi({ settingsOpen: true })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setUi])

  return (
    <ThemeProvider>
      <AppShell>
        <Routes location={location}>
          {/* Chat — existing routes preserved for compatibility */}
          <Route path="/" element={<ChatPage />} />
          <Route path="/c/:conversationId" element={<ChatPage />} />
          {/* Work — task briefs, demo execution, review */}
          <Route path="/work" element={<WorkPage />} />
          <Route path="/work/:taskId" element={<WorkPage />} />
          {/* Agents — reusable profiles and the personal assistant */}
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/agents/new" element={<AgentsPage />} />
          <Route path="/agents/:agentId" element={<AgentsPage />} />
          {/* Library — shared local artifacts and projects */}
          <Route path="/library" element={<LibraryPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
      <SearchDialog />
      <SettingsDialog />
      <PreviewHost />
      <ToastHost />
    </ThemeProvider>
  )
}
