import { useEffect, useState } from 'react'
import { History, Loader2, Undo2 } from 'lucide-react'
import { useServerSessionStore } from '@/state/serverSessionStore'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import type { ServerMemoryJournalEntry } from '@/services/api/serverEmployees'

/**
 * RF-066 — the server memory audit journal viewer (T016): the
 * append-only record of every change to one employee's memory, loaded
 * from the journal service. Entries are read-only here; the revert
 * action lands on top of this viewer (RF-067).
 */
/** RF-106 — coarse past labels for journal entries (title keeps the exact time). */
function describePast(instant: number, now = Date.now()): string {
  const minutes = Math.round((now - instant) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(instant).toLocaleDateString()
}

export function MemoryJournalViewer({ employeeId }: { employeeId: string }) {
  const journal = useServerSessionStore((state) => state.serverMemoryJournal)
  const loading = useServerSessionStore((state) => state.serverMemoryJournalLoading)
  const error = useServerSessionStore((state) => state.serverMemoryJournalError)
  const loadServerMemoryJournal = useServerSessionStore((state) => state.loadServerMemoryJournal)
  const revertEntry = useServerSessionStore((state) => state.revertServerMemoryJournalEntryFor)
  const [open, setOpen] = useState(false)
  // RF-098 — filter the audit trail by what happened.
  const [kindFilter, setKindFilter] = useState<'all' | 'created' | 'edited' | 'deleted'>('all')
  const [revertTarget, setRevertTarget] = useState<ServerMemoryJournalEntry | null>(null)

  useEffect(() => {
    if (open) void loadServerMemoryJournal(employeeId)
  }, [open, employeeId, loadServerMemoryJournal])

  const entries = (journal[employeeId] ?? []).filter(
    (entry) => kindFilter === 'all' || entry.kind === kindFilter,
  )

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

      <ConfirmDialog
        open={revertTarget !== null}
        title="Revert this change?"
        body={`The note returns to its previous content. The revert itself is journaled — you can undo it the same way.`}
        confirmLabel="Revert"
        destructive
        onConfirm={() => {
          if (!revertTarget) return
          const target = revertTarget
          setRevertTarget(null)
          void revertEntry(employeeId, target.id)
        }}
        onClose={() => setRevertTarget(null)}
      />
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
              {kindFilter === 'all'
                ? 'No changes recorded yet — every add, edit, and delete lands here.'
                : `No ${kindFilter} entries in this view.`}
            </p>
          )}
          {!loading && (journal[employeeId] ?? []).length > 0 && (
            <label className="mb-1.5 flex w-fit items-center gap-1.5 text-[11px] text-ink-faint">
              Show
              <select
                value={kindFilter}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === 'created' || value === 'edited' || value === 'deleted' || value === 'all') {
                    setKindFilter(value)
                  }
                }}
                className="rounded-[6px] border border-line bg-panel px-1.5 py-0.5 text-[11px] text-ink-soft"
              >
                <option value="all">all changes</option>
                <option value="created">added</option>
                <option value="edited">edits</option>
                <option value="deleted">deletions</option>
              </select>
            </label>
          )}
          {!loading && (journal[employeeId] ?? []).length >= 50 && (
            <p className="mb-1 text-[10.5px] text-ink-faint">
              Showing the latest {(journal[employeeId] ?? []).length} entries.
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
                    <span title={new Date(entry.createdAt).toLocaleString()}>{describePast(entry.createdAt)}</span>
                    {entry.canRevert ? (
                      <button
                        type="button"
                        aria-label={`Revert change from ${new Date(entry.createdAt).toLocaleString()}`}
                        onClick={() => setRevertTarget(entry)}
                        className="flex items-center gap-1 rounded-[5px] bg-subtle px-1.5 py-0.5 text-[10.5px] text-ink-soft transition-colors hover:text-ink"
                      >
                        <Undo2 size={10} />
                        Revert
                      </button>
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
