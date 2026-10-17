import type { ReactNode } from 'react'

/**
 * iOS Settings-style inset grouped lists: a rounded card on the canvas,
 * rows separated by hairlines, an optional small-caps header above and a
 * quiet footer below. The group itself is transparent to screen readers —
 * pass `title` for a labelled region.
 */
export interface SettingsGroupProps {
  /** Small-caps label rendered above the card (also used as region label). */
  title?: string
  /** Quiet explanation rendered under the card. */
  footer?: ReactNode
  children: ReactNode
  className?: string
}

export function SettingsGroup({ title, footer, children, className = '' }: SettingsGroupProps) {
  return (
    <section aria-label={title} className={className}>
      {title && (
        <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">
          {title}
        </p>
      )}
      <div className="divide-y divide-line/70 overflow-hidden rounded-[12px] border border-line bg-raised shadow-[var(--shadow-soft)]">
        {children}
      </div>
      {footer && <p className="mt-1.5 px-3 text-xs leading-relaxed text-ink-faint">{footer}</p>}
    </section>
  )
}

/**
 * One row inside a SettingsGroup.
 *
 * - `inline` (default): label on the left, compact control (switch, value
 *   text, small button) on the right — the classic iOS settings row.
 * - `block`: the control renders under the label and stretches full width
 *   (segmented controls, text fields).
 */
export interface SettingsRowProps {
  label: string
  description?: string
  layout?: 'inline' | 'block'
  /** Trailing (inline) or full-width (block) control content. */
  children?: ReactNode
}

export function SettingsRow({ label, description, layout = 'inline', children }: SettingsRowProps) {
  if (layout === 'block') {
    return (
      <div className="px-3.5 py-3">
        <p className="text-sm font-medium text-ink">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{description}</p>
        )}
        {children && <div className="mt-2.5">{children}</div>}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-4 px-3.5 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">{description}</p>
        )}
      </div>
      {children && <div className="flex shrink-0 items-center">{children}</div>}
    </div>
  )
}
