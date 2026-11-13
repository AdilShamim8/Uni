import { useEffect, useState } from 'react'
import { History, Loader2 } from 'lucide-react'
import { useServerSessionStore } from '@/state/serverSessionStore'

/**
 * RF-066 — the server memory audit journal viewer (T016): the
 * append-only record of every change to one employee's memory, loaded
 * from the journal service. Entries are read-only here; the revert
 * action lands on top of this viewer (RF-067).
 */
export function MemoryJournalViewer({ employeeId }: { employeeId: string }) {
  const journal = useServerSessionStore((state) => state.serverMemoryJournal)
  const loading = useServerSessionStore((state) => state.serverMemoryJournalLoading)
  const error = useServerSessionStore((state) => state.serverMemoryJournalError)
  const loadServerMemoryJournal = useServerSessionStore((state) => state.loadServerMemoryJournal)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (open) void loadServerMemoryJournal(employeeId)
  }, [open, employeeId, loadServerMemoryJournal])

  const entries = journal[employeeId] ?? []

  return (
    <section aria-label="Server memory journal" className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-1.5 px-1 text-[11.5px] font-medium text-ink-faint transition-colors hover:text-ink-soft"
      >
        <History size={12} />
        {open ? 'Hide change history' : 'Show change history'}
      </button>

      {open && (
        <div className="mt-2 rounded-[12px] border border-line bg-panel px-3.5 py-3">
          {loading && (
            <p className="flex items-center gap-2 text-xs text-ink-faint">
              <Loader2 size={12} className="animate-spin" />
              Loading journal…
            </p>
          )}
          {!loading && error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          {!loading && !error && entries.length === 0 && (
            <p className="text-xs text-ink-faint">
              No changes recorded yet — every add, edit, and delete lands here.
            </p>
          )}
          {!loading && entries.length > 0 && (
            <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto" aria-label="Journal entries">
              {entries.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-[8px] border border-line bg-raised px-3 py-2"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-ink-faint">
                    <span className="font-medium text-ink-soft">{entry.kind}</span>
                    <span>
                      by {entry.actor}
                      {entry.via ? ` · ${entry.via}` : ''}
                    </span>
                    <span>{new Date(entry.createdAt).toLocaleString()}</span>
                    {entry.canRevert ? (
                      <span className="rounded-[5px] bg-subtle px-1.5 py-0.5 text-[10.5px] text-ink-soft">
                        revertible
                      </span>
                    ) : (
                      entry.revertUnavailableReason && (
                        <span className="text-[10.5px]">{entry.revertUnavailableReason}</span>
                      )
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-ink-soft">
                    {entry.diff}
                  </p>
                  <p className="mt-0.5 text-[10.5px] text-ink-faint">
                    +{entry.added} −{entry.removed} characters
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
