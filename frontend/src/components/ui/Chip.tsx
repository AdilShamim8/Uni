import type { ButtonHTMLAttributes, ReactNode } from 'react'

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode
  selected?: boolean
  /** Static chips (no onClick) render as spans. */
  children: ReactNode
}

export function Chip({ icon, selected = false, className = '', children, ...props }: ChipProps) {
  const base =
    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors'
  const state = selected
    ? 'border-accent bg-accent-soft text-accent'
    : props.disabled
      ? 'cursor-not-allowed border-line bg-transparent text-ink-faint'
      : 'border-line bg-raised text-ink-soft hover:bg-subtle hover:text-ink'

  if (!props.onClick) {
    return (
      <span className={`${base} ${state} ${className}`}>
        {icon}
        {children}
      </span>
    )
  }

  return (
    <button type="button" aria-pressed={selected} className={`${base} ${state} ${className}`} {...props}>
      {icon}
      {children}
    </button>
  )
}
