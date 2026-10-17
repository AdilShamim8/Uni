import { useEffect, useRef, type ReactNode } from 'react'
import { useAppStore } from '@/state/store'
import { Sidebar } from '@/features/chat/Sidebar'

/**
 * Application shell: desktop sidebar + routed main surface, plus the mobile
 * navigation drawer.
 *
 * The mobile drawer is a proper modal: it is labelled, focus is trapped
 * while open, Escape closes it, focus returns to the trigger, the page
 * behind is inert, and body scrolling is locked (audit D3).
 */
export function AppShell({ children }: { children: ReactNode }) {
  const mobileSidebarOpen = useAppStore((state) => state.ui.mobileSidebarOpen)
  const setUi = useAppStore((state) => state.setUi)
  const drawerRef = useRef<HTMLDivElement>(null)
  const mainRef = useRef<HTMLElement>(null)

  const closeDrawer = () => setUi({ mobileSidebarOpen: false })

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
      {/* Desktop sidebar (static, collapsible) */}
      <div className="hidden h-full lg:block">
        <Sidebar />
      </div>

      {/* Mobile navigation drawer — scrim + sliding material panel */}
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
            aria-label="Navigation"
            className="safe-left absolute inset-y-0 left-0 flex w-[min(19rem,85vw)] flex-col border-r border-line bg-mat-sidebar shadow-raised"
            style={{ animation: 'universe-drawer-in var(--motion-normal) var(--ease-standard) both' }}
          >
            <Sidebar forceExpanded />
          </div>
          <style>{`@keyframes universe-drawer-in { from { transform: translateX(-24px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>
        </div>
      )}

      <main ref={mainRef} className="flex min-w-0 flex-1 flex-col">
        {children}
      </main>
    </div>
  )
}
