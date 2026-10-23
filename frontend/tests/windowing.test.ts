import { describe, expect, it } from 'vitest'
import {
  WINDOW_BLOCK,
  WINDOW_CAP_ITEMS,
  WINDOW_MIN_ITEMS,
  WINDOW_TAIL_ITEMS,
  clampWindow,
  collapseWindow,
  extendWindow,
  initialWindow,
  isWindowable,
  shouldExtendUp,
} from '@/domain/windowing'

describe('transcript windowing math', () => {
  it('renders everything when windowing is off, the tail when on', () => {
    expect(initialWindow(600, false)).toEqual({ start: 0, end: 600 })
    expect(initialWindow(600, true)).toEqual({ start: 600 - WINDOW_TAIL_ITEMS, end: 600 })
    // Short transcripts clamp to the first item.
    expect(initialWindow(50, true)).toEqual({ start: 0, end: 50 })
  })

  it('windows only long transcripts', () => {
    expect(isWindowable(WINDOW_MIN_ITEMS)).toBe(false)
    expect(isWindowable(WINDOW_MIN_ITEMS + 1)).toBe(true)
  })

  it('extends within the prefetch zone of the rendered top', () => {
    expect(shouldExtendUp(0, 800)).toBe(true)
    expect(shouldExtendUp(1599, 800)).toBe(true)
    expect(shouldExtendUp(1601, 800)).toBe(false)
    // No viewport measurement: never extend (fail open).
    expect(shouldExtendUp(0, 0)).toBe(false)
  })

  it('extends one block at a time and clamps at the first item', () => {
    const w = { start: 180, end: 600 }
    expect(extendWindow(w)).toEqual({ start: 180 - WINDOW_BLOCK, end: 600 })
    expect(extendWindow({ start: 10, end: 600 })).toEqual({ start: 0, end: 600 })
    expect(extendWindow({ start: 0, end: 600 })).toEqual({ start: 0, end: 600 })
  })

  it('collapses only when over the cap and the block is above the viewport', () => {
    // Under the cap: never collapse.
    expect(collapseWindow({ start: 0, end: 300 }, 0, 5000)).toBeNull()

    // Over the cap but the block intersects the viewport: keep it.
    const over = { start: 0, end: 600 }
    expect(collapseWindow(over, 5000, 4000)).toBeNull()

    // Over the cap and fully above the viewport: drop one block.
    expect(collapseWindow(over, 4000, 5000)).toEqual({ start: WINDOW_BLOCK, end: 600 })

    // Unmeasurable block: never collapse (fail open).
    expect(collapseWindow(over, null, 5000)).toBeNull()
  })

  it('clamps the window when the transcript shrinks', () => {
    expect(clampWindow({ start: 500, end: 600 }, 40)).toEqual({ start: 39, end: 40 })
    expect(clampWindow({ start: 10, end: 600 }, 600)).toEqual({ start: 10, end: 600 })
    expect(clampWindow({ start: 0, end: 600 }, 0)).toEqual({ start: 0, end: 0 })
  })

  it('keeps the rendered set bounded by the cap after full extension', () => {
    // Extend to the top of a 600-item transcript, then walk collapses.
    let w = initialWindow(600, true)
    while (w.start > 0) w = extendWindow(w)
    expect(w).toEqual({ start: 0, end: 600 })
    let collapses = 0
    for (;;) {
      const next = collapseWindow(w, 0, Number.MAX_SAFE_INTEGER)
      if (!next) break
      w = next
      collapses += 1
    }
    // 600 - WINDOW_CAP_ITEMS rounded down to whole blocks, and never all
    // the way to nothing.
    expect(w.start).toBeGreaterThan(0)
    expect(w.end - w.start).toBeLessThanOrEqual(WINDOW_CAP_ITEMS)
    expect(w.end - w.start).toBeGreaterThan(WINDOW_CAP_ITEMS - WINDOW_BLOCK - 1)
    expect(collapses).toBeGreaterThan(0)
  })
})
