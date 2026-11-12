import { describe, expect, it } from 'vitest'
import { InvalidCronError, cronMatchesMinute, nextCronFire, parseCron } from '../src/modules/routines/cron.js'

/**
 * P09 / T031 — the pure cron evaluator the scheduler and preview
 * share. Deterministic subset: star, steps, ranges, lists; standard
 * day-of-month/day-of-week OR semantics; bounded forward scan.
 */

describe('parseCron', () => {
  it('parses the every-minute expression', () => {
    const cron = parseCron('* * * * *')
    expect(cron.minutes.size).toBe(60)
    expect(cron.hours.size).toBe(24)
  })

  it('parses steps, ranges, and lists', () => {
    const cron = parseCron('*/15 9-17 1,15 * 1-5')
    expect([...cron.minutes].sort((a, b) => a - b)).toEqual([0, 15, 30, 45])
    expect(cron.hours.size).toBe(9)
    expect([...cron.daysOfMonth].sort((a, b) => a - b)).toEqual([1, 15])
    expect(cron.daysOfWeek.size).toBe(5)
  })

  it('normalizes day-of-week 7 to Sunday (0)', () => {
    const cron = parseCron('0 0 * * 7')
    expect(cron.daysOfWeek.has(0)).toBe(true)
    expect(cron.daysOfWeek.has(7)).toBe(false)
  })

  it('rejects wrong field counts, out-of-range values, and bad steps', () => {
    expect(() => parseCron('* * * *')).toThrow(InvalidCronError)
    expect(() => parseCron('60 * * * *')).toThrow(InvalidCronError)
    expect(() => parseCron('* 24 * * *')).toThrow(InvalidCronError)
    expect(() => parseCron('* * 0 * *')).toThrow(InvalidCronError)
    expect(() => parseCron('* * * 13 *')).toThrow(InvalidCronError)
    expect(() => parseCron('* * * * 8')).toThrow(InvalidCronError)
    expect(() => parseCron('*/0 * * * *')).toThrow(InvalidCronError)
    expect(() => parseCron('a * * * *')).toThrow(InvalidCronError)
    expect(() => parseCron('5-2 * * * *')).toThrow(InvalidCronError)
  })
})

describe('cronMatchesMinute', () => {
  it('matches an every-minute expression on any minute', () => {
    expect(cronMatchesMinute('* * * * *', new Date('2026-11-12T08:07:23Z'))).toBe(true)
  })

  it('matches a daily 09:30 UTC schedule exactly', () => {
    const expr = '30 9 * * *'
    expect(cronMatchesMinute(expr, new Date('2026-11-12T09:30:00Z'))).toBe(true)
    expect(cronMatchesMinute(expr, new Date('2026-11-12T09:31:00Z'))).toBe(false)
    expect(cronMatchesMinute(expr, new Date('2026-11-12T10:30:00Z'))).toBe(false)
  })

  it('matches weekdays only (Mon–Fri)', () => {
    const expr = '0 12 * * 1-5'
    // 2026-11-12 is a Thursday.
    expect(cronMatchesMinute(expr, new Date('2026-11-12T12:00:00Z'))).toBe(true)
    // 2026-11-14 is a Saturday.
    expect(cronMatchesMinute(expr, new Date('2026-11-14T12:00:00Z'))).toBe(false)
  })

  it('uses OR semantics when both day fields are restricted', () => {
    // The 13th OR any Friday, at 00:00.
    const expr = '0 0 13 * 5'
    // 2026-11-13 is a Friday AND the 13th — matches.
    expect(cronMatchesMinute(expr, new Date('2026-11-13T00:00:00Z'))).toBe(true)
    // 2026-11-20 is a Friday but not the 13th — matches (OR).
    expect(cronMatchesMinute(expr, new Date('2026-11-20T00:00:00Z'))).toBe(true)
    // 2026-11-12 is a Thursday — no.
    expect(cronMatchesMinute(expr, new Date('2026-11-12T00:00:00Z'))).toBe(false)
  })

  it('evaluates month restrictions', () => {
    const expr = '0 0 1 1 *'
    expect(cronMatchesMinute(expr, new Date('2027-01-01T00:00:00Z'))).toBe(true)
    expect(cronMatchesMinute(expr, new Date('2027-02-01T00:00:00Z'))).toBe(false)
  })
})

describe('nextCronFire', () => {
  it('finds the next whole minute strictly after the reference', () => {
    const next = nextCronFire('* * * * *', new Date('2026-11-12T08:07:23Z'))
    expect(next?.toISOString()).toBe('2026-11-12T08:08:00.000Z')
  })

  it('finds the next daily fire across a day boundary', () => {
    const next = nextCronFire('30 9 * * *', new Date('2026-11-12T10:00:00Z'))
    expect(next?.toISOString()).toBe('2026-11-13T09:30:00.000Z')
  })

  it('scans a bounded horizon and reports never-firing expressions as null', () => {
    // February 30th never exists.
    expect(nextCronFire('0 0 30 2 *', new Date('2026-11-12T00:00:00Z'), 400 * 24 * 60)).toBeNull()
  })

  it('returns null without hanging on an impossible expression', () => {
    const started = Date.now()
    expect(nextCronFire('0 0 31 2 *', new Date('2026-01-01T00:00:00Z'), 24 * 60)).toBeNull()
    // The bounded scan of one day finishes immediately.
    expect(Date.now() - started).toBeLessThan(1_000)
  })
})
