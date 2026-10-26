import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { createAnthropic } from '@ai-sdk/anthropic'
import type { LanguageModel } from 'ai'
import type { ProviderDto } from '@uni/contracts'
import { resolveProviderEndpoint } from '../../lib/urlGuard.js'
import type { Env } from '../../config/env.js'

/**
 * Provider transport for run execution: builds an AI SDK model from a
 * workspace provider row plus its decrypted credential.
 *
 * The endpoint goes through the same SSRF guard as the connection test
 * (approved HTTPS destinations by default; loopback only with the
 * operator's explicit local-model opt-in). Credentials live only in the
 * Authorization/x-api-key header of the outbound request — never in
 * logs, events, or the database.
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
  const resolved = await resolveProviderEndpoint(provider.endpointUrl, {
    allowLocalEndpoints: env.ALLOW_LOCAL_MODEL_ENDPOINTS === 'true',
    allowlist: env.LOCAL_MODEL_ENDPOINT_ALLOWLIST.split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  })
  const endpointUrl = resolved.url.toString()

  if (provider.kind === 'anthropic') {
    const anthropic = createAnthropic({
      baseURL: endpointUrl,
      apiKey: provider.apiKey,
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
  })
  return {
    model: openaiCompatible.chatModel(provider.modelId),
    resolvedEndpoint: endpointUrl,
  }
}
