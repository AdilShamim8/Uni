import { useEffect, useState } from 'react'
import { CalendarClock, Pause, Play, Plus, Trash2 } from 'lucide-react'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerRoutine } from '@/services/api/serverRoutines'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { StatusPill } from '@/components/ui/StatusPill'
import { TextField } from '@/components/ui/TextField'

/**
 * T033 — the routines section on the server Work surface: scheduled
 * prompts that fire inside their own unattended read-only sessions.
 * Every action goes through the store slice; statuses are honest
 * (paused is paused, a failed create shows the server's reason).
 */

const SCHEDULE_PRESETS: Array<{ value: string; label: string }> = [
  { value: '* * * * *', label: 'Every minute (test)' },
  { value: '0 * * * *', label: 'Hourly' },
  { value: '30 9 * * 1-5', label: 'Weekdays at 09:30 UTC' },
  { value: '0 17 * * 5', label: 'Fridays at 17:00 UTC' },
  { value: '0 9 1 * *', label: 'First of the month, 09:00 UTC' },
]

export function RoutinesSection() {
  const serverRoutines = useServerSessionStore((state) => state.serverRoutines)
  const serverRoutinesLoading = useServerSessionStore((state) => state.serverRoutinesLoading)
  const serverRoutinesError = useServerSessionStore((state) => state.serverRoutinesError)
  const loadServerRoutines = useServerSessionStore((state) => state.loadServerRoutines)
  const createServerRoutineFor = useServerSessionStore((state) => state.createServerRoutineFor)
  const setServerRoutinePausedFor = useServerSessionStore(
    (state) => state.setServerRoutinePausedFor,
  )
  const removeServerRoutineFor = useServerSessionStore((state) => state.removeServerRoutineFor)
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ServerRoutine | null>(null)

  useEffect(() => {
    void loadServerRoutines()
  }, [loadServerRoutines])

  return (
    <section aria-label="Server routines" className="mt-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
          <CalendarClock size={15} className="text-ink-faint" aria-hidden="true" />
          Routines
        </h3>
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
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">
                {routine.name}
              </span>
              <StatusPill
                label={routine.paused ? 'Paused' : 'Active'}
                tone={routine.paused ? 'neutral' : 'accent'}
              />
            </div>
            <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-ink-soft">
              {routine.prompt}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-faint">
              <code className="rounded-[6px] bg-subtle px-1.5 py-0.5">{routine.schedule}</code>
              {routine.catchUpMinutes > 0 && (
                <span>catch-up {routine.catchUpMinutes}m</span>
              )}
              {routine.lastFireAt !== null && (
                <span>last fired {new Date(routine.lastFireAt).toLocaleString()}</span>
              )}
            </div>
            <div className="mt-2.5 flex items-center gap-1.5">
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

      <CreateRoutineDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
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
}: {
  open: boolean
  onClose: () => void
  onCreate: (input: {
    name: string
    prompt: string
    schedule: string
    catchUpMinutes: number
  }) => Promise<boolean>
}) {
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [schedule, setSchedule] = useState(SCHEDULE_PRESETS[1]!.value)
  const [customSchedule, setCustomSchedule] = useState('')
  const [catchUp, setCatchUp] = useState('0')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveSchedule =
    schedule === '__custom__' ? customSchedule.trim() : schedule

  async function submit() {
    if (!name.trim() || !prompt.trim() || !effectiveSchedule || submitting) return
    setSubmitting(true)
    setError(null)
    const ok = await onCreate({
      name: name.trim(),
      prompt: prompt.trim(),
      schedule: effectiveSchedule,
      catchUpMinutes: Number.isFinite(Number(catchUp)) ? Math.max(0, Number(catchUp)) : 0,
    })
    setSubmitting(false)
    if (!ok) {
      setError('The server rejected this routine — check the schedule expression and try again.')
      return
    }
    setName('')
    setPrompt('')
    setCustomSchedule('')
    setCatchUp('0')
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
            disabled={!name.trim() || !prompt.trim() || !effectiveSchedule || submitting}
            onClick={() => void submit()}
          >
            {submitting ? 'Creating…' : 'Create routine'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <TextField
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Morning brief"
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-soft">Prompt</span>
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={3}
            placeholder="Summarize overnight changes in my notes."
            className="block w-full resize-none rounded-control border border-line bg-panel px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-soft">Schedule (UTC)</span>
          <select
            value={schedule}
            onChange={(event) => setSchedule(event.target.value)}
            className="rounded-control border border-line bg-panel px-2.5 py-2 text-[14px] text-ink"
          >
            {SCHEDULE_PRESETS.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label} — {preset.value}
              </option>
            ))}
            <option value="__custom__">Custom…</option>
          </select>
        </label>
        {schedule === '__custom__' && (
          <TextField
            label="Custom 5-field cron"
            value={customSchedule}
            onChange={(event) => setCustomSchedule(event.target.value)}
            placeholder="*/15 9-17 * * 1-5"
          />
        )}
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-medium text-ink-soft">
            Catch-up window after downtime (minutes)
          </span>
          <select
            value={catchUp}
            onChange={(event) => setCatchUp(event.target.value)}
            className="rounded-control border border-line bg-panel px-2.5 py-2 text-[14px] text-ink"
          >
            <option value="0">0 — skip missed fires</option>
            <option value="30">30 minutes</option>
            <option value="120">2 hours</option>
            <option value="1440">24 hours</option>
          </select>
        </label>
        {error && (
          <p role="alert" className="text-[12.5px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}
