import { Coffee, Lightbulb, Mail, Sparkles } from 'lucide-react'
import { UniverseMark } from '@/components/layout/UniverseMark'
import { Badge } from '@/components/ui/Tooltip'

const SUGGESTIONS = [
  {
    icon: <Lightbulb size={14} />,
    text: 'Explain how something works, in plain language',
  },
  {
    icon: <Mail size={14} />,
    text: 'Draft a short, friendly email',
  },
  {
    icon: <Sparkles size={14} />,
    text: 'Brainstorm names for a side project',
  },
  {
    icon: <Coffee size={14} />,
    text: 'Plan a relaxed weekend',
  },
] as const

export interface EmptyStateProps {
  /** Called when a suggestion chip is clicked (composer wiring). */
  onSuggestion?: (text: string) => void
}

export function EmptyState({ onSuggestion }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <UniverseMark size={44} className="text-ink" />
      <h2 className="mt-5 text-2xl font-semibold tracking-tight text-ink">
        Where should we begin?
      </h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-soft">
        Ask anything, or start from one of the ideas below. Replies come from the
        local demo adapter and stay in this browser.
      </p>
      <div className="mt-6 flex max-w-lg flex-wrap items-center justify-center gap-2">
        {SUGGESTIONS.map((suggestion) =>
          onSuggestion ? (
            <button
              key={suggestion.text}
              type="button"
              onClick={() => onSuggestion(suggestion.text)}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-3.5 py-2 text-sm text-ink-soft transition-colors hover:bg-subtle hover:text-ink"
            >
              {suggestion.icon}
              {suggestion.text}
            </button>
          ) : (
            <span
              key={suggestion.text}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-3.5 py-2 text-sm text-ink-soft"
            >
              {suggestion.icon}
              {suggestion.text}
            </span>
          ),
        )}
      </div>
      <Badge tone="warning" className="mt-8">
        Local demo prototype — simulated responses, no account, no network calls
      </Badge>
    </div>
  )
}
