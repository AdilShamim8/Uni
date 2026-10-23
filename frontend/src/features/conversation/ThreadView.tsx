import { ArrowDown } from 'lucide-react'
import type { ThreadEntry } from './threadModel'
import { ThreadEntryView } from './ThreadEntryView'
import { useThreadScroll } from './useThreadScroll'
import { useTranscriptWindow } from './useTranscriptWindow'

/**
 * The shared thread container used by Work and employee surfaces: a
 * 720–800px reading column, reader-friendly auto-scroll, a jump-to-latest
 * affordance, and time-gap separators between quiet stretches — the same
 * reading behaviors as the Chat transcript. Long threads render through
 * the shared windowing hook so a long employee conversation costs a
 * bounded mount too (milestone 08, F15).
 */
export function ThreadView({
  entries,
  ariaLabel,
  onAnswerClarify,
  emptyState,
}: {
  entries: ThreadEntry[]
  ariaLabel: string
  onAnswerClarify?: (answer: string) => void
  emptyState?: React.ReactNode
}) {
  const lastKey = entries.length > 0 ? entries[entries.length - 1].entryId : 'empty'
  const { containerRef, nearBottom, handleScroll, jumpToLatest } = useThreadScroll(lastKey)
  const { start } = useTranscriptWindow({ containerRef, total: entries.length })

  if (entries.length === 0 && emptyState) {
    return <div className="min-h-0 flex-1 overflow-y-auto">{emptyState}</div>
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto"
        // Native scroll anchoring would also compensate prepended history,
        // doubling the hook's own compensation; the hook owns anchoring.
        style={{ overflowAnchor: 'none' }}
        role="log"
        aria-label={ariaLabel}
      >
        <ol className="mx-auto flex w-full max-w-column flex-col gap-[var(--gap-chat)] px-4 py-6">
          {entries.slice(start).map((entry, offset) => {
            const index = start + offset
            return (
              <li
                key={entry.entryId}
                data-window-item={index}
                className="message-in"
              >
                <ThreadEntryView
                  entry={entry}
                  isLast={index === entries.length - 1}
                  onAnswerClarify={onAnswerClarify}
                />
              </li>
            )
          })}
        </ol>
      </div>

      {!nearBottom && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-overlay px-3 py-1.5 text-xs font-medium text-ink shadow-soft transition-colors hover:bg-subtle"
        >
          <ArrowDown size={13} />
          Jump to latest
        </button>
      )}
    </div>
  )
}
