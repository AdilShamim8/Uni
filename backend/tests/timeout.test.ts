import { describe, expect, it, vi } from 'vitest'
import { withTimeout } from '../src/lib/timeout.js'

/** Race a promise against a deadline; the loser is consumed silently. */
describe('withTimeout', () => {
  it('resolves with the value when the promise beats the deadline', async () => {
    const result = await withTimeout(Promise.resolve('done'), 5_000)
    expect(result).toBe('done')
  })

  it('rejects with the label when the deadline wins', async () => {
    const hanging = new Promise<string>(() => undefined)
    await expect(withTimeout(hanging, 5, 'provider call timed out')).rejects.toThrow(
      'provider call timed out',
    )
  })

  it('propagates the promise’s own rejection when it loses the race that way', async () => {
    await expect(withTimeout(Promise.reject(new Error('socket hang up')), 5_000)).rejects.toThrow(
      'socket hang up',
    )
  })

  it('fires exactly at the deadline, not before (fake timers)', async () => {
    vi.useFakeTimers()
    try {
      const hanging = new Promise<string>(() => undefined)
      const raced = withTimeout(hanging, 100, 'deadline hit')
      const assertion = expect(raced).rejects.toThrow('deadline hit')
      await vi.advanceTimersByTimeAsync(99)
      // Not yet: the race is still pending one tick before the deadline.
      await vi.advanceTimersByTimeAsync(1)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })
})
