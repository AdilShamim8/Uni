import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name — required for icon-only buttons. */
  label: string
  size?: 'sm' | 'md'
  tone?: 'default' | 'danger' | 'accent'
  /** Renders as visually "on" (e.g. an active toggle). */
  active?: boolean
  children: ReactNode
}

const SIZE_CLASSES = {
  sm: 'h-7 w-7',
  md: 'h-9 w-9',
} as const

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', tone = 'default', active = false, className = '', children, ...props },
  ref,
) {
  const toneClass = active
    ? 'bg-accent-soft text-accent'
    : tone === 'danger'
      ? 'text-danger hover:bg-danger-soft'
      : tone === 'accent'
        ? 'text-accent hover:bg-accent-soft'
        : 'text-ink-soft hover:bg-subtle hover:text-ink'
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active || undefined}
      className={`min-touch inline-flex shrink-0 items-center justify-center rounded-control transition-[background-color,color] duration-[var(--motion-fast)] disabled:pointer-events-none disabled:opacity-50 ${SIZE_CLASSES[size]} ${toneClass} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
})
