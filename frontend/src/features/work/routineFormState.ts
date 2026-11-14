/**
 * RF-059 — the routine form state shared by the create and edit
 * dialogs (T033): schedule presets, the custom sentinel, the empty
 * form, and the pure validation helpers. Extracted from the component
 * file so React fast refresh keeps working (a component file exports
 * components only) and the helpers are unit-testable without React.
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
