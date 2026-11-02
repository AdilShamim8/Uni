import type { ProviderKind } from '@/domain/types'
import type { SuggestedModel } from './suggestedModels'

/**
 * The free-models catalog — every curated $0 route to a working model
 * connection, in one place.
 *
 * Uni itself is free and open; the intelligence comes from providers,
 * and several of them genuinely cost nothing: real free tiers, rotating
 * `:free` models, and local servers that run on the user's own machine.
 * This module is the honest, curated map of those routes — what you get,
 * what the limits are, where to get a key, and which models to try
 * first — so a beginner can go from zero to a live premium-style chat
 * without paying anything.
 *
 * Honesty rules (mirrored by tests):
 * - `limits` states the real catch of each free tier — no "unlimited
 *   forever" claims that are not true.
 * - `signupUrl` is the provider's own console/docs page, never an
 *   affiliate or tracking link.
 * - Local routes need no key at all; they say so.
 */

/** One curated $0 route to a working model connection. */
export interface FreeRoute {
  /** Stable id for tests and React keys. */
  id: string
  /** Provider label — matches the presets list where one exists. */
  label: string
  /** Provider kind for the profile form. */
  kind: ProviderKind
  /** Endpoint base URL the route connects to. */
  endpointUrl: string
  /** One-line "what you get" for the card. */
  headline: string
  /** The honest catch: rate limits, rotating catalogs, credits. */
  limits: string
  /** Where a key comes from ('' for local routes that need no key). */
  signupUrl: string
  /** Beginner steps, in order, from "open this page" to "paste the key". */
  steps: string[]
  /** Suggested starter models for this route. */
  models: SuggestedModel[]
  /** True when the route runs on the user's own machine (no key, no cloud). */
  local: boolean
}

