/**
 * RF-095 — a short relative label for a future timestamp ("in ~2h",
 * "in 3d"). Presentation only; the truth stays the server's
 * nextFireAt — this never re-evaluates a schedule, it just formats a
 * known instant relative to now.
 */
export function relativeFuture(target: number, now = Date.now()): string {
  const delta = target - now
  if (delta <= 0) return 'any moment'
  const minutesExact = delta / 60_000
  if (minutesExact < 1) return 'in <1m'
  const minutes = Math.round(minutesExact)
  if (minutes < 60) return `in ~${minutes}m`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `in ~${hours}h`
  const days = Math.round(hours / 24)
  return `in ~${days}d`
}
