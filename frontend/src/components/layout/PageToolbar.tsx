import type { ReactNode } from 'react'

/**
 * The shared destination toolbar: one compact 60px floating glass bar per
 * workspace surface. Every destination (Chat, Work, Agents, Library) uses
 * the same geometry — rounded material, quiet shadow, safe-area aware —
 * instead of full-width hairline headers. Icon actions inside a toolbar
 * are grouped into one small cluster surface by the callers (see
 * ToolbarGroup), never scattered across the bar.
 */
export function PageToolbar({ children }: { children: ReactNode }) {
  return (
    <header className="safe-left safe-right material sticky top-0 z-30 mx-2 flex h-toolbar shrink-0 items-center gap-2 rounded-[18px] border border-line/70 bg-mat-header px-2 shadow-soft sm:px-3 lg:mx-0">
      {children}
    </header>
  )
}

/**
 * A small grouped surface for related icon actions inside a toolbar —
 * one quiet cluster instead of scattered tiny icons.
 */
export function ToolbarGroup({ children }: { children: ReactNode }) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-[14px] border border-line/60 bg-subtle/50 p-1">
      {children}
    </div>
  )
}
