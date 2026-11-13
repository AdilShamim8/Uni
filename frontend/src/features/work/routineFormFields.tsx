import { TextField } from '@/components/ui/TextField'

/**
 * RF-059 — the routine form fields shared by the create and edit
 * dialogs (T033). Purely presentational and fully controlled: the
 * owning dialog owns the state, the submit mapping, and any error
 * rendering, so both surfaces stay behaviorally identical.
 */

export const SCHEDULE_PRESETS: Array<{ value: string; label: string }> = [
  { value: '* * * * *', label: 'Every minute (test)' },
  { value: '0 * * * *', label: 'Hourly' },
  { value: '30 9 * * 1-5', label: 'Weekdays at 09:30 UTC' },
  { value: '0 17 * * 5', label: 'Fridays at 17:00 UTC' },
  { value: '0 9 1 * *', label: 'First of the month, 09:00 UTC' },
]

/** The sentinel preset value that reveals the custom cron field. */
export const CUSTOM_SCHEDULE = '__custom__'

export interface RoutineFormState {
  name: string
  prompt: string
  /** A preset value or CUSTOM_SCHEDULE. */
  schedule: string
  /** The free-form 5-field cron, used when schedule is CUSTOM_SCHEDULE. */
  customSchedule: string
  /** Catch-up window in minutes, as a string while the select owns it. */
  catchUp: string
  /** '' = the session's employee; otherwise the pinned employee id. */
  employeeId: string
}

export const EMPTY_ROUTINE_FORM: RoutineFormState = {
  name: '',
  prompt: '',
  schedule: SCHEDULE_PRESETS[1]!.value,
  customSchedule: '',
  catchUp: '0',
  employeeId: '',
}

/** The cron expression the form currently represents. */
export function effectiveSchedule(state: RoutineFormState): string {
  return state.schedule === CUSTOM_SCHEDULE ? state.customSchedule.trim() : state.schedule
}

/** True when every field is filled enough to submit. */
export function routineFormValid(state: RoutineFormState): boolean {
  return (
    state.name.trim().length > 0 &&
    state.prompt.trim().length > 0 &&
    effectiveSchedule(state).length > 0
  )
}

export function RoutineFormFields({
  state,
  onChange,
  employees,
}: {
  state: RoutineFormState
  onChange: (patch: Partial<RoutineFormState>) => void
  /** Non-archived employees offered for the soft pin. */
  employees: Array<{ id: string; name: string }>
}) {
  return (
    <>
      <TextField
        label="Name"
        value={state.name}
        onChange={(event) => onChange({ name: event.target.value })}
        placeholder="Morning brief"
      />
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-ink-soft">Prompt</span>
        <textarea
          value={state.prompt}
          onChange={(event) => onChange({ prompt: event.target.value })}
          rows={3}
          placeholder="Summarize overnight changes in my notes."
          className="block w-full resize-none rounded-control border border-line bg-panel px-3 py-2 text-[14px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-ink-soft">Schedule (UTC)</span>
        <select
          value={state.schedule}
          onChange={(event) => onChange({ schedule: event.target.value })}
          className="rounded-control border border-line bg-panel px-2.5 py-2 text-[14px] text-ink"
        >
          {SCHEDULE_PRESETS.map((preset) => (
            <option key={preset.value} value={preset.value}>
              {preset.label} — {preset.value}
            </option>
          ))}
          <option value={CUSTOM_SCHEDULE}>Custom…</option>
        </select>
      </label>
      {state.schedule === CUSTOM_SCHEDULE && (
        <TextField
          label="Custom 5-field cron"
          value={state.customSchedule}
          onChange={(event) => onChange({ customSchedule: event.target.value })}
          placeholder="*/15 9-17 * * 1-5"
        />
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-ink-soft">Run as employee (optional)</span>
        <select
          value={state.employeeId}
          onChange={(event) => onChange({ employeeId: event.target.value })}
          className="rounded-control border border-line bg-panel px-2.5 py-2 text-[14px] text-ink"
        >
          <option value="">Session's employee — use its instructions and tools</option>
          {employees.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.name} — its instructions and tools
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-[12.5px] font-medium text-ink-soft">
          Catch-up window after downtime (minutes)
        </span>
        <select
          value={state.catchUp}
          onChange={(event) => onChange({ catchUp: event.target.value })}
          className="rounded-control border border-line bg-panel px-2.5 py-2 text-[14px] text-ink"
        >
          <option value="0">0 — skip missed fires</option>
          <option value="30">30 minutes</option>
          <option value="120">2 hours</option>
          <option value="1440">24 hours</option>
          {/* A stored value outside the presets stays visible and editable. */}
          {!['0', '30', '120', '1440'].includes(state.catchUp) && (
            <option value={state.catchUp}>{state.catchUp} minutes (custom)</option>
          )}
        </select>
      </label>
    </>
  )
}
