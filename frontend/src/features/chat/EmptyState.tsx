import { Coffee, KeyRound, Lightbulb, Mail, Sparkles } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { UniverseMark } from '@/components/layout/UniverseMark'

const SUGGESTIONS = [
  {
    icon: <Lightbulb size={16} />,
    title: 'Explain something',
    hint: 'How things work, in plain language',
    prompt: 'Explain how something works, in plain language',
  },
  {
    icon: <Mail size={16} />,
    title: 'Draft an email',
    hint: 'Short and friendly, ready to send',
    prompt: 'Draft a short, friendly email',
  },
  {
    icon: <Sparkles size={16} />,
    title: 'Brainstorm names',
    hint: 'For a project, product, or side quest',
    prompt: 'Brainstorm names for a side project',
  },
  {
    icon: <Coffee size={16} />,
    title: 'Plan a weekend',
    hint: 'Unhurried ideas that balance out',
    prompt: 'Plan a relaxed weekend',
  },
] as const

export interface EmptyStateProps {
  /** Called when a suggestion tile is clicked (composer wiring). */
  onSuggestion?: (text: string) => void
}

/**
 * Empty-chat greeting — one compact, centered composition. The composer
 * renders immediately below this block (see ChatPage), so the greeting,
 * starters, and input read as a single unit with no dead space between.
 */
export function EmptyState({ onSuggestion }: EmptyStateProps) {
  const setUi = useAppStore((state) => state.setUi)
  const hasLiveProvider = useAppStore((state) =>
    Object.values(state.credentials).some((credential) => credential.status === 'connected'),
  )

  return (
    <section className="pt-[max(6vh,2.5rem)] text-center">
      <UniverseMark size={34} className="text-ink" />
      <h2 className="mt-3 text-[clamp(1.625rem,2.8vw,2.125rem)] font-semibold leading-[1.15] tracking-[-0.02em] text-ink">
        Where should we begin?
      </h2>
      <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-soft">
        Ask anything, or start from one of these.
      </p>

      <div
        className="mx-auto mt-5 grid w-full max-w-[34rem] grid-cols-1 gap-2 sm:grid-cols-2"
        aria-label="Suggested starting points"
      >
        {SUGGESTIONS.map((suggestion) => {
          const tile = (
            <>
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent"
              >
                {suggestion.icon}
              </span>
              <span className="min-w-0 text-left">
                <span className="block text-[13.5px] font-medium text-ink">
                  {suggestion.title}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-faint">
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
              className="min-touch flex items-center gap-3 rounded-group border border-line bg-raised/60 px-3.5 py-3 text-left transition-[background-color,border-color,transform] duration-[var(--motion-fast)] hover:border-line-strong hover:bg-raised active:scale-[0.99]"
            >
              {tile}
            </button>
          ) : (
            <div
              key={suggestion.title}
              className="flex items-center gap-3 rounded-group border border-line bg-raised/60 px-3.5 py-3"
            >
              {tile}
            </div>
          )
        })}
      </div>

      {!hasLiveProvider && (
        <button
          type="button"
          onClick={() => setUi({ settingsOpen: true, settingsSection: 'providers' })}
          className="mt-5 inline-flex min-touch items-center gap-2 rounded-full border border-accent/40 bg-accent-soft px-4 py-2 text-[13px] font-medium text-accent transition-[background-color,border-color,transform] duration-[var(--motion-fast)] hover:border-accent hover:bg-accent-soft/70 active:scale-[0.98]"
        >
          <KeyRound size={14} />
          Connect your API key — bring any provider
        </button>
      )}
    </section>
  )
}
