import { describe, expect, it } from 'vitest'
import { mostRecentDueMinute } from '../src/modules/routines/routines.scheduler.js'

/**
 * T031 — the missed-fire policy as a pure function: the newest matching
 * minute inside the catch-up window fires; catchUp 0 = current minute
 * only; minutes before creation never fire.
 */

const MINUTE = 60_000

describe('mostRecentDueMinute', () => {
  const daily = '30 9 * * *'
  const every5 = '*/5 * * * *'

  it('returns the current minute when it matches', () => {
    const now = new Date('2026-11-12T09:30:12Z')
    expect(mostRecentDueMinute(daily, 0, new Date('2026-11-01T00:00:00Z'), now)?.toISOString()).toBe(
      '2026-11-12T09:30:00.000Z',
    )
  })

  it('catches up the most recent missed minute inside the window', () => {
    // Now is 09:44; the 09:30 fire was missed 14 minutes ago; window 30.
    const now = new Date('2026-11-12T09:44:00Z')
    expect(mostRecentDueMinute(daily, 30, new Date('2026-11-01T00:00:00Z'), now)?.toISOString()).toBe(
      '2026-11-12T09:30:00.000Z',
    )
  })

  it('returns null when the miss falls outside the catch-up window', () => {
    // The 09:30 fire is 15 minutes old but the window is 10.
    const now = new Date('2026-11-12T09:45:00Z')
    expect(mostRecentDueMinute(daily, 10, new Date('2026-11-01T00:00:00Z'), now)).toBeNull()
  })

  it('picks the NEWEST match when several minutes inside the window match', () => {
    // Now 10:07; matches at 10:05, 10:00, 09:55… window 30 → 10:05.
    const now = new Date('2026-11-12T10:07:00Z')
    expect(mostRecentDueMinute(every5, 30, new Date('2026-11-01T00:00:00Z'), now)?.toISOString()).toBe(
      '2026-11-12T10:05:00.000Z',
    )
  })

  it('never fires for minutes before the routine was created', () => {
    // The routine was created at 09:31 — the 09:30 fire predates it.
    const now = new Date('2026-11-12T09:40:00Z')
    expect(
      mostRecentDueMinute(daily, 30, new Date('2026-11-12T09:31:00Z'), now),
    ).toBeNull()
  })

  it('handles the boundary minute exactly at the window edge', () => {
    // Now 10:00 with a */5 schedule: matches at 10:00 itself.
    const now = new Date('2026-11-12T10:00:00Z')
    expect(mostRecentDueMinute(every5, 0, new Date('2026-11-01T00:00:00Z'), now)?.getTime()).toBe(
      new Date('2026-11-12T10:00:00Z').getTime(),
    )
    // One second later the same minute still counts (same floor minute).
    const nowPlus = new Date(now.getTime() + 1_000)
    expect(mostRecentDueMinute(every5, 0, new Date('2026-11-01T00:00:00Z'), nowPlus)?.getTime()).toBe(
      new Date('2026-11-12T10:00:00Z').getTime(),
    )
  })

  it('scans a full-day window without hanging and honestly reports no match', () => {
    // February 30th never exists — a day-long window finds nothing.
    const now = new Date('2026-11-12T10:00:00Z')
    const started = Date.now()
    expect(mostRecentDueMinute('0 0 30 2 *', 60 * 24, new Date('2026-01-01T00:00:00Z'), now)).toBeNull()
    expect(Date.now() - started).toBeLessThan(1_000)
    expect(MINUTE).toBe(60_000)
  })
})