export const FREE_ROUTES: readonly FreeRoute[] = [
  {
    id: 'groq',
    label: 'Groq',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.groq.com/openai/v1',
    headline: 'Frontier open models at extreme speed',
    limits: 'Free tier with daily request limits — plenty for personal chat.',
    signupUrl: 'https://console.groq.com/keys',
    steps: [
      'Open console.groq.com and sign up (email or Google — free).',
      'Go to API Keys and create a key — it starts with gsk-…',
      'Copy the key, paste it below, and press Connect.',
    ],
    models: [
      { id: 'gpt-oss-120b', label: 'GPT-OSS 120B', note: 'free tier' },
      { id: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile' },
      { id: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', note: 'fast' },
    ],
    local: false,
  },
  {
    id: 'google-ai-studio',
    label: 'Google AI Studio · Gemini',
    kind: 'google',
    endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    headline: 'Gemini models with a generous free tier',
    limits: 'Free tier with per-minute rate limits; a card is not required.',
    signupUrl: 'https://aistudio.google.com/apikey',
    steps: [
      'Open aistudio.google.com/apikey and sign in with a Google account.',
      'Click Create API key and copy it.',
      'Paste the key below and press Connect.',
    ],
    models: [
      { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', note: 'balanced' },
      { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash', note: 'budget' },
    ],
    local: false,
  },
  {
    id: 'openrouter-free',
    label: 'OpenRouter · free models',
    kind: 'openai-compatible',
    endpointUrl: 'https://openrouter.ai/api/v1',
    headline: 'One key, hundreds of models — many at $0',
    limits: 'Models whose id ends in :free cost nothing and rotate often.',
    signupUrl: 'https://openrouter.ai/settings/keys',
    steps: [
      'Open openrouter.ai, sign up, and go to Settings → Keys.',
      'Create a key and copy it.',
      'Paste the key below and press Connect — the :free models appear in the discovered list.',
    ],
    models: [
      { id: 'google/gemma-3-27b-it:free', label: 'Gemma 3 27B', note: 'free' },
      { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3', note: 'free' },
      { id: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B', note: 'free' },
    ],
    local: false,
  },
  {
    id: 'mistral',
    label: 'Mistral',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.mistral.ai/v1',
    headline: 'Mistral models on a free experiment plan',
    limits: 'Free tier with usage limits per month on the La Plateforme console.',
    signupUrl: 'https://console.mistral.ai/',
    steps: [
      'Open console.mistral.ai and sign up.',
      'Create an API key from the console.',
      'Paste the key below and press Connect.',
    ],
    models: [
      { id: 'mistral-small-latest', label: 'Mistral Small', note: 'stable alias' },
      { id: 'open-mistral-nemo', label: 'Mistral Nemo', note: 'budget' },
    ],
    local: false,
  },
  {
    id: 'cerebras',
    label: 'Cerebras',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.cerebras.ai/v1',
    headline: 'Open models at some of the fastest speeds available',
    limits: 'Free tier with daily request limits.',
    signupUrl: 'https://cloud.cerebras.ai/',
    steps: [
      'Open cloud.cerebras.ai and sign up.',
      'Create an API key from the dashboard.',
      'Paste the key below and press Connect.',
    ],
    models: [
      { id: 'gpt-oss-120b', label: 'GPT-OSS 120B', note: 'free tier' },
      { id: 'llama-3.3-70b', label: 'Llama 3.3 70B' },
    ],
    local: false,
  },
  {
    id: 'nvidia-nim',
    label: 'NVIDIA NIM',
    kind: 'openai-compatible',
    endpointUrl: 'https://integrate.api.nvidia.com/v1',
    headline: 'NVIDIA-hosted open models with free credits',
    limits: 'Free credits on signup; when they run out, usage is limited.',
    signupUrl: 'https://build.nvidia.com/',
    steps: [
      'Open build.nvidia.com and sign up for a free account.',
      'Generate an API key from any model page.',
      'Paste the key below and press Connect.',
    ],
    models: [
      { id: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B' },
      { id: 'nvidia/llama-3.1-nemotron-70b-instruct', label: 'Llama 3.1 Nemotron 70B' },
    ],
    local: false,
  },
  {
    id: 'huggingface-router',
    label: 'HuggingFace Router',
    kind: 'openai-compatible',
    endpointUrl: 'https://router.huggingface.co/v1',
    headline: 'Every open model on HuggingFace, one endpoint',
    limits: 'Free monthly credits included; serverless and dedicated routes vary.',
    signupUrl: 'https://huggingface.co/settings/tokens',
    steps: [
      'Open huggingface.co/settings/tokens and sign in.',
      'Create a token with the Inference permission.',
      'Paste the token below as the API key and press Connect.',
    ],
    models: [
      { id: 'meta-llama/Llama-3.3-70B-Instruct', label: 'Llama 3.3 70B' },
      { id: 'Qwen/Qwen3-32B', label: 'Qwen 3 32B' },
    ],
    local: false,
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    kind: 'local',
    endpointUrl: 'http://localhost:11434/v1',
    headline: 'Run models on your own machine — fully offline, fully free',
    limits: 'No key, no account, no network. Speed depends on your hardware.',
    signupUrl: '',
    steps: [
      'Download Ollama from ollama.com and install it.',
      'Pull a model in a terminal: ollama pull llama3.2',
      'Leave Ollama running — no key is needed, just press Connect.',
    ],
    models: [
      { id: 'llama3.2', label: 'Llama 3.2' },
      { id: 'qwen3:8b', label: 'Qwen 3 8B' },
    ],
    local: true,
  },
  {
    id: 'lm-studio',
    label: 'LM Studio (local)',
    kind: 'local',
    endpointUrl: 'http://localhost:1234/v1',
    headline: 'A desktop app for local models — point and click',
    limits: 'No key, no account. Runs offline on Windows, macOS, and Linux.',
    signupUrl: '',
    steps: [
      'Download LM Studio from lmstudio.ai and install it.',
      'Download a model in the app (e.g. a small Llama or Qwen).',
      'Start the local server (Developer tab) — no key is needed, just press Connect.',
    ],
    models: [
      { id: 'gpt-oss:20b', label: 'GPT-OSS 20B' },
      { id: 'qwen3:8b', label: 'Qwen 3 8B' },
    ],
    local: true,
  },
]

/**
 * Find the free route a provider draft is currently targeting, if any.
 * Matches on endpoint URL (trimmed) and kind — the two fields a route
 * fills in — so a hand-typed URL that happens to match still gets the
 * guide. Label is deliberately not matched: users rename profiles.
 */
export function freeRouteFor(kind: ProviderKind, endpointUrl: string): FreeRoute | null {
  const trimmed = endpointUrl.trim()
  if (trimmed.length === 0) return null
  return (
    FREE_ROUTES.find(
      (route) => route.endpointUrl === trimmed && route.kind === kind,
    ) ?? null
  )
}

/**
 * A free route that has been RETIRED from the catalog (U018): it no
 * longer appears as an active choice, but existing profiles pointing at
 * it get an honest explanation. Uni NEVER moves a stored credential to
 * another host automatically — the user decides where a key goes next.
 */
export interface RetiredRoute {
  id: string
  label: string
  /** Hostnames whose profiles should see the retirement explanation. */
  hosts: string[]
  explanation: string
}

export const RETIRED_FREE_ROUTES: readonly RetiredRoute[] = [
  {
    id: 'github-models',
    label: 'GitHub Models',
    hosts: ['models.github.ai', 'models.inference.ai.azure.com'],
    explanation:
      'GitHub Models was retired as a curated free route — its catalog and terms changed, so Uni no longer recommends it or onboards new setups through it. This profile and its key stay exactly as you saved them: nothing was moved to another host. You can keep using it if it still works for you, or move the key yourself to any other route above.',
  },
]

/** The retirement explanation for a provider's endpoint, when one applies. */
export function retiredRouteFor(endpointUrl: string): RetiredRoute | null {
  try {
    const hostname = new URL(endpointUrl).hostname.toLowerCase()
    return RETIRED_FREE_ROUTES.find((route) => route.hosts.includes(hostname)) ?? null
  } catch {
    return null
  }
}
