import type { ReactElement, ReactNode } from 'react'

export interface TooltipProps {
  label: string
  children: ReactElement
  side?: 'top' | 'bottom'
  className?: string
}

/**
 * CSS-only tooltip: visible on hover and keyboard focus. Children that are
 * icon-only buttons already carry accessible names, so the tooltip is a
 * visual supplement rather than the accessible name.
 */
export function Tooltip({ label, children, side = 'top', className = '' }: TooltipProps) {
  return (
    <span className={`group relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg bg-inverse px-2 py-1 text-xs font-medium text-ink-inverse opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${
          side === 'top' ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]'
        }`}
      >
        {label}
      </span>
    </span>
  )
}

export interface BadgeProps {
  children: ReactNode
  tone?: 'neutral' | 'accent' | 'warning'
  className?: string
}

export function Badge({ children, tone = 'neutral', className = '' }: BadgeProps) {
  const toneClass =
    tone === 'accent'
      ? 'bg-accent-soft text-accent'
      : tone === 'warning'
        ? 'bg-warning-soft text-warning'
        : 'bg-subtle text-ink-soft'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${toneClass} ${className}`}
    >
      {children}
    </span>
  )
}
