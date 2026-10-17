/**
 * Shared status pill — one visual treatment for task/run/connection states
 * across Work, Agents, and the shell. A single status source should drive
 * the shell, composer, and settings; this component renders whatever that
 * source says, consistently.
 */

export type StatusTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: 'bg-subtle text-ink-soft',
  accent: 'bg-accent-soft text-accent',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
}

export interface StatusPillProps {
  label: string
  tone?: StatusTone
  /** Optional dot inside the pill (e.g. live/paused indicators). */
  dot?: boolean
  className?: string
}

export function StatusPill({ label, tone = 'neutral', dot = false, className = '' }: StatusPillProps) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${TONE_CLASSES[tone]} ${className}`}
    >
      {dot && (
        <span
          aria-hidden="true"
          className={`h-[6px] w-[6px] rounded-full ${
            tone === 'accent'
              ? 'animate-pulse bg-accent'
              : tone === 'success'
                ? 'bg-success'
                : tone === 'danger'
                  ? 'bg-danger'
                  : tone === 'warning'
                    ? 'bg-warning'
                    : 'bg-ink-faint'
          }`}
        />
      )}
      {label}
    </span>
  )
}
