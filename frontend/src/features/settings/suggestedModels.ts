import type { ProviderKind } from '@/domain/types'

/**
 * Suggested models for the provider form. One-tap quick-fill chips so a
 * beginner never has to hunt for a model id: tap a preset provider, tap a
 * suggested model, connect a key — done. Every suggestion stays editable in
 * the model editor afterwards, and connecting a key still discovers the
 * endpoint's live model list (suggestions never override discovery).
 *
 * Catalogs are matched by the endpoint's hostname first (the provider the
 * user is actually configuring), with a per-kind fallback for custom
 * endpoints. Model ids are the ids the provider's own API expects.
 */

export interface SuggestedModel {
  /** Model id exactly as the provider API expects it. */
  id: string
  /** Human-friendly display label. */
  label: string
  /** Short honest note rendered on the chip (e.g. "free", "fast"). */
  note?: string
}

/** OpenAI — ids are the platform's own short ids. */
const OPENAI: SuggestedModel[] = [
  { id: 'gpt-6.1-terra', label: 'GPT-6.1 Terra', note: 'newest' },
  { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol' },
  { id: 'gpt-5.5', label: 'GPT-5.5' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', note: 'affordable' },
  { id: 'gpt-5-mini', label: 'GPT-5 mini', note: 'affordable' },
  { id: 'gpt-4o-mini', label: 'GPT-4o mini', note: 'budget' },
]

/** Host-specific catalogs. Keys are lowercased endpoint hostnames. */
const BY_HOST: Record<string, SuggestedModel[]> = {
  'api.openai.com': OPENAI,
}

/** Fallbacks by provider kind, used when the host is unknown or custom. */
const BY_KIND: Partial<Record<ProviderKind, SuggestedModel[]>> = {
  openai: OPENAI,
}

/**
 * Resolve suggestions for a provider draft. The hostname match wins when the
 * endpoint is a recognizable provider; otherwise the kind fallback applies;
 * unknown hosts with a generic kind return none (honest: no guesses for
 * endpoints we cannot speak for).
 */
export function suggestedModelsFor(kind: ProviderKind, endpointUrl: string): SuggestedModel[] {
  const trimmed = endpointUrl.trim()
  if (trimmed.length > 0) {
    try {
      const host = new URL(trimmed).hostname.toLowerCase()
      const byHost = BY_HOST[host]
      if (byHost) return byHost
    } catch {
      /* not a parseable URL yet — fall through to the kind fallback */
    }
  }
  return BY_KIND[kind] ?? []
}
