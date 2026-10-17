import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown } from 'lucide-react'
import type { Conversation } from '@/domain/types'
import { activePath } from '@/domain/conversationTree'
import { MessageItem } from './MessageItem'

/**
 * Scrollable transcript with reader-friendly auto-scroll: it follows new
 * content only while the reader is near the bottom, and offers a
 * "jump to latest" button otherwise.
 */
export function MessageList({ conversation }: { conversation: Conversation }) {
  const path = useMemo(() => activePath(conversation), [conversation])
  const containerRef = useRef<HTMLDivElement>(null)
  const nearBottomRef = useRef(true)
  const [nearBottom, setNearBottom] = useState(true)

  function handleScroll() {
    const element = containerRef.current
    if (!element) return
    const isNear = element.scrollHeight - element.scrollTop - element.clientHeight < 96
    nearBottomRef.current = isNear
    setNearBottom((previous) => (previous === isNear ? previous : isNear))
  }

  // Follow new content while the reader is near the bottom.
  useEffect(() => {
    const element = containerRef.current
    if (!element || !nearBottomRef.current) return
    element.scrollTop = element.scrollHeight
  }, [path])

  function jumpToLatest() {
    const element = containerRef.current
    if (!element) return
    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    element.scrollTo({
      top: element.scrollHeight,
      behavior: reduceMotion ? 'auto' : 'smooth',
    })
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto"
        role="log"
        aria-label="Conversation transcript"
      >
        <div
          className="mx-auto flex w-full max-w-column flex-col gap-[var(--gap-chat)] px-4 py-6"
        >
          {path.map((node, index) => (
            <MessageItem
              key={node.id}
              node={node}
              conversation={conversation}
              isLast={index === path.length - 1}
            />
          ))}
        </div>
      </div>

      {!nearBottom && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-line bg-overlay px-3 py-1.5 text-xs font-medium text-ink shadow-soft transition-colors hover:bg-subtle"
        >
          <ArrowDown size={13} />
          Jump to latest
        </button>
      )}
    </div>
  )
}
