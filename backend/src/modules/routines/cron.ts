/**
 * Minimal, deterministic 5-field cron evaluation for routine schedules
 * (P09 / T031). Pure functions only — no state, no I/O — so the
 * scheduler tick and the UI preview share one truth.
 *
 * Supported field syntax (the deterministic subset): the star, single
 * values, `a-b` ranges, `a-b/n` and star-step values, and comma lists.
 * Day-of-week accepts 0 or 7 as Sunday. Standard cron semantics: when
 * both day-of-month and day-of-week are restricted, a minute matches if
 * EITHER matches.
 */

export interface ParsedCron {
  minutes: ReadonlySet<number>
  hours: ReadonlySet<number>
  daysOfMonth: ReadonlySet<number>
  months: ReadonlySet<number>
  daysOfWeek: ReadonlySet<number>
}

const FIELD_LIMITS: Array<{ min: number; max: number }> = [
  { min: 0, max: 59 }, // minute
  { min: 0, max: 23 }, // hour
  { min: 1, max: 31 }, // day of month
  { min: 1, max: 12 }, // month
  { min: 0, max: 7 }, // day of week (7 = Sunday, normalized to 0)
]

export class InvalidCronError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidCronError'
  }
}

function parseField(raw: string, fieldIndex: number): Set<number> {
  const limits = FIELD_LIMITS[fieldIndex]
  if (!limits) throw new InvalidCronError(`Field ${fieldIndex + 1} is not a cron field.`)
  const { min, max } = limits
  const values = new Set<number>()
  for (const part of raw.split(',')) {
    if (part.length === 0) {
      throw new InvalidCronError(`Empty list item in field ${fieldIndex + 1}.`)
    }
    const [rawRange, rawStep] = part.split('/')
    const rangePart = rawRange ?? ''
    const stepPart = rawStep
    let start: number
    let end: number
    if (stepPart !== undefined && !/^\d+$/.test(stepPart)) {
      throw new InvalidCronError(`Step must be a positive integer in "${part}".`)
    }
    const step = stepPart !== undefined ? Number.parseInt(stepPart, 10) : 1
    if (step < 1) {
      throw new InvalidCronError(`Step must be >= 1 in "${part}".`)
    }
    if (rangePart === '*') {
      start = min
      end = max
    } else if (rangePart.includes('-')) {
      const [rawStart, rawEnd] = rangePart.split('-')
      if (!rawStart || !rawEnd || !/^\d+$/.test(rawStart) || !/^\d+$/.test(rawEnd)) {
        throw new InvalidCronError(`Range endpoints must be integers in "${part}".`)
      }
      start = Number.parseInt(rawStart, 10)
      end = Number.parseInt(rawEnd, 10)
    } else {
      if (!/^\d+$/.test(rangePart)) {
        throw new InvalidCronError(`Value must be an integer in "${part}".`)
      }
      start = Number.parseInt(rangePart, 10)
      end = stepPart !== undefined ? max : start
    }
    if (start < min || end > max || start > end) {
      throw new InvalidCronError(
        `"${part}" is outside the allowed range ${min}-${max} for field ${fieldIndex + 1}.`,
      )
    }
    for (let value = start; value <= end; value += step) {
      // Day-of-week 7 is Sunday, same as 0 (Vixie cron behavior).
      values.add(fieldIndex === 4 && value === 7 ? 0 : value)
    }
  }
  if (values.size === 0) {
    throw new InvalidCronError(`Field ${fieldIndex + 1} matches nothing.`)
  }
  return values
}

export function parseCron(expression: string): ParsedCron {
  const fields = expression.trim().split(/\s+/)
  if (fields.length !== 5 || fields.some((field) => field.length === 0)) {
    throw new InvalidCronError('Schedule must be exactly 5 cron fields (minute hour day month weekday).')
  }
  return {
    minutes: parseField(fields[0]!, 0),
    hours: parseField(fields[1]!, 1),
    daysOfMonth: parseField(fields[2]!, 2),
    months: parseField(fields[3]!, 3),
    daysOfWeek: parseField(fields[4]!, 4),
  }
}

/** True when the expression matches the given minute (UTC calendar). */
export function cronMatchesMinute(expression: string, at: Date): boolean {
  const cron = parseCron(expression)
  return cronMatchesParsed(cron, at)
}

function cronMatchesParsed(cron: ParsedCron, at: Date): boolean {
  const minute = at.getUTCMinutes()
  const hour = at.getUTCHours()
  const dayOfMonth = at.getUTCDate()
  const month = at.getUTCMonth() + 1
  const dayOfWeek = at.getUTCDay()

  if (!cron.minutes.has(minute) || !cron.hours.has(hour) || !cron.months.has(month)) {
    return false
  }
  const domRestricted = cron.daysOfMonth.size !== 31
  const dowRestricted = cron.daysOfWeek.size !== 7
  if (domRestricted && dowRestricted) {
    // Standard cron: either day field matching is enough.
    return cron.daysOfMonth.has(dayOfMonth) || cron.daysOfWeek.has(dayOfWeek)
  }
  return cron.daysOfMonth.has(dayOfMonth) && cron.daysOfWeek.has(dayOfWeek)
}

/**
 * The next matching minute strictly after `from`, or null when nothing
 * matches within the scan bound (a full non-leap year — an expression
 * like "0 0 30 2 *" never fires and must not loop forever).
 */
export function nextCronFire(
  expression: string,
  from: Date,
  scanMinutes = 366 * 24 * 60,
): Date | null {
  const cron = parseCron(expression)
  // Start at the next whole minute strictly after `from`.
  const cursor = new Date(Math.floor(from.getTime() / 60_000) * 60_000 + 60_000)
  for (let scanned = 0; scanned < scanMinutes; scanned += 1) {
    if (cronMatchesParsed(cron, cursor)) return cursor
    cursor.setUTCMinutes(cursor.getUTCMinutes() + 1)
  }
  return null
}
