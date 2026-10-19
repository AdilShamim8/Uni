import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { ActivityEntry } from '../threadModel'
import { formatClock } from '@/domain/timestamps'

/**
 * Collapsible plan/activity summary for one run — real statuses and
 * timestamps only, verbose detail tucked behind one disclosure.
 */
export function ActivityCard({ entry }: { entry: ActivityEntry }) {
  const [open, setOpen] = useState(entry.live)

  return (
    <div
      className={`rounded-group border bg-raised ${
        entry.live ? 'border-accent/40' : 'border-line'
      }`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-touch w-full items-center gap-2 px-4 py-2.5 text-left"
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            entry.live ? 'animate-pulse bg-accent' : 'bg-ink-faint/50'
          }`}
          aria-hidden="true"
        />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
          {entry.title}
          <span className="ml-1.5 font-normal text-ink-faint">
            {entry.lines.length} {entry.lines.length === 1 ? 'step' : 'steps'}
          </span>
        </span>
        <ChevronDown
          size={14}
          aria-hidden="true"
          className={`shrink-0 text-ink-faint transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <ol className="border-t border-line/70 px-4 py-2.5">
          {entry.lines.map((line) => (
            <li key={line.id} className="flex items-baseline gap-2.5 py-1">
              <span
                className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  line.tone === 'success'
                    ? 'bg-success'
                    : line.tone === 'accent'
                      ? 'bg-accent'
                      : 'bg-ink-faint/50'
                }`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] leading-snug text-ink-soft">
                  {line.label}
                </span>
                {line.detail && (
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-faint">
                    {line.detail}
                  </span>
                )}
              </span>
              <span className="shrink-0 text-[11px] tabular-nums text-ink-faint/80">
                {formatClock(line.at)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
