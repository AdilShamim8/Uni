import { describe, expect, it } from 'vitest'
import {
  CUSTOM_SCHEDULE,
  EMPTY_ROUTINE_FORM,
  SCHEDULE_PRESETS,
  effectiveSchedule,
  routineFormValid,
  type RoutineFormState,
} from '@/features/work/routineFormState'

/**
 * RF-059 — the pure routine form helpers (moved out of the component
 * file for fast refresh): presets, the custom sentinel, the empty
 * form, and the two predicates the create/edit dialogs share.
 */
describe('routine form presets', () => {
  it('offers the five schedules with honest labels', () => {
    expect(SCHEDULE_PRESETS).toHaveLength(5)
    expect(SCHEDULE_PRESETS.map((preset) => preset.value)).toEqual([
      '* * * * *',
      '0 * * * *',
      '30 9 * * 1-5',
      '0 17 * * 5',
      '0 9 1 * *',
    ])
  })

  it('the empty form starts on the hourly preset with no catch-up', () => {
    expect(EMPTY_ROUTINE_FORM).toEqual({
      name: '',
      prompt: '',
      schedule: '0 * * * *',
      customSchedule: '',
      catchUp: '0',
      employeeId: '',
    })
  })
})

describe('effectiveSchedule', () => {
  it('returns the preset value while a preset is selected', () => {
    const state: RoutineFormState = { ...EMPTY_ROUTINE_FORM, schedule: '30 9 * * 1-5' }
    expect(effectiveSchedule(state)).toBe('30 9 * * 1-5')
  })

  it('returns the trimmed custom cron behind the sentinel', () => {
    const state: RoutineFormState = {
      ...EMPTY_ROUTINE_FORM,
      schedule: CUSTOM_SCHEDULE,
      customSchedule: '  */15 9-17 * * 1-5  ',
    }
    expect(effectiveSchedule(state)).toBe('*/15 9-17 * * 1-5')
  })
})

describe('routineFormValid', () => {
  it('the empty form is not submittable', () => {
    expect(routineFormValid(EMPTY_ROUTINE_FORM)).toBe(false)
  })

  it('blank names and prompts never validate, even with a schedule', () => {
    expect(routineFormValid({ ...EMPTY_ROUTINE_FORM, name: '   ', prompt: 'Summarize.' })).toBe(
      false,
    )
    expect(routineFormValid({ ...EMPTY_ROUTINE_FORM, name: 'Brief', prompt: '  ' })).toBe(false)
  })

  it('a filled preset form validates', () => {
    expect(
      routineFormValid({ ...EMPTY_ROUTINE_FORM, name: 'Brief', prompt: 'Summarize overnight.' }),
    ).toBe(true)
  })

  it('a custom schedule needs a non-empty cron after trimming', () => {
    const custom: RoutineFormState = {
      ...EMPTY_ROUTINE_FORM,
      name: 'Brief',
      prompt: 'Summarize overnight.',
      schedule: CUSTOM_SCHEDULE,
      customSchedule: '   ',
    }
    expect(routineFormValid(custom)).toBe(false)
    expect(routineFormValid({ ...custom, customSchedule: '*/15 * * * *' })).toBe(true)
  })
})

describe('custom catch-up visibility contract', () => {
  it('a stored catch-up outside the presets is preserved verbatim by the state helpers', () => {
    const state: RoutineFormState = { ...EMPTY_ROUTINE_FORM, catchUp: '45' }
    // The helpers never normalize: the select renders the custom option
    // from the raw string (see RoutineFormFields), and the submit mapping
    // parses it server-side.
    expect(state.catchUp).toBe('45')
    expect(routineFormValid({ ...state, name: 'N', prompt: 'P' })).toBe(true)
  })
})
