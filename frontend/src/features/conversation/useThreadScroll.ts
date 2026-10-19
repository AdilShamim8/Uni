import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Reader-friendly auto-scroll for a thread: follow new content only while
 * the reader is near the bottom, and expose a "jump to latest" action
 * otherwise. Extracted from the chat MessageList so Work and employee
 * threads share the exact same behavior.
 */
export function useThreadScroll(dependency: unknown) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const nearBottomRef = useRef(true)
  const [nearBottom, setNearBottom] = useState(true)

  const handleScroll = useCallback(() => {
    const element = containerRef.current
    if (!element) return
    const isNear = element.scrollHeight - element.scrollTop - element.clientHeight < 96
    nearBottomRef.current = isNear
    setNearBottom((previous) => (previous === isNear ? previous : isNear))
  }, [])

  useEffect(() => {
    const element = containerRef.current
    if (!element || !nearBottomRef.current) return
    element.scrollTop = element.scrollHeight
  }, [dependency])

  const jumpToLatest = useCallback(() => {
    const element = containerRef.current
    if (!element) return
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    element.scrollTo({
      top: element.scrollHeight,
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
  }, [])

  return { containerRef, nearBottom, handleScroll, jumpToLatest }
}
