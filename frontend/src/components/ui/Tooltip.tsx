import { useLayoutEffect, useRef, type ReactElement, type ReactNode } from 'react'

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
 *
 * Positioning: the bubble is centered on its trigger, but a purely centered
 * bubble clips off-screen when the trigger sits near a viewport edge — on a
 * 390px phone the composer's "Attach files" hint started 60px left of the
 * screen and the "temporary chat" hint ran 65px past the right edge. A
 * pre-paint clamp shifts the bubble back inside an 8px margin (re-clamped on
 * resize), and a viewport-capped max-width lets extra-long labels wrap
 * instead of slicing mid-word.
 */
export function Tooltip({ label, children, side = 'top', className = '' }: TooltipProps) {
  const tipRef = useRef<HTMLSpanElement>(null)
  const wrapRef = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const tip = tipRef.current
    const wrap = wrapRef.current
    if (!tip || !wrap) return
    const clamp = () => {
      // Reset before measuring so the clamp sees the natural centered box.
      tip.style.setProperty('--tip-shift', '0px')
      const rect = tip.getBoundingClientRect()
      if (rect.width === 0) return // jsdom and other no-layout environments
      const vw = window.innerWidth
      let shift = 0
      if (rect.right > vw - 8) shift = vw - 8 - rect.right
      if (rect.left + shift < 8) shift = 8 - rect.left
      if (shift !== 0) tip.style.setProperty('--tip-shift', `${shift.toFixed(1)}px`)
    }
    clamp()
    // A mount-time measurement can go stale (webfonts load after mount and
    // change the bubble's wrapped width), so re-clamp whenever the tooltip
    // is about to become visible — fonts and layout are final by then — and
    // when the viewport resizes.
    wrap.addEventListener('pointerenter', clamp)
    wrap.addEventListener('focusin', clamp)
    window.addEventListener('resize', clamp)
    return () => {
      wrap.removeEventListener('pointerenter', clamp)
      wrap.removeEventListener('focusin', clamp)
      window.removeEventListener('resize', clamp)
    }
  }, [label])

  return (
    <span ref={wrapRef} className={`group relative inline-flex ${className}`}>
      {children}
      <span
        ref={tipRef}
        role="tooltip"
        style={{ transform: 'translateX(calc(-50% + var(--tip-shift, 0px)))' }}
        className={`pointer-events-none absolute left-1/2 z-50 w-max max-w-[calc(100vw-1rem)] text-center whitespace-normal rounded-lg bg-inverse px-2 py-1 text-xs font-medium text-ink-inverse opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 ${
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
  tone?: 'neutral' | 'accent' | 'warning' | 'success'
  className?: string
}

export function Badge({ children, tone = 'neutral', className = '' }: BadgeProps) {
  const toneClass =
    tone === 'accent'
      ? 'bg-accent-soft text-accent'
      : tone === 'warning'
        ? 'bg-warning-soft text-warning'
        : tone === 'success'
          ? 'bg-success-soft text-success'
          : 'bg-subtle text-ink-soft'
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${toneClass} ${className}`}
    >
      {children}
    </span>
  )
}
