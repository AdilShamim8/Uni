import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createAnthropic } from '@ai-sdk/anthropic'
import type { LanguageModel } from 'ai'
import type { ProviderDto } from '@uni/contracts'
import { resolveProviderEndpoint } from '../../lib/urlGuard.js'
import { createGuardedFetch, urlGuardOptions } from '../../lib/guardedTransport.js'
import type { Env } from '../../config/env.js'

/**
 * Provider transport for run execution: builds an AI SDK model from a
 * workspace provider row plus its decrypted credential.
 *
 * Generation traffic flows through the SAME guarded transport as
 * connection tests and discovery (audit F09): SSRF validation, pinned
 * DNS, refused redirects, and abortable deadlines apply to SDK calls —
 * not just to probes. Credentials live only in the Authorization /
 * x-api-key header of the outbound request — never in logs, events, or
 * the database.
 */

export interface ProviderForRun {
  id: string | null
  kind: ProviderDto['kind']
  endpointUrl: string
  modelId: string
  apiKey: string
}

export async function buildModelForRun(
  provider: ProviderForRun,
  env: Env,
): Promise<{ model: LanguageModel; resolvedEndpoint: string }> {
  const resolved = await resolveProviderEndpoint(provider.endpointUrl, urlGuardOptions(env))
  const endpointUrl = resolved.url.toString()
  const guardedFetch = createGuardedFetch(env, env.RUN_TIMEOUT_MS)

  if (provider.kind === 'anthropic') {
    const anthropic = createAnthropic({
      baseURL: endpointUrl,
      apiKey: provider.apiKey,
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
    apiKey: provider.apiKey,
    fetch: guardedFetch,
  })
  return {
    model: openaiCompatible.chatModel(provider.modelId),
    resolvedEndpoint: endpointUrl,
  }
}
