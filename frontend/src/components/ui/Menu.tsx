import {
  cloneElement,
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react'
import { Check } from 'lucide-react'

interface MenuContextValue {
  close: () => void
}

const MenuContext = createContext<MenuContextValue | null>(null)

export interface MenuProps {
  /** A single button element; receives open/aria wiring. */
  trigger: ReactElement
  children: ReactNode
  align?: 'start' | 'end'
  /** Preferred open direction relative to the trigger. */
  direction?: 'down' | 'up'
  width?: string
  label?: string
}

interface TriggerWiring {
  ref: React.Ref<HTMLButtonElement>
  onClick: () => void
  'aria-haspopup': 'menu'
  'aria-expanded': boolean
}

/**
 * Lightweight dropdown menu: click or keyboard toggle, ArrowUp/Down
 * navigation, Escape closes and restores focus to the trigger.
 *
 * Positioning is collision-aware: the preferred direction flips when the
 * panel would overflow the viewport, and the panel scrolls internally past a
 * max height, so opening a menu can never push content out of view.
 *
 * The panel uses the translucent menu material (opaque fallback built in)
 * and closes itself when another surface (e.g. a dialog) opens on top.
 */
export function Menu({
  trigger,
  children,
  align = 'end',
  direction = 'down',
  width = 'w-56',
  label,
}: MenuProps) {
  const [open, setOpen] = useState(false)
  // Effective direction may flip after measuring the rendered panel.
  const [effectiveDirection, setEffectiveDirection] = useState(direction)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    // Close when focus moves into a modal surface (e.g. a dialog opened
    // from this menu) so interactive layers never stack visually.
    const onFocusIn = (event: FocusEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [open])

  // Collision handling: measure the freshly rendered panel and flip its
  // direction when it would extend past the viewport edge. Runs before
  // paint so the user never sees the overflow. Also caps the height so
  // long menus scroll instead of leaving the screen.
  useLayoutEffect(() => {
    if (!open || !menuRef.current) return
    const panel = menuRef.current
    const rect = panel.getBoundingClientRect()
    const viewport = window.innerHeight
    // Environments without layout (jsdom) report all-zero rects — keep the
    // preferred direction instead of "flipping" on fake geometry.
    const hasLayout = rect.width > 0 || rect.height > 0 || rect.top !== 0 || rect.bottom !== 0
    if (hasLayout) {
      let next = direction
      if (direction === 'down' && rect.bottom > viewport - 8) {
        // Would overflow the bottom — flip when there is more room above.
        if (viewport - rect.bottom > rect.height / 2 || rect.top > rect.height + 8) {
          next = 'up'
        }
      } else if (direction === 'up' && rect.top < 8) {
        next = 'down'
      }
      setEffectiveDirection(next)

      const maxHeight = Math.min(360, viewport - 24)
      if (rect.height > maxHeight) {
        panel.style.maxHeight = `${maxHeight}px`
        panel.style.overflowY = 'auto'
      }
    }

    // Focus without scrolling: the panel is already placed inside the
    // viewport, and a native scroll-into-view here could programmatically
    // scroll an overflow-hidden ancestor (the D1 defect).
    panel
      .querySelector<HTMLElement>('[role^="menuitem"]:not([disabled])')
      ?.focus({ preventScroll: true })
  }, [open, direction])

  function handleMenuKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(
        '[role^="menuitem"]:not([disabled])',
      ) ?? [],
    )
    if (items.length === 0) return
    const index = items.indexOf(document.activeElement as HTMLElement)
    const next =
      event.key === 'ArrowDown'
        ? (index + 1 + items.length) % items.length
        : (index - 1 + items.length) % items.length
    items[next].focus({ preventScroll: true })
  }

  const close = () => setOpen(false)

  const wiring: TriggerWiring = {
    ref: triggerRef,
    onClick: () => setOpen((value) => !value),
    'aria-haspopup': 'menu',
    'aria-expanded': open,
  }

  return (
    <div ref={containerRef} className="relative">
      {/* The trigger is always one of our own button components, which
          forward refs and spread the wiring props onto a native button. */}
      {cloneElement(trigger, wiring)}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={handleMenuKeyDown}
          className={`material pop-in ${
            effectiveDirection === 'up'
              ? 'pop-in-up bottom-[calc(100%+6px)]'
              : 'top-[calc(100%+6px)]'
          } absolute z-40 ${align === 'end' ? 'right-0' : 'left-0'} ${width} rounded-group border border-line bg-mat-menu p-1.5 shadow-raised`}
        >
          <MenuContext.Provider value={{ close }}>{children}</MenuContext.Provider>
        </div>
      )}
    </div>
  )
}

export interface MenuItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
  danger?: boolean
  /** Right-aligned hint text (e.g. "Unavailable"). */
  hint?: string
  /** Right-aligned keyboard shortcut, hidden from screen readers. */
  shortcut?: string
  /** Secondary line under the label (e.g. what a tool does). */
  description?: string
  /**
   * Marks the item as selectable. `checkbox` fits multi-select toggles
   * (tools); `radio` fits single-select groups (models). Renders the proper
   * ARIA role instead of hanging aria-checked off a plain menuitem.
   */
  selection?: 'checkbox' | 'radio'
  /** Checked state — only valid together with `selection`. */
  selected?: boolean
  children: ReactNode
}

export function MenuItem({
  icon,
  danger,
  hint,
  shortcut,
  description,
  selection,
  selected,
  className = '',
  onClick,
  children,
  ...props
}: MenuItemProps) {
  const context = useContext(MenuContext)
  const role = selection ? `menuitem${selection}` : 'menuitem'
  return (
    <button
      type="button"
      role={role}
      aria-checked={selection ? (selected ?? false) : undefined}
      className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 ${description ? 'py-2' : 'py-2'} text-left text-sm transition-colors disabled:pointer-events-none disabled:opacity-50 ${
        danger ? 'text-danger hover:bg-danger-soft' : 'text-ink hover:bg-subtle'
      } ${className}`}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) context?.close()
      }}
      {...props}
    >
      {icon && <span className="shrink-0 opacity-70">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{children}</span>
        {description && (
          <span className="mt-0.5 block truncate text-xs font-normal text-ink-faint">
            {description}
          </span>
        )}
      </span>
      {selected && <Check size={14} className="shrink-0 text-accent" aria-hidden="true" />}
      {hint && <span className="shrink-0 text-xs text-ink-faint">{hint}</span>}
      {shortcut && (
        <span aria-hidden="true" className="shrink-0 text-xs text-ink-faint">
          {shortcut}
        </span>
      )}
    </button>
  )
}
