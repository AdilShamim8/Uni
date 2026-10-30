import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { FREE_ROUTES, type FreeRoute } from './freeModels'
import { Button } from '@/components/ui/Button'

/**
 * The free-models hub — the $0 on-ramp, front and center.
 *
 * Every route below costs nothing to start: real free tiers, rotating
 * `:free` models, or the user's own machine. One tap on "Use this
 * route" opens the provider form pre-filled — label, kind, endpoint,
 * and starter models — so a beginner goes from zero to a live
 * premium-style chat without paying anything or hunting for docs.
 *
 * The hub shows alongside the provider list (never inside the create
 * form) and collapses after the first few routes to keep the section
 * scannable.
 */

/** Routes shown before the grid collapses; beyond this a toggle appears. */
const ROUTES_PREVIEW = 4

export function FreeModelsHub({ onUseRoute }: { onUseRoute: (route: FreeRoute) => void }) {
  const [expanded, setExpanded] = useState(false)
  const hidden = FREE_ROUTES.length - ROUTES_PREVIEW
  const visible = expanded ? FREE_ROUTES : FREE_ROUTES.slice(0, ROUTES_PREVIEW)

  return (
    <section
      aria-label="Free routes"
      className="rounded-xl border border-success/35 bg-success-soft/40 p-4"
    >
      <div className="flex items-start gap-2.5">
        <Sparkles size={16} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Start at $0</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
            Uni is free, and so are these routes — real free tiers, rotating{' '}
            <span className="font-medium">:free</span> models, and local servers on your own
            machine. One tap fills in everything; you only paste a key (or nothing at all, for
            local).
          </p>
        </div>
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {visible.map((route) => (
          <li
            key={route.id}
            className="flex flex-col gap-2 rounded-xl border border-line bg-raised p-3"
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-[13px] font-semibold tracking-tight text-ink">{route.label}</p>
              {route.local ? (
                <span className="rounded-full bg-subtle px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                  local
                </span>
              ) : (
                <span className="rounded-full bg-success-soft px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-success">
                  free tier
                </span>
              )}
            </div>
            <p className="text-xs font-medium leading-relaxed text-ink-soft">{route.headline}</p>
            <p className="text-[11px] leading-relaxed text-ink-faint">{route.limits}</p>
            <div className="flex flex-wrap gap-1" aria-label={`${route.label} starter models`}>
              {route.models.slice(0, 3).map((model) => (
                <span
                  key={model.id}
                  className="rounded-full border border-line px-2 py-0.5 text-[10.5px] font-medium text-ink-soft"
                >
                  {model.label}
                </span>
              ))}
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="mt-auto self-start"
              aria-label={`Use the ${route.label} route`}
              onClick={() => onUseRoute(route)}
            >
              Use this route
            </Button>
          </li>
        ))}
      </ul>

      {hidden > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
          className="press mt-2.5 rounded-full border border-dashed border-line px-3 py-1.5 text-xs font-medium text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
        >
          {expanded ? 'Show fewer routes' : `+${hidden} more free route${hidden === 1 ? '' : 's'}`}
        </button>
      )}
    </section>
  )
}
