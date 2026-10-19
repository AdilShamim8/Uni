import { useState } from 'react'
import { MessageSquareWarning, SendHorizontal } from 'lucide-react'
import type { ClarifyEntry } from '../threadModel'

/**
 * Inline clarification: quick options plus a free-text answer. Answering
 * resumes the waiting run through the provided callback — the same run,
 * never a restart.
 */
export function ClarifyCard({
  entry,
  onAnswer,
}: {
  entry: ClarifyEntry
  onAnswer: (answer: string) => void
}) {
  const [draft, setDraft] = useState('')

  function submitFreeText() {
    const trimmed = draft.trim()
    if (!trimmed) return
    setDraft('')
    onAnswer(trimmed)
  }

  return (
    <div
      className="rounded-group border border-warning/40 bg-warning-soft/60 p-4"
      role="group"
      aria-label="Clarification needed"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-warning">
        <MessageSquareWarning size={15} aria-hidden="true" />
        Quick question
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink">{entry.question}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {entry.options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onAnswer(option)}
            className="min-touch rounded-full border border-line bg-raised px-3.5 py-1.5 text-sm text-ink transition-colors hover:bg-subtle"
          >
            {option}
          </button>
        ))}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              submitFreeText()
            }
          }}
          placeholder="Or type your own answer…"
          aria-label="Free-text answer"
          className="min-touch min-w-0 flex-1 rounded-control border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
        />
        <button
          type="button"
          aria-label="Send free-text answer"
          disabled={!draft.trim()}
          onClick={submitFreeText}
          className="press min-touch inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent text-accent-contrast transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          <SendHorizontal size={15} />
        </button>
      </div>
    </div>
  )
}
