/**
 * Verified model capability metadata (U015): whether a model supports
 * image input, audio input, tool use, or reasoning — and what the
 * ADAPTER can actually send. A capability control is enabled only when
 * BOTH the adapter implements it AND the model supports it; anything
 * unverified is labeled unknown, never silently enabled.
 *
 * Resolution order (most trustworthy first):
 *  1. Verified provider metadata captured at discovery time (e.g.
 *     OpenRouter's architecture.input_modalities / supported_parameters).
 *  2. Curated, documented model families (conservative: only families
 *     whose support is publicly documented match; a miss is 'unknown',
 *     never 'unsupported' — absence of a match is not proof of absence).
 */

export type CapabilitySupport = 'supported' | 'unsupported' | 'unknown'

export interface ModelCapabilitySet {
  imageInput: CapabilitySupport
  audioInput: CapabilitySupport
  toolUse: CapabilitySupport
  reasoning: CapabilitySupport
}

/** Verified per-model facts captured from a discovery response. */
export interface VerifiedModelMetadata {
  imageInput?: boolean
  audioInput?: boolean
  toolUse?: boolean
  reasoning?: boolean
}

/** What the active chat adapter can actually send/do (U015). */
export interface AdapterCapabilities {
  imageInput: boolean
  audioInput: boolean
  toolUse: boolean
  reasoning: boolean
}

export const TEXT_ONLY_ADAPTER: AdapterCapabilities = {
  imageInput: false,
  audioInput: false,
  toolUse: false,
  reasoning: false,
}

// Documented vision-capable families (vendor model documentation).
const IMAGE_INPUT_FAMILIES: RegExp[] = [
  /gpt-4o/,
  /gpt-4\.1/,
  /gpt-4-turbo/,
  /chatgpt-4o/,
  /^o[34](-mini|-preview)?($|[-.])/,
  /claude-3/,
  /claude-(opus|sonnet|haiku)/,
  /gemini/,
  /-vl($|[-.])/,
  /vl-/,
  /vision/,
  /pixtral/,
  /llava/,
]

// Families documented to accept audio input in chat requests.
const AUDIO_INPUT_FAMILIES: RegExp[] = [/gpt-4o.*audio/, /audio-preview/, /gemini.*(live|audio)/]

// Families documented to support tool/function calling.
const TOOL_USE_FAMILIES: RegExp[] = [
  /gpt-3\.5-turbo/,
  /gpt-4/,
  /chatgpt-4o/,
  /^o[34](-mini|-preview)?($|[-.])/,
  /claude-3/,
  /claude-(opus|sonnet|haiku)/,
  /gemini/,
  /llama-?3[._-][1-9]/,
  /llama-?4/,
  /mistral-(large|medium|small)/,
  /qwen/,
  /deepseek/,
  /grok/,
]

// Families with documented reasoning/thinking modes.
const REASONING_FAMILIES: RegExp[] = [
  /^o[134](-mini|-preview)?($|[-.])/,
  /deepseek-r1/,
  /qwq/,
  /claude.*thinking/,
  /claude-3-7/,
  /claude-(opus|sonnet)-4/,
  /gemini-2\.5/,
]

function familySupported(modelId: string, families: RegExp[]): boolean {
  const id = modelId.toLowerCase()
  return families.some((pattern) => pattern.test(id))
}

/**
 * Resolve a model's capability set. Verified metadata wins for the
 * fields it actually contains; documented families mark supported;
 * everything else is honestly 'unknown'.
 */
export function resolveModelCapabilities(
  modelId: string,
  verified?: VerifiedModelMetadata,
): ModelCapabilitySet {
  const pick = (verifiedValue: boolean | undefined, families: RegExp[]): CapabilitySupport => {
    if (verifiedValue !== undefined) return verifiedValue ? 'supported' : 'unsupported'
    return familySupported(modelId, families) ? 'supported' : 'unknown'
  }
  return {
    imageInput: pick(verified?.imageInput, IMAGE_INPUT_FAMILIES),
    audioInput: pick(verified?.audioInput, AUDIO_INPUT_FAMILIES),
    toolUse: pick(verified?.toolUse, TOOL_USE_FAMILIES),
    reasoning: pick(verified?.reasoning, REASONING_FAMILIES),
  }
}

/**
 * Extract verified per-model metadata from a discovery response body
 * (OpenRouter-style entries: architecture.input_modalities and
 * supported_parameters). Only fields actually present are returned —
 * a provider that says nothing about a capability leaves it unknown.
 */
export function extractVerifiedModelMetadata(bodyText: string): Map<string, VerifiedModelMetadata> {
  const map = new Map<string, VerifiedModelMetadata>()
  let parsed: unknown
  try {
    parsed = JSON.parse(bodyText)
  } catch {
    return map
  }
  if (typeof parsed !== 'object' || parsed === null) return map
  const data = (parsed as { data?: unknown }).data
  if (!Array.isArray(data)) return map

  for (const entry of data) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    if (typeof record.id !== 'string' || record.id.length === 0) continue

    const metadata: VerifiedModelMetadata = {}
    const architecture =
      typeof record.architecture === 'object' && record.architecture !== null
        ? (record.architecture as Record<string, unknown>)
        : undefined
    const modalities = Array.isArray(architecture?.input_modalities)
      ? (architecture?.input_modalities as unknown[])
      : undefined
    if (modalities) {
      const includes = (name: string) => modalities.some((m) => m === name)
      if (modalities.every((m) => typeof m === 'string')) {
        metadata.imageInput = includes('image')
        metadata.audioInput = includes('audio')
      }
    }
    const parameters = Array.isArray(record.supported_parameters)
      ? (record.supported_parameters as unknown[])
      : undefined
    if (parameters && parameters.every((p) => typeof p === 'string')) {
      metadata.toolUse = parameters.includes('tools')
      metadata.reasoning = parameters.includes('reasoning')
    }
    if (Object.keys(metadata).length > 0) map.set(record.id, metadata)
  }
  return map
}

/**
 * Combine adapter and model support into one control verdict (U015):
 * enabled only when both support it; a reason explains every disabled
 * or unknown state so the UI can label it honestly.
 */
export interface ControlVerdict {
  enabled: boolean
  state: 'supported' | 'unsupported' | 'unknown' | 'adapter-unsupported'
  reason: string
}

export function controlVerdict(
  capability: keyof AdapterCapabilities,
  adapter: AdapterCapabilities,
  model: ModelCapabilitySet,
  labels: { adapter: string; model: string },
): ControlVerdict {
  const modelState = model[capability]
  if (modelState === 'unsupported') {
    return {
      enabled: false,
      state: 'unsupported',
      reason: `${labels.model} does not support this capability.`,
    }
  }
  if (!adapter[capability]) {
    return {
      enabled: false,
      state: 'adapter-unsupported',
      reason: `${labels.model} may support it, but the current connection (${labels.adapter}) does not send this capability yet.`,
    }
  }
  if (modelState === 'unknown') {
    return {
      enabled: false,
      state: 'unknown',
      reason: `${labels.model} support is unknown — verify with the provider before using it.`,
    }
  }
  return { enabled: true, state: 'supported', reason: '' }
}
