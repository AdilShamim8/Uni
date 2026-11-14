import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import type { ServerRoutine } from '@/services/api/serverRoutines'
import { RoutineFormFields } from './routineFormFields'
import {
  CUSTOM_SCHEDULE,
  SCHEDULE_PRESETS,
  effectiveSchedule,
  type RoutineFormState,
} from './routineFormState'

/**
 * RF-061 — the routine edit dialog (T033): the shared form fields
 * prefilled from an existing routine. The submit is a CHANGED-ONLY
 * patch — unchanged fields are not sent, and Save is disabled until
 * something actually differs, so the server's "No fields to update."
 * rejection can never happen from this surface.
 */
export function EditRoutineDialog({
  routine,
  employees,
  onClose,
  onSave,
}: {
  /** The routine to edit; null renders nothing. */
  routine: ServerRoutine | null
  /** Non-archived employees offered for the re-pin. */
  employees: Array<{ id: string; name: string }>
  onClose: () => void
  onSave: (
    routineId: string,
    patch: {
      name?: string
      prompt?: string
      schedule?: string
      catchUpMinutes?: number
      employeeId?: string | null
    },
  ) => Promise<boolean>
}) {
  const [form, setForm] = useState<RoutineFormState>(prefill(routine))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // The form state initializes from the routine prop; the owning
  // surface remounts this dialog with key={routine.id} when the edit
  // target changes (no effect-driven setState cascades).
  if (!routine) return null

  // RF-101 — keep the CURRENT pin selectable even when its employee is
  // archived (the caller's list excludes archived rows); the prefill
  // must show the truth, and a name-only save must not re-pin.
  const pinOptions =
    routine.employeeId && !employees.some((employee) => employee.id === routine.employeeId)
      ? [
          { id: routine.employeeId, name: routine.employeeName ?? 'Pinned employee (archived)' },
          ...employees,
        ]
      : employees

  const patch = diffPatch(routine, form)

  async function submit() {
    if (!routine || isEmptyPatch(patch) || submitting) return
    setSubmitting(true)
    setError(null)
    const ok = await onSave(routine.id, patch)
    setSubmitting(false)
    if (!ok) {
      setError('The server rejected the change — check the schedule expression and try again.')
    }
    // On success the parent closes the dialog (it owns the target).
  }

  return (
    <Dialog
      open={routine !== null}
      onClose={onClose}
      title={`Edit “${routine.name}”`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={isEmptyPatch(patch) || submitting}
            onClick={() => void submit()}
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <RoutineFormFields
          state={form}
          onChange={(changed) => setForm((current) => ({ ...current, ...changed }))}
          employees={pinOptions}
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

function prefill(routine: ServerRoutine | null): RoutineFormState {
  if (!routine) {
    return {
      name: '',
      prompt: '',
      schedule: SCHEDULE_PRESETS[1]!.value,
      customSchedule: '',
      catchUp: '0',
      employeeId: '',
    }
  }
  const isPreset = SCHEDULE_PRESETS.some((preset) => preset.value === routine.schedule)
  return {
    name: routine.name,
    prompt: routine.prompt,
    schedule: isPreset ? routine.schedule : CUSTOM_SCHEDULE,
    customSchedule: isPreset ? '' : routine.schedule,
    catchUp: String(routine.catchUpMinutes),
    employeeId: routine.employeeId ?? '',
  }
}

/** The changed-only patch the server will receive. */
function diffPatch(
  routine: ServerRoutine,
  form: RoutineFormState,
): {
  name?: string
  prompt?: string
  schedule?: string
  catchUpMinutes?: number
  employeeId?: string | null
} {
  const patch: {
    name?: string
    prompt?: string
    schedule?: string
    catchUpMinutes?: number
    employeeId?: string | null
  } = {}
  if (form.name.trim() !== routine.name) patch.name = form.name.trim()
  if (form.prompt.trim() !== routine.prompt) patch.prompt = form.prompt.trim()
  if (effectiveSchedule(form) !== routine.schedule) patch.schedule = effectiveSchedule(form)
  const catchUp = Number.isFinite(Number(form.catchUp)) ? Math.max(0, Number(form.catchUp)) : 0
  if (catchUp !== routine.catchUpMinutes) patch.catchUpMinutes = catchUp
  const pin = form.employeeId || null
  if (pin !== routine.employeeId) patch.employeeId = pin
  return patch
}

function isEmptyPatch(patch: Record<string, unknown>): boolean {
  return Object.keys(patch).length === 0
}
