import { describe, expect, it } from 'vitest'
import { relativeFuture } from '@/features/work/relativeTime'

/** RF-095 — relative labels for future instants, coarse by design. */
describe('relativeFuture (RF-095)', () => {
  const NOW = 1_700_000_000_000

  it('labels minutes, hours, and days coarsely', () => {
    expect(relativeFuture(NOW + 30_000, NOW)).toBe('in <1m')
    expect(relativeFuture(NOW + 5 * 60_000, NOW)).toBe('in ~5m')
    expect(relativeFuture(NOW + 90 * 60_000, NOW)).toBe('in ~2h')
    expect(relativeFuture(NOW + 3 * 24 * 3_600_000, NOW)).toBe('in ~3d')
  })

  it('never claims the future already happened', () => {
    expect(relativeFuture(NOW, NOW)).toBe('any moment')
    expect(relativeFuture(NOW - 60_000, NOW)).toBe('any moment')
  })
})
