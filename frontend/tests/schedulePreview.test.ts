import { describe, expect, it } from 'vitest'
import { describeSchedule } from '@/features/work/schedulePreview'

/**
 * T033 — human labels for cron expressions. Presentation only: the
 * module never evaluates time; the WHEN comes from the server's
 * nextFireAt.
 */

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
    expect(describeSchedule('0 9 * * 2,4')).toBe('Day of week 2,4 at 09:00 UTC')
  })

  it('passes through malformed expressions unchanged', () => {
    expect(describeSchedule('not cron')).toBe('not cron')
    expect(describeSchedule('')).toBe('')
  })
})
