import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * Responsive details panel (m07, fixes F07).
 *
 * - Mobile (< 1024px): a REAL modal sheet — focus trap, Escape closes,
 *   focus returns to the opener, background scroll locked, aria-modal.
 * - Desktop (>= 1024px): a persistent docked complementary panel —
 *   non-modal by design, so it never falsely declares aria-modal;
 *   Escape still closes it as a convenience, and focus is not trapped.
 *
 * The breakpoint is tracked live, so resizing across the boundary
 * switches semantics correctly.
 */

const DESKTOP_QUERY = '(min-width: 1024px)'

function getFocusable(container: HTMLElement | null): HTMLElement[] {
  if (!container) return []
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.offsetParent !== null || element === document.activeElement)
}

export function InspectorPanel({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean
  onClose: () => void
  label: string
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const onCloseRef = useRef(onClose)
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia?.(DESKTOP_QUERY).matches,
  )

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const query = window.matchMedia(DESKTOP_QUERY)
    const listener = (event: MediaQueryListEvent) => setIsDesktop(event.matches)
    query.addEventListener('change', listener)
    return () => query.removeEventListener('change', listener)
  }, [])

  useEffect(() => {
    if (!open) return
    const modal = !isDesktop

    if (modal) {
      restoreRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
    }

    // Scroll lock only while behaving as a modal sheet.
    const previousOverflow = document.body.style.overflow
    if (modal) document.body.style.overflow = 'hidden'

    const panel = panelRef.current
    if (modal) {
      const focusables = getFocusable(panel)
      ;(focusables[0] ?? panel)?.focus()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (!modal || event.key !== 'Tab') return
      const list = getFocusable(panelRef.current)
      if (list.length === 0) {
        event.preventDefault()
        return
      }
      const first = list[0]
      const last = list[list.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      if (modal) {
        document.body.style.overflow = previousOverflow
        restoreRef.current?.focus?.()
      }
    }
  }, [open, isDesktop])

  if (!open) return null

  if (isDesktop) {
    // Persistent, non-modal docked panel — complementary semantics.
    return (
      <aside
        ref={panelRef}
        role="complementary"
        aria-label={label}
        className="absolute bottom-3 right-3 top-3 flex w-[21rem] flex-col overflow-hidden rounded-[22px] border border-line/70 bg-mat-sidebar shadow-float"
      >
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <p className="text-[13px] font-semibold text-ink">{label}</p>
          <button
            type="button"
            aria-label={`Close ${label}`}
            onClick={() => onCloseRef.current()}
            className="min-touch rounded-full p-1.5 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </aside>
    )
  }

  // Mobile: a real modal bottom sheet.
  return (
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-scrim"
        onClick={() => onCloseRef.current()}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        className="safe-left safe-right absolute bottom-0 left-0 right-0 flex max-h-[80dvh] flex-col overflow-hidden rounded-t-[22px] border border-line/70 bg-mat-sidebar shadow-float"
      >
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <p className="text-[13px] font-semibold text-ink">{label}</p>
          <button
            type="button"
            aria-label={`Close ${label}`}
            onClick={() => onCloseRef.current()}
            className="min-touch rounded-full p-1.5 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>
  )
}
