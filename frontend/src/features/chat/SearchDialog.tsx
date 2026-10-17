import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Ghost, Pin, Search } from 'lucide-react'
import { useAppStore, searchConversations } from '@/state/store'
import { Dialog } from '@/components/ui/Dialog'
import { Badge } from '@/components/ui/Tooltip'

/** Search over real local conversation titles and message content. */
export function SearchDialog() {
  const navigate = useNavigate()
  const open = useAppStore((state) => state.ui.searchOpen)
  const setUi = useAppStore((state) => state.setUi)
  const conversations = useAppStore((state) => state.conversations)
  const selectConversation = useAppStore((state) => state.selectConversation)

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const hits = useMemo(() => searchConversations(conversations, query), [conversations, query])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setActiveIndex(0)
    }
  }, [open])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  function close() {
    setUi({ searchOpen: false })
  }

  function choose(index: number) {
    const hit = hits[index]
    if (!hit) return
    selectConversation(hit.conversationId)
    navigate(`/c/${hit.conversationId}`)
    close()
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (hits.length > 0) setActiveIndex((index) => (index + 1) % hits.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (hits.length > 0) setActiveIndex((index) => (index - 1 + hits.length) % hits.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(activeIndex)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Search conversations"
      size="md"
      initialFocusRef={inputRef}
    >
      <div className="flex items-center gap-2 rounded-[10px] border border-line bg-raised px-3">
        <Search size={16} className="shrink-0 text-ink-faint" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search titles and message content…"
          aria-label="Search query"
          aria-controls="search-results"
          aria-activedescendant={hits[activeIndex] ? `search-hit-${activeIndex}` : undefined}
          className="w-full bg-transparent py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
        />
      </div>

      <div id="search-results" role="listbox" aria-label="Search results" className="mt-3">
        {query.trim() === '' && (
          <p className="px-1 py-6 text-center text-sm leading-relaxed text-ink-faint">
            Type to search your locally stored conversations — titles and message text.
            <br />
            <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px]">↑</kbd>{' '}
            <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px]">↓</kbd> to
            move,{' '}
            <kbd className="rounded border border-line px-1.5 py-0.5 text-[11px]">Enter</kbd>{' '}
            to open.
          </p>
        )}

        {query.trim() !== '' && hits.length === 0 && (
          <p className="px-1 py-6 text-center text-sm text-ink-faint">
            No conversations match “{query.trim()}”.
          </p>
        )}

        {hits.map((hit, index) => (
          <button
            key={hit.conversationId}
            id={`search-hit-${index}`}
            role="option"
            aria-selected={index === activeIndex}
            type="button"
            onClick={() => choose(index)}
            className={`flex w-full flex-col gap-1 rounded-[10px] px-3 py-2.5 text-left transition-colors ${
              index === activeIndex ? 'bg-accent-soft' : 'hover:bg-subtle'
            }`}
          >
            <span className="flex w-full items-center gap-2">
              <span
                className={`min-w-0 flex-1 truncate text-sm font-medium ${
                  index === activeIndex ? 'text-accent' : 'text-ink'
                }`}
              >
                {hit.title}
              </span>
              {hit.pinned && <Pin size={12} aria-label="Pinned" className="shrink-0 text-ink-faint" />}
              {hit.temporary && (
                <Badge tone="accent">
                  <Ghost size={10} /> Temporary
                </Badge>
              )}
              {hit.archived && <Badge>Archived</Badge>}
            </span>
            <span className="line-clamp-2 text-xs leading-relaxed text-ink-soft">
              {hit.matchIn === 'title' ? 'Title match — ' : ''}
              {highlight(hit.snippet, query.trim())}
            </span>
          </button>
        ))}
      </div>
    </Dialog>
  )
}

function highlight(snippet: string, query: string) {
  const index = snippet.toLowerCase().indexOf(query.toLowerCase())
  if (index === -1) return snippet
  return (
    <>
      {snippet.slice(0, index)}
      <mark className="rounded bg-accent-soft px-0.5 text-accent">
        {snippet.slice(index, index + query.length)}
      </mark>
      {snippet.slice(index + query.length)}
    </>
  )
}
