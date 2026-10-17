import {
  cloneElement,
  createContext,
  useContext,
  useEffect,
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
    const first = menuRef.current?.querySelector<HTMLElement>(
      '[role="menuitem"]:not([disabled])',
    )
    first?.focus()
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [open])

  function handleMenuKeyDown(event: React.KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
    )
    if (items.length === 0) return
    const index = items.indexOf(document.activeElement as HTMLElement)
    const next =
      event.key === 'ArrowDown'
        ? (index + 1 + items.length) % items.length
        : (index - 1 + items.length) % items.length
    items[next].focus()
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
          className={`material pop-in ${direction === 'up' ? 'pop-in-up bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]'} absolute z-40 ${align === 'end' ? 'right-0' : 'left-0'} ${width} rounded-group border border-line bg-mat-menu p-1.5 shadow-raised`}
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
  /** Renders a selection check on the right (e.g. active tool). */
  selected?: boolean
  children: ReactNode
}

export function MenuItem({
  icon,
  danger,
  hint,
  shortcut,
  description,
  selected,
  className = '',
  onClick,
  children,
  ...props
}: MenuItemProps) {
  const context = useContext(MenuContext)
  return (
    <button
      type="button"
      role="menuitem"
      aria-checked={selected}
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
