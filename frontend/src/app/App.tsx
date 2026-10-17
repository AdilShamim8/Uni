import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '@/app/ThemeProvider'
import { AppShell } from '@/components/layout/AppShell'
import { ToastHost } from '@/components/ui/Toast'
import { useAppStore } from '@/state/store'
import { ChatPage } from '@/features/chat/ChatPage'
import { SearchDialog } from '@/features/chat/SearchDialog'
import { PreviewHost } from '@/features/previews/PreviewHost'
import { SettingsDialog } from '@/features/settings/SettingsDialog'

export function App() {
  const initialize = useAppStore((state) => state.initialize)
  const setUi = useAppStore((state) => state.setUi)
  const density = useAppStore((state) => state.preferences.density)
  const textSize = useAppStore((state) => state.preferences.textSize)
  const reducedTransparency = useAppStore((state) => state.preferences.reducedTransparency)

  useEffect(() => {
    initialize()
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

  // Global shortcut: Ctrl/Cmd+K opens conversation search.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setUi({ searchOpen: true })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [setUi])

  return (
    <ThemeProvider>
      <AppShell>
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/c/:conversationId" element={<ChatPage />} />
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
