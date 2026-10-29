import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  WINDOW_BLOCK,
  WINDOW_CAP_ITEMS,
  clampWindow,
  collapseWindow,
  initialWindow,
  isWindowable,
  shouldExtendUp,
} from '@/domain/windowing'

/**
 * Transcript windowing (milestone 08, F15). Wraps a scroll container and
 * decides which slice of a long transcript stays mounted:
 *
 * - Long transcripts start windowed on the very first render (that is what
 *   avoids the unbounded mount); the newest items always render.
 * - Scrolling near the top of the rendered range materializes one block of
 *   older history, then compensates `scrollTop` by the measured height
 *   delta in a layout effect, so the visible position never jumps and no
 *   blank spacer can ever scroll into view.
 * - Over the rendered cap, a leading block that is entirely above the
 *   viewport collapses; the same delta compensation applies in reverse.
 * - Environments without layout measurements (jsdom) or short transcripts
 *   (< WINDOW_MIN_ITEMS) fail open: everything renders, nothing is hidden.
 *
 * The scroll container must mark each rendered item with
 * `data-window-item={index}` so collapse guards can measure block edges.
 */
export function useTranscriptWindow({
  containerRef,
  total,
}: {
  containerRef: React.RefObject<HTMLElement | null>
  total: number
}): { start: number; windowed: boolean } {
  // Optimistic first render: window long transcripts immediately; the
  // mount layout effect below confirms or fails open.
  const [state, setState] = useState(() => {
    const windowed = isWindowable(total)
    return { windowed, start: initialWindow(total, windowed).start }
  })
  const stateRef = useRef(state)
  const totalRef = useRef(total)
  const prevTotalRef = useRef(total)
  const heightBeforeRef = useRef<number | null>(null)

  // Latest-ref sync: keep the mirrors current without touching refs during
  // render (react-hooks/refs). Passive effects flush before the next user
  // event, so the scroll handler below always reads fresh values; the mount
  // layout effect runs against the useRef initializers, which already hold
  // this render's state and total.
  useEffect(() => {
    stateRef.current = state
    totalRef.current = total
  })

  // Mount measurement: confirm the optimistic window, or fail open where
  // layout is unavailable (jsdom, hidden containers).
  useLayoutEffect(() => {
    const element = containerRef.current
    const measurable = Boolean(element) && element!.clientHeight > 0
    setState((prev) => {
      if (!prev.windowed || measurable || !isWindowable(totalRef.current)) return prev
      return { windowed: false, start: 0 }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, [])

  // Transcript shrinks (deletions, surface switching data): clamp the
  // window instead of re-initializing so the reader's position survives.
  useEffect(() => {
    const previous = prevTotalRef.current
    prevTotalRef.current = total
    if (total >= previous) return
    setState((prev) => {
      const windowed = prev.windowed && isWindowable(total)
      const start = windowed
        ? clampWindow({ start: prev.start, end: total }, total).start
        : 0
      if (windowed === prev.windowed && start === prev.start) return prev
      return { windowed, start }
    })
  }, [total])

  // Scroll-driven window changes.
  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    function onScroll(): void {
      const container = containerRef.current
      if (!container) return
      const current = stateRef.current
      const count = totalRef.current

      if (!current.windowed) {
        // A transcript that grew past the threshold mid-session starts
        // windowing only once the reader is back near the bottom, so
        // content under their eyes is never removed.
        if (isWindowable(count) && container.clientHeight > 0) {
          const distanceFromBottom =
            container.scrollHeight - container.scrollTop - container.clientHeight
          if (distanceFromBottom <= container.clientHeight * 2) {
            heightBeforeRef.current = null
            setState({ windowed: true, start: initialWindow(count, true).start })
          }
        }
        return
      }

      // One window change in flight at a time.
      if (heightBeforeRef.current !== null) return

      if (shouldExtendUp(container.scrollTop, container.clientHeight)) {
        if (current.start > 0) {
          heightBeforeRef.current = container.scrollHeight
          setState((prev) => ({
            ...prev,
            start: Math.max(0, prev.start - WINDOW_BLOCK),
          }))
        }
        return
      }

      if (count - current.start > WINDOW_CAP_ITEMS) {
        const leading = leadingBlockBottom(container, current.start)
        const next = collapseWindow(
          { start: current.start, end: count },
          leading,
          container.scrollTop,
        )
        if (next) {
          heightBeforeRef.current = container.scrollHeight
          setState((prev) => ({ ...prev, start: next.start }))
        }
      }
    }

    element.addEventListener('scroll', onScroll, { passive: true })
    return () => element.removeEventListener('scroll', onScroll)
  }, [containerRef])

  // Compensate scroll position for height added/removed above the
  // viewport, before paint, so materialization and collapse are invisible.
  useLayoutEffect(() => {
    const element = containerRef.current
    const before = heightBeforeRef.current
    if (!element || before === null) return
    heightBeforeRef.current = null
    const delta = element.scrollHeight - before
    if (delta !== 0) element.scrollTop += delta
  }, [state.start, containerRef])

  return state
}

/** Bottom edge of the leading block's last item, in content coordinates. */
function leadingBlockBottom(container: HTMLElement, start: number): number | null {
  const lastOfBlock = container.querySelector(
    `[data-window-item="${start + WINDOW_BLOCK - 1}"]`,
  )
  if (!(lastOfBlock instanceof HTMLElement)) return null
  const containerTop = container.getBoundingClientRect().top
  const itemBottom = lastOfBlock.getBoundingClientRect().bottom
  return itemBottom - containerTop + container.scrollTop
}
