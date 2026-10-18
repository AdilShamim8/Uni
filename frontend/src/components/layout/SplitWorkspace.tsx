import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  INSPECTOR_MAX_WIDTH,
  INSPECTOR_MIN_WIDTH,
  useWorkspaceUiStore,
} from '@/state/workspaceUiStore'

/**
 * SplitWorkspace — main working column plus an optional right-hand inspector
 * panel (persistent Canvas / context), adapted from iPadOS split view.
 *
 * Desktop (≥1280px viewport): true side-by-side columns with a pointer- and
 * keyboard-resizable separator. Each column scrolls independently. Narrower
 * viewports never compress both columns past usability: the panel becomes a
 * full-height overlay sheet instead.
 *
 * Resizing: drag the separator, focus it and press ←/→ (±16px, Shift = ±48),
 * Home/End for min/max, or double-click / press Enter to reset to the default
 * width. The chosen width is remembered across reloads by workspaceUiStore.
 */

const SPLIT_BREAKPOINT_QUERY = '(min-width: 1280px)'
const STEP = 16
const LARGE_STEP = 48

function useSplitBreakpoint(): boolean {
  const [wide, setWide] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia(SPLIT_BREAKPOINT_QUERY).matches,
  )
  useEffect(() => {
    const query = window.matchMedia(SPLIT_BREAKPOINT_QUERY)
    const onChange = () => setWide(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])
  return wide
}

export interface SplitWorkspaceProps {
  /** Main column content (conversation, task, etc.). Scrolls independently. */
  children: ReactNode
  /** Inspector panel content. Only rendered while the panel is open. */
  renderPanel: () => ReactNode
  /** aria-label for the panel region, announced to assistive tech. */
  panelLabel: string
  /** Override for the persisted open state (e.g. focus mode collapses it). */
  open?: boolean
}

export function SplitWorkspace({ children, renderPanel, panelLabel, open: openOverride }: SplitWorkspaceProps) {
  const wide = useSplitBreakpoint()
  const storeOpen = useWorkspaceUiStore((state) => state.inspectorOpen)
  const inspectorOpen = openOverride !== undefined ? openOverride : storeOpen
  const inspectorWidth = useWorkspaceUiStore((state) => state.inspectorWidth)
  const setInspectorWidth = useWorkspaceUiStore((state) => state.setInspectorWidth)
  const resetInspectorWidth = useWorkspaceUiStore((state) => state.resetInspectorWidth)

  const containerRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const resizeFromClientX = useCallback(
    (clientX: number) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const width = rect.right - clientX
      setInspectorWidth(width)
    },
    [setInspectorWidth],
  )

  // Pointer resizing — pointer capture keeps the drag alive outside the
  // separator hit area; movement is clamped by the store.
  useEffect(() => {
    if (!dragging) return
    const onMove = (event: PointerEvent) => {
      resizeFromClientX(event.clientX)
    }
    const onUp = () => setDragging(false)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    document.body.style.cursor = 'col-resize'
    // Text selection during a drag is noise, not intent.
    const previousUserSelect = document.body.style.userSelect
    document.body.style.userSelect = 'none'
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = previousUserSelect
    }
  }, [dragging, resizeFromClientX])

  const onKeyDown = (event: React.KeyboardEvent) => {
    const step = event.shiftKey ? LARGE_STEP : STEP
    switch (event.key) {
      case 'ArrowLeft':
        event.preventDefault()
        setInspectorWidth(inspectorWidth + step)
        break
      case 'ArrowRight':
        event.preventDefault()
        setInspectorWidth(inspectorWidth - step)
        break
      case 'Home':
        event.preventDefault()
        setInspectorWidth(INSPECTOR_MIN_WIDTH)
        break
      case 'End':
        event.preventDefault()
        setInspectorWidth(INSPECTOR_MAX_WIDTH)
        break
      case 'Enter':
        event.preventDefault()
        resetInspectorWidth()
        break
      default:
        break
    }
  }

  if (!inspectorOpen) {
    return <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
  }

  const panel = (
    <aside
      aria-label={panelLabel}
      className="flex h-full min-h-0 flex-col border-l border-line bg-panel"
    >
      {renderPanel()}
    </aside>
  )

  // Narrow viewports: full-height overlay sheet, not two squeezed columns.
  if (!wide) {
    return (
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {children}
        <div className="absolute inset-0 z-20 flex justify-end">
          <div className="h-full w-full max-w-inspector bg-scrim sm:w-inspector sm:max-w-full">
            {panel}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="relative flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={`Resize ${panelLabel.toLowerCase()} (arrow keys, Enter resets)`}
        aria-valuenow={inspectorWidth}
        aria-valuemin={INSPECTOR_MIN_WIDTH}
        aria-valuemax={INSPECTOR_MAX_WIDTH}
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault()
          event.currentTarget.setPointerCapture?.(event.pointerId)
          setDragging(true)
        }}
        onDoubleClick={resetInspectorWidth}
        onKeyDown={onKeyDown}
        className={`group relative w-px shrink-0 cursor-col-resize bg-line outline-none transition-colors duration-[var(--motion-fast)] hover:bg-accent focus-visible:bg-accent ${
          dragging ? 'bg-accent' : ''
        }`}
      >
        <span
          aria-hidden="true"
          className="absolute inset-y-0 -left-2 -right-2 block"
        />
        <span
          aria-hidden="true"
          className={`absolute left-1/2 top-1/2 h-8 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity duration-[var(--motion-fast)] ${
            dragging ? 'bg-accent opacity-100' : 'bg-ink-faint opacity-0 group-hover:opacity-40'
          }`}
        />
      </div>
      <div
        style={{ width: inspectorWidth }}
        className="h-full min-h-0 shrink-0 transition-[width] duration-[var(--motion-fast)] motion-reduce:transition-none"
      >
        {panel}
      </div>
    </div>
  )
}
