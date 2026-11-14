import { describe, expect, it } from 'vitest'
import {
  createRoutineRequestSchema,
  patchRoutineRequestSchema,
  routineDtoSchema,
  routineRunStatusSchema,
  routineScheduleExpressionSchema,
} from '../src/index.js'

/** Routines: 5-field cron schedules, catch-up windows, terminal runs. */
describe('schedule expression contract', () => {
  it('accepts exactly five cron fields', () => {
    expect(routineScheduleExpressionSchema.safeParse('30 9 * * 1-5').success).toBe(true)
    expect(routineScheduleExpressionSchema.safeParse('*/5 * * * *').success).toBe(true)
  })

  it('rejects four or six fields', () => {
    expect(routineScheduleExpressionSchema.safeParse('30 9 * *').success).toBe(false)
    expect(routineScheduleExpressionSchema.safeParse('30 9 * * * *').success).toBe(false)
  })

  it('rejects the empty string', () => {
    expect(routineScheduleExpressionSchema.safeParse('').success).toBe(false)
  })
})

describe('routine create/patch requests', () => {
  it('creation defaults catch-up to zero and bounds it at a week of minutes', () => {
    const parsed = createRoutineRequestSchema.parse({
      name: 'Morning brief',
      prompt: 'Summarize overnight news.',
      schedule: '30 9 * * 1-5',
    })
    expect(parsed.catchUpMinutes).toBe(0)
    expect(
      createRoutineRequestSchema.safeParse({
        name: 'X',
        prompt: 'P',
        schedule: '30 9 * * 1-5',
        catchUpMinutes: 60 * 24 * 7,
      }).success,
    ).toBe(true)
    expect(
      createRoutineRequestSchema.safeParse({
        name: 'X',
        prompt: 'P',
        schedule: '30 9 * * 1-5',
        catchUpMinutes: 60 * 24 * 7 + 1,
      }).success,
    ).toBe(false)
  })

  it('a patch with no fields is rejected; a null employeeId unpins', () => {
    expect(patchRoutineRequestSchema.safeParse({}).success).toBe(false)
    expect(patchRoutineRequestSchema.safeParse({ employeeId: null }).success).toBe(true)
  })
})

describe('routine run vocabulary', () => {
  it('run statuses include the honest skipped-for-catch-up outcome', () => {
    for (const status of ['pending', 'running', 'complete', 'stopped', 'error', 'skipped']) {
      expect(routineRunStatusSchema.safeParse(status).success).toBe(true)
    }
    expect(routineRunStatusSchema.safeParse('timeout').success).toBe(false)
  })
})

describe('routine DTO', () => {
  it('carries the pin, the archive state, and the server-computed next fire', () => {
    const dto = {
      id: 'rt_1',
      sessionId: 'sess_1',
      employeeId: 'emp_1',
      employeeName: 'Researcher',
      name: 'Morning brief',
      prompt: 'Summarize overnight news.',
      schedule: '30 9 * * 1-5',
      catchUpMinutes: 30,
      paused: false,
      archived: false,
      lastFireAt: null,
      nextFireAt: 1_700_000_000_000,
      createdAt: 1,
      updatedAt: 1,
    }
    expect(routineDtoSchema.parse(dto)).toEqual(dto)
    expect(
      routineDtoSchema.safeParse({ ...dto, employeeName: undefined }).success,
    ).toBe(false)
  })
})
