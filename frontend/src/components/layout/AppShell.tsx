import { useEffect, useRef, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Bot, Briefcase, Library as LibraryIcon, MessageSquare } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'
import { Sidebar } from '@/features/chat/Sidebar'
import { SplitWorkspace } from '@/components/layout/SplitWorkspace'
import { InspectorHost } from '@/components/layout/InspectorHost'

/**
 * Application shell: desktop sidebar + routed main surface, the mobile
 * bottom destination bar, and the mobile history drawer.
 *
 * The mobile drawer is a proper modal: it is labelled, focus is trapped
 * while open, Escape closes it, focus returns to the trigger, the page
 * behind is inert, and body scrolling is locked (audit D3).
 *
 * Focus mode (desktop) temporarily collapses the sidebar and keeps every
 * destination usable — it never clears drafts, selections, or panel state.
 */

const BOTTOM_DESTINATIONS = [
  { label: 'Chat', icon: <MessageSquare size={19} />, path: '/', match: (p: string) => p === '/' || p.startsWith('/c/') },
  { label: 'Work', icon: <Briefcase size={19} />, path: '/work', match: (p: string) => p.startsWith('/work') },
  { label: 'Agents', icon: <Bot size={19} />, path: '/agents', match: (p: string) => p.startsWith('/agents') },
  { label: 'Library', icon: <LibraryIcon size={19} />, path: '/library', match: (p: string) => p.startsWith('/library') || p.startsWith('/projects/') },
]

export function AppShell({ children }: { children: ReactNode }) {
  const mobileSidebarOpen = useAppStore((state) => state.ui.mobileSidebarOpen)
  const setUi = useAppStore((state) => state.setUi)
  const focusMode = useWorkspaceUiStore((state) => state.focusMode)
  const setFocusMode = useWorkspaceUiStore((state) => state.setFocusMode)
  const drawerRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const location = useLocation()
  const navigate = useNavigate()

  const closeDrawer = () => setUi({ mobileSidebarOpen: false })

  // Escape exits focus mode (Escape also closes dialogs first — this only
  // fires when nothing else consumed the key).
  useEffect(() => {
    if (!focusMode) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setFocusMode(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusMode, setFocusMode])

  useEffect(() => {
    if (!mobileSidebarOpen) return

    // Remember the trigger (top-bar menu button) to restore focus on close.
    const previouslyFocused = document.activeElement as HTMLElement | null

    const drawer = drawerRef.current
    const focusables = () =>
      Array.from(
        drawer?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      )

    // Move focus into the drawer (first primary action).
    requestAnimationFrame(() => {
      focusables()[0]?.focus({ preventScroll: true })
    })

    // Trap Tab navigation inside the drawer.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeDrawer()
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement as HTMLElement | null
      if (event.shiftKey && (active === first || !drawer?.contains(active))) {
        event.preventDefault()
        last.focus({ preventScroll: true })
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus({ preventScroll: true })
      }
    }

    // Lock document scrolling and make the background inert while the
    // drawer is open. `inert` is set via the DOM — React 18 has no typed
    // boolean support for it and stringifies falsy values.
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const main = mainRef.current
    main?.setAttribute('inert', '')

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = overflow
      main?.removeAttribute('inert')
      previouslyFocused?.focus({ preventScroll: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mobileSidebarOpen])

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas text-ink">
      {/* Desktop floating sidebar — inset from the viewport, rounded glass
          surface; the workspace keeps its own generous padding instead of
          sharing one continuous flat sidebar background. */}
      {!focusMode && (
        <div className="hidden h-full shrink-0 py-shell-inset pl-shell-inset lg:block">
          <Sidebar />
        </div>
      )}

      {/* Mobile navigation drawer — scrim + floating rounded material panel */}
      {mobileSidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-scrim"
            onClick={closeDrawer}
            aria-hidden="true"
          />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="History and tools"
            className="safe-left glass-float absolute bottom-3 left-3 top-3 flex w-[min(19rem,85vw)] flex-col overflow-hidden rounded-float border border-line/70 bg-mat-sidebar"
            style={{ animation: 'universe-drawer-in var(--motion-normal) var(--ease-standard) both' }}
          >
            <Sidebar forceExpanded />
          </div>
          <style>{`@keyframes universe-drawer-in { from { transform: translateX(-24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>
        </div>
      )}

      <main
        ref={mainRef}
        className="flex min-w-0 flex-1 flex-col pb-[calc(4.25rem+env(safe-area-inset-bottom))] lg:gap-0 lg:pb-shell-inset lg:pl-2 lg:pr-shell-inset lg:pt-shell-inset"
      >
        <SplitWorkspace
          panelLabel="Workspace panel"
          open={focusMode ? false : undefined}
          renderPanel={() => <InspectorHost />}
        >
          {children}
        </SplitWorkspace>
      </main>

      {/* Mobile floating destination bar — the four real destinations, no
          duplicates. A rounded glass pill inset from the viewport edges,
          grown to clear the iOS home indicator (safe area). */}
      <nav
        aria-label="Destinations"
        className="material safe-left safe-right fixed bottom-[calc(10px+env(safe-area-inset-bottom))] left-2.5 right-2.5 z-30 flex min-h-14 shrink-0 items-stretch rounded-[20px] border border-line/70 bg-mat-header shadow-float lg:hidden"
      >
        {BOTTOM_DESTINATIONS.map((destination) => {
          const active = destination.match(location.pathname)
          return (
            <button
              key={destination.label}
              type="button"
              onClick={() => navigate(destination.path)}
              aria-current={active ? 'page' : undefined}
              className={`press flex min-touch flex-1 flex-col items-center justify-center gap-0.5 px-1 transition-colors duration-[var(--motion-fast)] ${
                active ? 'text-accent' : 'text-ink-faint hover:text-ink-soft'
              }`}
            >
              {destination.icon}
              <span className="text-[10.5px] font-medium leading-none">
                {destination.label}
              </span>
            </button>
          )
        })}
      </nav>
    </div>
  )
}
