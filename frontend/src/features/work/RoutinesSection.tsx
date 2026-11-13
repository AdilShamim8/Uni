import { useEffect, useState } from 'react'
import { Archive, ArchiveRestore, CalendarClock, Pause, Pencil, Play, Plus, Trash2 } from 'lucide-react'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerRoutine } from '@/services/api/serverRoutines'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StatusPill } from '@/components/ui/StatusPill'
import { describeSchedule } from './schedulePreview'
import {
  EMPTY_ROUTINE_FORM,
  RoutineFormFields,
  effectiveSchedule,
  routineFormValid,
  type RoutineFormState,
} from './routineFormFields'
import { RoutineDetailDialog } from './RoutineDetailDialog'
import { EditRoutineDialog } from './EditRoutineDialog'

/**
 * T033 — the routines section on the server Work surface: scheduled
 * prompts that fire inside their own unattended read-only sessions.
 * Every action goes through the store slice; statuses are honest
 * (paused is paused, a failed create shows the server's reason).
 */

export function RoutinesSection() {
  const serverRoutines = useServerSessionStore((state) => state.serverRoutines)
  const serverRoutinesLoading = useServerSessionStore((state) => state.serverRoutinesLoading)
  const serverRoutinesError = useServerSessionStore((state) => state.serverRoutinesError)
  const loadServerRoutines = useServerSessionStore((state) => state.loadServerRoutines)
  const [showArchived, setShowArchived] = useState(false)
  const createServerRoutineFor = useServerSessionStore((state) => state.createServerRoutineFor)
  const setServerRoutinePausedFor = useServerSessionStore(
    (state) => state.setServerRoutinePausedFor,
  )
  const removeServerRoutineFor = useServerSessionStore((state) => state.removeServerRoutineFor)
  const editServerRoutineFor = useServerSessionStore((state) => state.editServerRoutineFor)
  const setServerRoutineArchivedFor = useServerSessionStore(
    (state) => state.setServerRoutineArchivedFor,
  )
  const serverEmployees = useServerSessionStore((state) => state.serverEmployees)
  const loadServerEmployees = useServerSessionStore((state) => state.loadServerEmployees)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ServerRoutine | null>(null)
  const [editTarget, setEditTarget] = useState<ServerRoutine | null>(null)
  const [detailTarget, setDetailTarget] = useState<ServerRoutine | null>(null)

  useEffect(() => {
    void loadServerRoutines(showArchived)
    void loadServerEmployees()
  }, [loadServerRoutines, loadServerEmployees, showArchived])

  return (
    <section aria-label="Server routines" className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
          <CalendarClock size={15} className="text-ink-faint" aria-hidden="true" />
          Routines
        </h3>
        <label className="mr-auto flex w-fit cursor-pointer items-center gap-1.5 text-[12px] text-ink-faint">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(event) => setShowArchived(event.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--color-accent)]"
            aria-label="Show archived routines"
          />
          Archived
        </label>
        <Button variant="secondary" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus size={14} />
          New routine
        </Button>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
        Prompts that run on a schedule (UTC) inside their own read-only sessions — no shell, no
        writes, no interactive permissions. Nothing fires while paused.
      </p>

      {serverRoutinesLoading && serverRoutines.length === 0 && (
        <p className="mt-3 text-[13px] text-ink-faint">Loading routines…</p>
      )}

      {serverRoutinesError && (
        <p role="alert" className="mt-3 rounded-control bg-danger/10 px-3 py-2 text-[13px] text-danger">
          {serverRoutinesError}
        </p>
      )}

      {serverRoutines.length === 0 && !serverRoutinesLoading && (
        <p className="mt-3 text-[13px] text-ink-faint">
          No routines yet — schedule one and the server runs it for you.
        </p>
      )}

      <ul className="mt-3 flex flex-col gap-2" aria-label="Server routines list">
        {serverRoutines.map((routine) => (
          <li
            key={routine.id}
            className="rounded-group border border-line bg-raised px-3.5 py-3"
          >
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setDetailTarget(routine)}
                className="min-w-0 flex-1 truncate text-left text-[14px] font-medium text-ink underline-offset-2 hover:underline"
              >
                {routine.name}
              </button>
              <div className="flex shrink-0 items-center gap-1.5">
                {routine.archived && <StatusPill label="Archived" tone="neutral" />}
                <StatusPill
                  label={routine.paused ? 'Paused' : 'Active'}
                  tone={routine.paused ? 'neutral' : 'accent'}
                />
              </div>
            </div>
            <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-soft">
              {routine.prompt}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-faint">
              {routine.employeeName !== null && (
                <span className="rounded-[6px] bg-subtle px-1.5 py-0.5 text-ink-soft">
                  runs as {routine.employeeName}
                </span>
              )}
              <span>{describeSchedule(routine.schedule)}</span>
              <code className="rounded-[6px] bg-subtle px-1.5 py-0.5">{routine.schedule}</code>
              {routine.catchUpMinutes > 0 && (
                <span>catch-up {routine.catchUpMinutes}m</span>
              )}
              {routine.nextFireAt !== null ? (
                <span>next {new Date(routine.nextFireAt).toLocaleString()}</span>
              ) : routine.paused ? null : (
                <span>no upcoming fire in the next 7 days</span>
              )}
              {routine.lastFireAt !== null && (
                <span>last fired {new Date(routine.lastFireAt).toLocaleString()}</span>
              )}
            </div>
            <div className="mt-2.5 flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => setEditTarget(routine)}>
                <Pencil size={13} />
                Edit
              </Button>
              {routine.archived ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void setServerRoutineArchivedFor(routine.id, false)}
                >
                  <ArchiveRestore size={13} />
                  Unarchive
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void setServerRoutineArchivedFor(routine.id, true)}
                >
                  <Archive size={13} />
                  Archive
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void setServerRoutinePausedFor(routine.id, !routine.paused)}
              >
                {routine.paused ? <Play size={13} /> : <Pause size={13} />}
                {routine.paused ? 'Resume' : 'Pause'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:bg-danger-soft"
                onClick={() => setDeleteTarget(routine)}
              >
                <Trash2 size={13} />
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <RoutineDetailDialog
        routine={detailTarget}
        onClose={() => setDetailTarget(null)}
        onEdit={(routine) => setEditTarget(routine)}
      />

      <EditRoutineDialog
        key={editTarget?.id ?? 'none'}
        routine={editTarget}
        employees={serverEmployees
          .filter((employee) => !employee.archived)
          .map((employee) => ({ id: employee.id, name: employee.name }))}
        onClose={() => setEditTarget(null)}
        onSave={async (routineId, patch) => {
          const ok = await editServerRoutineFor(routineId, patch)
          if (ok) {
            setEditTarget(null)
            // Keep an open detail view honest: swap in the saved row.
            if (detailTarget?.id === routineId) {
              const fresh = useServerSessionStore
                .getState()
                .serverRoutines.find((entry) => entry.id === routineId)
              if (fresh) setDetailTarget(fresh)
            }
          }
          return ok
        }}
      />

      <CreateRoutineDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        employees={serverEmployees
          .filter((employee) => !employee.archived)
          .map((employee) => ({ id: employee.id, name: employee.name }))}
        onCreate={async (input) => {
          const ok = await createServerRoutineFor(input)
          if (ok) setCreateOpen(false)
          return ok
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this routine?"
        body={
          deleteTarget
            ? `"${deleteTarget.name}" stops firing immediately and its run history is deleted. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete routine"
        destructive
        onConfirm={() => {
          if (deleteTarget) void removeServerRoutineFor(deleteTarget.id)
          setDeleteTarget(null)
        }}
        onClose={() => setDeleteTarget(null)}
      />
    </section>
  )
}

function CreateRoutineDialog({
  open,
  onClose,
  onCreate,
  employees,
}: {
  open: boolean
  onClose: () => void
  onCreate: (input: {
    name: string
    prompt: string
    schedule: string
    catchUpMinutes: number
    employeeId?: string | null
  }) => Promise<boolean>
  /** Non-archived employees offered for the soft pin. */
  employees: Array<{ id: string; name: string }>
}) {
  const [form, setForm] = useState<RoutineFormState>(EMPTY_ROUTINE_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!routineFormValid(form) || submitting) return
    setSubmitting(true)
    setError(null)
    const ok = await onCreate({
      name: form.name.trim(),
      prompt: form.prompt.trim(),
      schedule: effectiveSchedule(form),
      catchUpMinutes: Number.isFinite(Number(form.catchUp))
        ? Math.max(0, Number(form.catchUp))
        : 0,
      employeeId: form.employeeId || null,
    })
    setSubmitting(false)
    if (!ok) {
      setError('The server rejected this routine — check the schedule expression and try again.')
      return
    }
    setForm(EMPTY_ROUTINE_FORM)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New routine"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!routineFormValid(form) || submitting}
            onClick={() => void submit()}
          >
            {submitting ? 'Creating…' : 'Create routine'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <RoutineFormFields
          state={form}
          onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          employees={employees}
        />
        {error && (
          <p role="alert" className="text-[12.5px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
