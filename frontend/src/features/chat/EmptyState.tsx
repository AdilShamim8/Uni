import { Coffee, Lightbulb, Mail, Sparkles } from 'lucide-react'
import { UniverseMark } from '@/components/layout/UniverseMark'

const SUGGESTIONS = [
  {
    icon: <Lightbulb size={17} />,
    title: 'Explain something',
    hint: 'How things work, in plain language',
    prompt: 'Explain how something works, in plain language',
  },
  {
    icon: <Mail size={17} />,
    title: 'Draft an email',
    hint: 'Short and friendly, ready to send',
    prompt: 'Draft a short, friendly email',
  },
  {
    icon: <Sparkles size={17} />,
    title: 'Brainstorm names',
    hint: 'For a project, product, or side quest',
    prompt: 'Brainstorm names for a side project',
  },
  {
    icon: <Coffee size={17} />,
    title: 'Plan a weekend',
    hint: 'Unhurried ideas that balance out',
    prompt: 'Plan a relaxed weekend',
  },
] as const

export interface EmptyStateProps {
  /** Called when a suggestion tile is clicked (composer wiring). */
  onSuggestion?: (text: string) => void
}

export function EmptyState({ onSuggestion }: EmptyStateProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-4 py-8 text-center sm:justify-start sm:pt-[max(8vh,3rem)]">
      <UniverseMark size={40} className="text-ink" />
      <h2 className="mt-4 text-[clamp(1.875rem,3.2vw,2.5rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
        Where should we begin?
      </h2>
      <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink-soft">
        Ask anything, or start from one of these.
      </p>

      <div
        className="mt-8 grid w-full max-w-[34rem] grid-cols-1 gap-2.5 sm:grid-cols-2"
        aria-label="Suggested starting points"
      >
        {SUGGESTIONS.map((suggestion) => {
          const tile = (
            <>
              <span
                aria-hidden="true"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent"
              >
                {suggestion.icon}
              </span>
              <span className="min-w-0 text-left">
                <span className="block text-sm font-medium text-ink">{suggestion.title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-ink-faint">
                  {suggestion.hint}
                </span>
              </span>
            </>
          )
          return onSuggestion ? (
            <button
              key={suggestion.title}
              type="button"
              onClick={() => onSuggestion(suggestion.prompt)}
              className="min-touch flex items-center gap-3.5 rounded-group border border-line bg-raised/60 px-4 py-3.5 text-left transition-[background-color,border-color,transform] duration-[var(--motion-fast)] hover:border-line-strong hover:bg-raised active:scale-[0.99]"
            >
              {tile}
            </button>
          ) : (
            <div
              key={suggestion.title}
              className="flex items-center gap-3.5 rounded-group border border-line bg-raised/60 px-4 py-3.5"
            >
              {tile}
            </div>
          )
        })}
      </div>
    </div>
  )
}
