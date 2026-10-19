import { Coffee, KeyRound, Lightbulb, Mail, Sparkles } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { UniMark } from '@/components/layout/UniMark'

const SUGGESTIONS = [
  {
    icon: <Lightbulb size={14} />,
    title: 'Explain something',
    prompt: 'Explain how something works, in plain language',
  },
  {
    icon: <Mail size={14} />,
    title: 'Draft an email',
    prompt: 'Draft a short, friendly email',
  },
  {
    icon: <Sparkles size={14} />,
    title: 'Brainstorm names',
    prompt: 'Brainstorm names for a side project',
  },
  {
    icon: <Coffee size={14} />,
    title: 'Plan a weekend',
    prompt: 'Plan a relaxed weekend',
  },
] as const

/**
 * The greeting half of the empty-chat welcome composition: a small centered
 * mark, a large short headline, and one concise supporting sentence. The
 * composer renders directly below this (see ChatPage), so the greeting,
 * input, starters, and recent work read as one centered unit.
 *
 * Headline targets 44–52px on desktop and 32–36px on phones via a single
 * fluid clamp; it never wraps awkwardly thanks to the generous measure.
 */
export function WelcomeHeading() {
  return (
    <section className="pb-7 pt-[max(9vh,3.25rem)] text-center">
      <UniMark size={36} className="mx-auto text-ink" />
      <h2 className="mx-auto mt-4 max-w-[15ch] text-balance text-[clamp(2rem,4.1vw,3.2rem)] font-semibold leading-[1.08] tracking-[-0.022em] text-ink">
        What would you like to create?
      </h2>
      <p className="mx-auto mt-3 max-w-[46ch] text-[15.5px] leading-relaxed text-ink-soft">
        Ask anything, draft something new, or pick up where you left off.
      </p>
    </section>
  )
}

/**
 * The compact starter row that sits below the composer — small quiet chips,
 * never dominant cards competing with the input for attention.
 */
export function StarterRow({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  return (
    <div className="mt-4" aria-label="Suggested starting points">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.title}
            type="button"
            onClick={() => onSuggestion(suggestion.prompt)}
            className="press min-touch inline-flex items-center gap-1.5 rounded-full border border-line/80 bg-raised/70 px-3.5 py-1.5 text-[13.5px] font-medium text-ink-soft transition-[background-color,border-color,color] duration-[var(--motion-fast)] hover:border-line-strong hover:bg-raised hover:text-ink"
          >
            <span aria-hidden="true" className="text-ink-faint">
              {suggestion.icon}
            </span>
            {suggestion.title}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * A modest inline provider-connect action for the empty state — shown only
 * when no provider is connected. Wording stays accurate: Uni supports
 * specific provider protocols (OpenAI, Anthropic, Google, and
 * OpenAI-compatible endpoints such as Groq or OpenRouter, plus local
 * runtimes) — it is not an arbitrary "any provider" bridge.
 */
export function ProviderHint() {
  const setUi = useAppStore((state) => state.setUi)
  const hasLiveProvider = useAppStore((state) =>
    Object.values(state.credentials).some((credential) => credential.status === 'connected'),
  )
  if (hasLiveProvider) return null

  return (
    <p className="mt-5 text-center text-[13px] leading-relaxed text-ink-faint">
      You&apos;re on the local demo — nothing leaves this device.{' '}
      <button
        type="button"
        onClick={() => setUi({ settingsOpen: true, settingsSection: 'providers' })}
        className="press inline-flex min-touch items-center gap-1.5 rounded-control font-medium text-accent transition-colors duration-[var(--motion-fast)] hover:text-accent-strong"
      >
        <KeyRound size={13} aria-hidden="true" />
        Connect a supported provider
      </button>{' '}
      — OpenAI, Anthropic, Google, Groq, OpenRouter, or a local runtime.
    </p>
  )
}
