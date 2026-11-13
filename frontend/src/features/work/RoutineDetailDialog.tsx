import { useEffect, useState } from 'react'
import { Pencil } from 'lucide-react'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerRoutine, ServerRoutineRun } from '@/services/api/serverRoutines'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { describeSchedule } from './schedulePreview'

/**
 * T033 — the routine detail dialog: the routine's schedule in plain
 * words, its catch-up policy, and the honest run history (each fire
 * with its terminal status and output; skipped fires say why).
 */

const STATUS_TONE: Record<ServerRoutineRun['status'], string> = {
  pending: 'text-ink-faint',
  running: 'text-accent',
  complete: 'text-success',
  stopped: 'text-ink-soft',
  error: 'text-danger',
  skipped: 'text-ink-faint',
}

export function RoutineDetailDialog({
  routine,
  onClose,
  onEdit,
}: {
  routine: ServerRoutine | null
  onClose: () => void
  /** RF-063 — when provided, the footer offers Edit for this routine. */
  onEdit?: (routine: ServerRoutine) => void
}) {
  const runs = useServerSessionStore((state) => state.serverRoutineRuns)
  const [failuresOnly, setFailuresOnly] = useState(false)
  const runsLoading = useServerSessionStore((state) => state.serverRoutineRunsLoading)
  const openDetail = useServerSessionStore((state) => state.openServerRoutineDetail)
  const closeDetail = useServerSessionStore((state) => state.closeServerRoutineDetail)

  useEffect(() => {
    if (routine) void openDetail(routine.id)
    else closeDetail()
  }, [routine, openDetail, closeDetail])

  function handleClose() {
    closeDetail()
    onClose()
  }

  if (!routine) return null

  // RF-064 — with up to 100 runs per routine, a failures-only view is
  // the fast path to what went wrong.
  const visibleRuns = failuresOnly
    ? runs.filter((run) => run.status === 'error' || run.status === 'skipped')
    : runs

  return (
    <Dialog
      open={routine !== null}
      onClose={handleClose}
      title={routine.name}
      size="lg"
      footer={
        <>
          {onEdit && routine && (
            <Button variant="secondary" onClick={() => onEdit(routine)}>
              <Pencil size={13} />
              Edit
            </Button>
          )}
          <Button variant="ghost" onClick={handleClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13px] leading-relaxed text-ink-soft">{routine.prompt}</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-ink-faint">
          {routine.employeeName !== null && (
            <span className="rounded-[6px] bg-subtle px-1.5 py-0.5 text-ink-soft">
              runs as {routine.employeeName}
            </span>
          )}
          <span>{describeSchedule(routine.schedule)}</span>
          {routine.catchUpMinutes > 0 && (
            <span>catch-up {routine.catchUpMinutes}m after downtime</span>
          )}
          {routine.archived && <span className="font-medium text-ink-soft">archived</span>}
          <code className="rounded-[6px] bg-subtle px-1.5 py-0.5">{routine.schedule}</code>
          <span>
            {routine.catchUpMinutes > 0
              ? `catch-up ${routine.catchUpMinutes}m after downtime`
              : 'missed fires are skipped (no catch-up)'}
          </span>
          {routine.nextFireAt !== null && (
            <span>next {new Date(routine.nextFireAt).toLocaleString()}</span>
          )}
          {routine.lastFireAt !== null && (
            <span>last fired {new Date(routine.lastFireAt).toLocaleString()}</span>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
            Run history
          </h4>
          {!runsLoading && runs.length > 0 && (
            <label className="mb-1 flex w-fit cursor-pointer items-center gap-1.5 text-[12px] text-ink-faint">
              <input
                type="checkbox"
                checked={failuresOnly}
                onChange={(event) => setFailuresOnly(event.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--color-accent)]"
              />
              Failures only
            </label>
          )}
          {runsLoading && (
            <p className="flex items-center gap-2 text-[13px] text-ink-faint">
              <Spinner size={14} />
              Loading runs…
            </p>
          )}
          {!runsLoading && runs.length === 0 && (
            <p className="text-[13px] text-ink-faint">
              No fires recorded yet. The first one appears here with its full output.
            </p>
          )}
          {!runsLoading && runs.length > 0 && visibleRuns.length === 0 && (
            <p className="text-[13px] text-ink-faint">
              No failed fires — every recorded run completed or is pending.
            </p>
          )}
          <ul className="flex max-h-[40vh] flex-col gap-2 overflow-y-auto" aria-label="Routine runs">
            {visibleRuns.map((run) => (
              <li key={run.id} className="rounded-group border border-line bg-panel px-3 py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="text-[12.5px] text-ink-soft">
                    scheduled {new Date(run.scheduledFor).toLocaleString()}
                  </span>
                  <span className={`text-[12px] font-medium ${STATUS_TONE[run.status]}`}>
                    {run.status}
                  </span>
                </div>
                {run.outputText && (
                  <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-control bg-subtle px-2.5 py-2 text-[12.5px] leading-relaxed text-ink">
                    {run.outputText}
                  </pre>
                )}
                {run.errorMessage && (
                  <p className="mt-1.5 text-[12px] text-danger">{run.errorMessage}</p>
                )}
                {!run.outputText && !run.errorMessage && run.status === 'skipped' && (
                  <p className="mt-1.5 text-[12px] text-ink-faint">
                    This minute was already claimed by an earlier fire — nothing duplicated.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[11.5px] leading-relaxed text-ink-faint">
          Fires execute in this routine's own unattended session: read-only tools, no shell,
          no writes, and never an interactive permission.
        </p>
      </div>
    </Dialog>
  )
}
