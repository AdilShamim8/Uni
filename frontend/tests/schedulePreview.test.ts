import { describe, expect, it } from 'vitest'
import { describeSchedule } from '@/features/work/schedulePreview'

/**
 * T033 — human labels for cron expressions. Presentation only: the
 * module never evaluates time; the WHEN comes from the server's
 * nextFireAt.
 */

describe('weekday names (RF-094)', () => {
  it('names single weekdays the way a human says them', () => {
    expect(describeSchedule('0 9 * * 0')).toBe('Sundays at 09:00 UTC')
    expect(describeSchedule('0 9 * * 1')).toBe('Mondays at 09:00 UTC')
    expect(describeSchedule('30 17 * * 5')).toBe('Fridays at 17:30 UTC')
  })

  it('names lists of weekdays and accepts 7 as Sunday', () => {
    expect(describeSchedule('0 9 * * 0,6')).toBe('Weekends at 09:00 UTC')
    expect(describeSchedule('0 9 * * 6,7')).toBe('Saturdays and Sundays at 09:00 UTC')
  })

  it('falls back to the raw field for anything exotic', () => {
    expect(describeSchedule('0 9 * * 1-3')).toBe('Day of week 1-3 at 09:00 UTC')
    expect(describeSchedule('0 9 * * mon')).toBe('Day of week mon at 09:00 UTC')
  })
})

describe('describeSchedule', () => {
  it('labels every-minute expressions', () => {
    expect(describeSchedule('* * * * *')).toBe('Every minute')
  })

  it('labels hourly expressions, including steps', () => {
    expect(describeSchedule('0 * * * *')).toBe('Hourly at :00')
    expect(describeSchedule('*/15 * * * *')).toBe('Every 15 minutes')
  })

  it('labels daily and weekday schedules with zero-padded times', () => {
    expect(describeSchedule('30 9 * * *')).toBe('Daily at 09:30 UTC')
    expect(describeSchedule('30 9 * * 1-5')).toBe('Weekdays at 09:30 UTC')
    expect(describeSchedule('0 10 * * 0,6')).toBe('Weekends at 10:00 UTC')
  })

  it('labels monthly and rarely-seen shapes honestly (falls back to raw)', () => {
    expect(describeSchedule('0 9 1 * *')).toBe('Day 1 of the month at 09:00 UTC')
    expect(describeSchedule('0 9 * 3 *')).toBe('0 9 * 3 * (month 3)')
    expect(describeSchedule('0 9 * * 2,4')).toBe('Tuesdays and Thursdays at 09:00 UTC')
  })

  it('passes through malformed expressions unchanged', () => {
    expect(describeSchedule('not cron')).toBe('not cron')
    expect(describeSchedule('')).toBe('')
  })
})

describe('hourly and padding edges', () => {
  it('a stepped hour is not the plain hourly shape — the raw field stays visible', () => {
    expect(describeSchedule('30 */2 * * *')).toBe('Daily at */2:30 UTC')
    expect(describeSchedule('0 */2 * * *')).toBe('Daily at */2:00 UTC')
  })

  it('single-digit hours and minutes are zero-padded in time labels', () => {
    expect(describeSchedule('5 9 * * *')).toBe('Daily at 09:05 UTC')
    expect(describeSchedule('5 9 * * 0')).toBe('Sundays at 09:05 UTC')
  })

  it('a fixed minute with a wildcard hour is the hourly shape, whatever else varies', () => {
    expect(describeSchedule('0 * 1 * *')).toBe('Hourly at :00')
  })
})
