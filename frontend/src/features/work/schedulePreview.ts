/**
 * T033 — a human sentence for a 5-field cron schedule. Presentation
 * only: the truth about WHEN the next fire happens is the server's
 * computed nextFireAt (RF-030) — this module never evaluates time, it
 * just labels the expression the user typed.
 */

export function describeSchedule(schedule: string): string {
  const fields = schedule.trim().split(/\s+/)
  if (fields.length !== 5) return schedule

  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields as [
    string,
    string,
    string,
    string,
    string,
  ]

  const everyMinute = minute === '*' && hour === '*'
  if (everyMinute) return 'Every minute'

  const hourly = minute !== '*' && hour === '*'
  if (hourly) {
    const step = minute.startsWith('*/')
    return step ? `Every ${minute.slice(2)} minutes` : `Hourly at :${pad(minute)}`
  }

  const weekdaysOnly = dayOfWeek === '1-5'
  const weekend = dayOfWeek === '0,6' || dayOfWeek === '6,0'
  const dayLabel = weekdaysOnly
    ? 'Weekdays'
    : weekend
      ? 'Weekends'
      : dayOfWeek === '*'
        ? 'Daily'
        : `Day of week ${dayOfWeek}`

  const timeLabel = hour !== '*' ? `${pad(hour)}:${pad(minute)} UTC` : 'each hour'

  if (month !== '*') return `${schedule} (month ${month})`
  if (dayOfMonth !== '*') return `Day ${dayOfMonth} of the month at ${timeLabel}`

  return `${dayLabel} at ${timeLabel}`
}

function pad(field: string): string {
  if (!/^\d+$/.test(field)) return field
  return field.padStart(2, '0')
}
