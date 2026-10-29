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

/**
 * Anthropic — the platform uses dashed ids (claude-sonnet-5-5), while some
 * aggregators show dotted names; these are the ids Anthropic's own API
 * expects.
 */
const ANTHROPIC: SuggestedModel[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'flagship' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'fast' },
  { id: 'claude-sonnet-4-5', label: 'Claude Sonnet 4.5', note: 'budget' },
]

/** Google AI Studio (Gemini) via its OpenAI-compatible endpoint. */
const GOOGLE: SuggestedModel[] = [
  { id: 'gemini-4-argon', label: 'Gemini 4 Argon', note: 'newest' },
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash', note: 'fast' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite', note: 'very cheap' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', note: 'budget' },
]

/** xAI Grok - ids match xAI's own API. */
const XAI: SuggestedModel[] = [
  { id: 'grok-4.7', label: 'Grok 4.7', note: 'newest' },
  { id: 'grok-4.5', label: 'Grok 4.5' },
  { id: 'grok-4', label: 'Grok 4' },
  { id: 'grok-3-mini', label: 'Grok 3 mini', note: 'affordable' },
]

/** DeepSeek - the stable aliases always point at the current models. */
const DEEPSEEK: SuggestedModel[] = [
  { id: 'deepseek-chat', label: 'DeepSeek Chat', note: 'stable alias' },
  { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner', note: 'reasoning' },
]

/** Groq - open models served at very high speed on a free tier. */
const GROQ: SuggestedModel[] = [
  { id: 'gpt-oss-120b', label: 'GPT-OSS 120B', note: 'free tier' },
  { id: 'gpt-oss-20b', label: 'GPT-OSS 20B', note: 'free tier' },
  { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile' },
  { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', note: 'fast' },
]

/** Mistral La Plateforme - the -latest aliases track current models. */
const MISTRAL: SuggestedModel[] = [
  { id: 'mistral-large-latest', label: 'Mistral Large', note: 'stable alias' },
  { id: 'mistral-small-latest', label: 'Mistral Small', note: 'stable alias' },
  { id: 'open-mistral-nemo', label: 'Mistral Nemo', note: 'budget' },
  { id: 'codestral-latest', label: 'Codestral', note: 'code' },
]

/**
 * OpenRouter - one key, hundreds of models. Ids are vendor-prefixed slugs;
 * the ':free' suffix marks OpenRouter's free tier (rate-limited, zero cost).
 */
const OPENROUTER: SuggestedModel[] = [
  { id: 'openai/gpt-6.1-terra', label: 'GPT-6.1 Terra (OpenAI)' },
  { id: 'anthropic/claude-sonnet-5.5', label: 'Claude Sonnet 5.5' },
  { id: 'google/gemini-4-argon', label: 'Gemini 4 Argon' },
  { id: 'x-ai/grok-4.7', label: 'Grok 4.7' },
  { id: 'z-ai/glm-5.3', label: 'GLM 5.3' },
  { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B', note: 'free' },
  { id: 'nvidia/nemotron-3.5-lightning:free', label: 'Nemotron 3.5 Lightning', note: 'free' },
  { id: 'thinkingmachines/inkling:free', label: 'Inkling', note: 'free' },
  { id: 'cohere/north-mini-code:free', label: 'North Mini Code', note: 'free' },
]

/** Cerebras - open models at extreme speed on a free tier. */
const CEREBRAS: SuggestedModel[] = [
  { id: 'gpt-oss-120b', label: 'GPT-OSS 120B', note: 'free tier' },
  { id: 'llama-3.3-70b', label: 'Llama 3.3 70B' },
  { id: 'llama-3.1-8b', label: 'Llama 3.1 8B', note: 'fast' },
  { id: 'qwen-3-32b', label: 'Qwen 3 32B' },
]

/** Together AI - open-model hosting with Turbo variants. */
const TOGETHER: SuggestedModel[] = [
  { id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', label: 'Llama 3.3 70B Turbo' },
  { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
  { id: 'Qwen/Qwen2.5-72B-Instruct-Turbo', label: 'Qwen 2.5 72B Turbo' },
]

/** Fireworks - fast open-model serving; ids carry the accounts path. */
const FIREWORKS: SuggestedModel[] = [
  { id: 'accounts/fireworks/models/llama-v3p3-70b-instruct', label: 'Llama 3.3 70B' },
  { id: 'accounts/fireworks/models/deepseek-v3', label: 'DeepSeek V3' },
  { id: 'accounts/fireworks/models/qwen2p5-72b-instruct', label: 'Qwen 2.5 72B' },
]

/** Perplexity - online models with built-in web search (sonar family). */
const PERPLEXITY: SuggestedModel[] = [
  { id: 'sonar', label: 'Sonar', note: 'search' },
  { id: 'sonar-pro', label: 'Sonar Pro', note: 'search' },
  { id: 'sonar-reasoning-pro', label: 'Sonar Reasoning Pro', note: 'search' },
  { id: 'sonar-deep-research', label: 'Sonar Deep Research', note: 'research' },
]

/** SambaNova - fast dedicated open-model serving. */
const SAMBANOVA: SuggestedModel[] = [
  { id: 'Meta-Llama-3.3-70B-Instruct', label: 'Llama 3.3 70B' },
  { id: 'DeepSeek-R1', label: 'DeepSeek R1', note: 'reasoning' },
  { id: 'Qwen3-32B', label: 'Qwen 3 32B' },
]

/** NVIDIA NIM (build.nvidia.com) - ids carry the org/model convention. */
const NVIDIA: SuggestedModel[] = [
  { id: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
  { id: 'deepseek-ai/deepseek-r1', label: 'DeepSeek R1', note: 'reasoning' },
  { id: 'nvidia/nemotron-3.5-lightning', label: 'Nemotron 3.5 Lightning' },
]

/** Host-specific catalogs. Keys are lowercased endpoint hostnames. */
const BY_HOST: Record<string, SuggestedModel[]> = {
  'api.openai.com': OPENAI,
  'api.anthropic.com': ANTHROPIC,
  'generativelanguage.googleapis.com': GOOGLE,
  'api.x.ai': XAI,
  'api.deepseek.com': DEEPSEEK,
  'api.groq.com': GROQ,
  'api.mistral.ai': MISTRAL,
  'openrouter.ai': OPENROUTER,
  'api.cerebras.ai': CEREBRAS,
  'api.together.xyz': TOGETHER,
  'api.fireworks.ai': FIREWORKS,
  'api.perplexity.ai': PERPLEXITY,
  'api.sambanova.ai': SAMBANOVA,
  'integrate.api.nvidia.com': NVIDIA,
}

/** Fallbacks by provider kind, used when the host is unknown or custom. */
const BY_KIND: Partial<Record<ProviderKind, SuggestedModel[]>> = {
  openai: OPENAI,
  anthropic: ANTHROPIC,
  google: GOOGLE,
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
