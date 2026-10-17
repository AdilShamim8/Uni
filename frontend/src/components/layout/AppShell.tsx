import type { ReactNode } from 'react'
import { useAppStore } from '@/state/store'
import { Sidebar } from '@/features/chat/Sidebar'

export function AppShell({ children }: { children: ReactNode }) {
  const mobileSidebarOpen = useAppStore((state) => state.ui.mobileSidebarOpen)
  const setUi = useAppStore((state) => state.setUi)

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-ink">
      {/* Desktop sidebar (static, collapsible) */}
      <div className="hidden h-full lg:block">
        <Sidebar />
      </div>

      {/* Mobile navigation drawer — scrim + sliding material panel */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-scrim"
            onClick={() => setUi({ mobileSidebarOpen: false })}
            aria-hidden="true"
          />
          <div
            className="safe-left absolute inset-y-0 left-0 w-[min(19rem,85vw)] border-r border-line bg-mat-sidebar shadow-raised"
            style={{ animation: 'universe-drawer-in var(--motion-normal) var(--ease-standard) both' }}
          >
            <Sidebar forceExpanded />
          </div>
          <style>{`@keyframes universe-drawer-in { from { transform: translateX(-24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>
        </div>
      )}

      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  )
}
