import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createAnthropic } from '@ai-sdk/anthropic'
import type { LanguageModel } from 'ai'
import type { ProviderDto } from '@uni/contracts'
import { resolveProviderEndpoint } from '../../lib/urlGuard.js'
import { createGuardedFetch, urlGuardOptions } from '../../lib/guardedTransport.js'
import { anthropicApiBase, type ProviderAuthMode } from '../../lib/providerUrls.js'
import type { Env } from '../../config/env.js'

/**
 * Provider transport for run execution: builds an AI SDK model from a
 * workspace provider row plus its credential (when it has one).
 *
 * Generation traffic flows through the SAME guarded transport as
 * connection tests and discovery (audit F09): SSRF validation, pinned
 * DNS, refused redirects, and abortable deadlines apply to SDK calls —
 * not just to probes. Credentials live only in the Authorization /
 * x-api-key header of the outbound request — never in logs, events, or
 * the database.
 *
 * Keyless generation (N002): a connection with authMode 'none' passes
 * NO credential to the SDK, so the outbound request carries no
 * Authorization header at all — a local runtime is never sent a dummy
 * key. Both SDKs omit their credential headers when none is provided.
 */

export interface ProviderForRun {
  id: string | null
  kind: ProviderDto['kind']
  endpointUrl: string
  modelId: string
  /** Explicit credential transport (N001). */
  authMode: ProviderAuthMode
  /** Null for genuinely keyless connections (authMode 'none'). */
  apiKey: string | null
}

export async function buildModelForRun(
  provider: ProviderForRun,
  env: Env,
): Promise<{ model: LanguageModel; resolvedEndpoint: string }> {
  const resolved = await resolveProviderEndpoint(provider.endpointUrl, urlGuardOptions(env))
  const endpointUrl = resolved.url.toString()
  const guardedFetch = createGuardedFetch(env, env.RUN_TIMEOUT_MS)

  if (provider.kind === 'anthropic') {
    // The SDK appends `/messages` to this base (and only inserts `/v1`
    // for its exact official host), so generation must receive the
    // same versioned base that discovery probes `<base>/models` on
    // (F08). Root, `/v1`, and custom gateway prefixes all normalize
    // through anthropicApiBase — never a bare `/messages` route.
    //
    // Auth mode chooses the SDK's credential transport (N001):
    // 'native' → x-api-key, 'bearer' → Authorization: Bearer (some
    // Anthropic-protocol gateways authenticate this way), 'none' → no
    // credential at all (defensive; the API layer rejects keyless
    // Anthropic connections before a run is accepted).
    const anthropic =
      provider.authMode === 'bearer' && provider.apiKey
        ? createAnthropic({
            baseURL: anthropicApiBase(provider.endpointUrl),
            authToken: provider.apiKey,
            fetch: guardedFetch,
          })
        : createAnthropic({
            baseURL: anthropicApiBase(provider.endpointUrl),
            ...(provider.apiKey ? { apiKey: provider.apiKey } : {}),
            fetch: guardedFetch,
          })
    return {
      model: anthropic.languageModel(provider.modelId),
      resolvedEndpoint: endpointUrl,
    }
  }

  const openaiCompatible = createOpenAICompatible({
    baseURL: endpointUrl,
    name: 'uni-provider',
    ...(provider.apiKey && provider.authMode !== 'none' ? { apiKey: provider.apiKey } : {}),
    fetch: guardedFetch,
  })
  return {
    model: openaiCompatible.chatModel(provider.modelId),
    resolvedEndpoint: endpointUrl,
  }
}
