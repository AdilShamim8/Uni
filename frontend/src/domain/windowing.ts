/**
 * Transcript windowing math (milestone 08, F15) — pure and side-effect free
 * so every decision is unit-testable without a browser.
 *
 * Model: the transcript always renders the newest items; `start` is the
 * oldest rendered index. History above `start` materializes block-by-block
 * as the reader scrolls up (with scroll compensation applied by the hook),
 * and collapses back when the rendered set exceeds the cap and the leading
 * block is entirely above the viewport. Long transcripts therefore cost a
 * bounded mount instead of growing linearly with history.
 *
 * Environments without layout measurements (jsdom) fail open: the window
 * covers the whole transcript and nothing is skipped.
 */

/** Items materialized per upward extension (one block at a time). */
export const WINDOW_BLOCK = 40
/** Items mounted on first render of a long transcript (the tail). */
export const WINDOW_TAIL_ITEMS = 120
/** Hard cap on simultaneously rendered items. */
export const WINDOW_CAP_ITEMS = 320
/** Transcripts at or below this size never window. */
export const WINDOW_MIN_ITEMS = 80

export interface ItemWindow {
  /** Oldest rendered index (inclusive). */
  start: number
  /** Newest rendered index (exclusive) — callers pass their total. */
  end: number
}

export function initialWindow(total: number, windowed: boolean): ItemWindow {
  if (!windowed) return { start: 0, end: total }
  return { start: Math.max(0, total - WINDOW_TAIL_ITEMS), end: total }
}

/** Windowing is only worth it for transcripts that are actually long. */
export function isWindowable(total: number): boolean {
  return total > WINDOW_MIN_ITEMS
}

/**
 * Prefetch zone: extend while the reader is within two viewports of the
 * top of the rendered range, so materialization happens before blank space
 * could scroll into view.
 */
export function shouldExtendUp(scrollTop: number, viewportHeight: number): boolean {
  if (viewportHeight <= 0) return false
  return scrollTop <= viewportHeight * 2
}

/** One block of older history; never moves past the first item. */
export function extendWindow(window: ItemWindow): ItemWindow {
  return { start: Math.max(0, window.start - WINDOW_BLOCK), end: window.end }
}

/**
 * Drop the leading block when the rendered set exceeds the cap AND that
 * block is entirely above the viewport. `leadingBlockBottom` is the
 * bottom edge of the block's last item, in content coordinates (the same
 * space as `scrollTop`); `null` means the caller could not measure it, in
 * which case nothing is dropped.
 */
export function collapseWindow(
  window: ItemWindow,
  leadingBlockBottom: number | null,
  scrollTop: number,
): ItemWindow | null {
  if (leadingBlockBottom === null) return null
  if (window.end - window.start <= WINDOW_CAP_ITEMS) return null
  if (leadingBlockBottom >= scrollTop) return null
  const nextStart = Math.min(window.start + WINDOW_BLOCK, window.end)
  if (nextStart === window.start) return null
  return { start: nextStart, end: window.end }
}

/**
 * Keep `start` valid when the transcript shrinks (messages deleted above
 * or the surface switching data): clamp instead of re-initializing so the
 * reader's position survives small changes.
 */
export function clampWindow(window: ItemWindow, total: number): ItemWindow {
  const end = Math.max(0, total)
  const start = Math.min(Math.max(0, window.start), Math.max(0, end - 1))
  return { start, end }
}
