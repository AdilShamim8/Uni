import type { ChatAdapter, ChatRequest, ChatStreamHandlers } from '@/domain/chatAdapter'
import type { ProviderProfile } from '@/domain/types'

/**
 * Live chat adapter: streams completions straight from the user's own
 * provider endpoint to the browser. The vendor-neutral ChatAdapter
 * contract keeps every component provider-agnostic.
 *
 * - OpenAI-compatible endpoints use POST {base}/chat/completions with
 *   SSE deltas (choices[0].delta.content).
 * - Anthropic endpoints use POST {base}/v1/messages with SSE
 *   content_block_delta events.
 *
 * Tool selections stay local previews (they open labeled previews in the
 * app); the model receives the prompt itself. Attachments are described
 * by name only — files are never uploaded anywhere.
 */

function usesAnthropicProtocol(profile: ProviderProfile): boolean {
  return profile.kind === 'anthropic'
}

function chatCompletionsUrl(profile: ProviderProfile): string {
  const base = profile.endpointUrl.replace(/\/+$/, '')
  return /\/chat\/completions\/?$/.test(base) ? base : `${base}/chat/completions`
}

function messagesUrl(profile: ProviderProfile): string {
  const base = profile.endpointUrl.replace(/\/+$/, '')
  if (usesAnthropicProtocol(profile)) {
    return /\/v1$/.test(base) ? `${base}/messages` : `${base}/v1/messages`
  }
  return chatCompletionsUrl(profile)
}

function buildSystemPrompt(request: ChatRequest): string | undefined {
  const parts: string[] = ['You are Universe, a helpful assistant.']
  if (request.nickname.trim()) {
    parts.push(`Address the user as ${request.nickname.trim()}.`)
  }
  if (request.traits.trim()) {
    parts.push(`Persona notes: ${request.traits.trim()}.`)
  }
  if (request.attachments.length > 0) {
    const names = request.attachments.map((attachment) => attachment.name).join(', ')
    parts.push(
      `The user attached these files (names only, contents are not available in this build): ${names}.`,
    )
  }
  return parts.join(' ')
}

interface OpenAiChunk {
  choices?: Array<{ delta?: { content?: string | null } }>
}

interface AnthropicEvent {
  type?: string
  delta?: { text?: string }
}

async function readSseStream(
  response: Response,
  onEvent: (payload: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const body = response.body
  if (!body) throw new Error('The endpoint returned an empty stream.')
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      if (signal.aborted) {
        await reader.cancel().catch(() => undefined)
        return
      }
      const { done, value } = await reader.read()
      if (done) return
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (payload.length > 0 && payload !== '[DONE]') onEvent(payload)
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export function createLiveAdapter(
  profile: ProviderProfile,
  apiKey: string,
  modelId: string,
): ChatAdapter {
  const label = `Live · ${profile.label}`

  return {
    id: `live:${profile.id}`,
    label,

    async stream(
      request: ChatRequest,
      handlers: ChatStreamHandlers,
      signal: AbortSignal,
    ): Promise<void> {
      const system = buildSystemPrompt(request)
      const anthropic = usesAnthropicProtocol(profile)
      const url = messagesUrl(profile)

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (anthropic) {
        headers['x-api-key'] = apiKey
        headers['anthropic-version'] = '2023-06-01'
        headers['anthropic-dangerous-direct-browser-access'] = 'true'
      } else {
        headers.Authorization = `Bearer ${apiKey}`
      }

      const body = anthropic
        ? {
            model: modelId,
            max_tokens: 4096,
            stream: true,
            ...(system ? { system } : {}),
            messages: [
              ...request.history.map((turn) => ({ role: turn.role, content: turn.content })),
              { role: 'user' as const, content: request.prompt },
            ],
          }
        : {
            model: modelId,
            stream: true,
            messages: [
              ...(system ? [{ role: 'system' as const, content: system }] : []),
              ...request.history.map((turn) => ({ role: turn.role, content: turn.content })),
              { role: 'user' as const, content: request.prompt },
            ],
          }

      let response: Response
      try {
        response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal,
        })
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          handlers.onDone('stopped')
          return
        }
        handlers.onError({
          code: 'provider_error',
          message:
            'Could not reach the provider from this browser — check the endpoint URL, your network, and whether the provider allows direct browser (CORS) requests.',
        })
        return
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        const snippet = text.slice(0, 200).replace(/\s+/g, ' ').trim()
        if (response.status === 401) {
          handlers.onError({
            code: 'provider_error',
            message: '401 Unauthorized — the saved API key was rejected. Reconnect the provider in Settings.',
          })
          return
        }
        if (response.status === 404) {
          handlers.onError({
            code: 'provider_error',
            message: `404 Not found — the model “${modelId}” or endpoint path may be wrong for this provider.`,
          })
          return
        }
        handlers.onError({
          code: 'provider_error',
          message: `The provider returned HTTP ${response.status}${snippet ? ` — ${snippet}` : ''}`,
        })
        return
      }

      let receivedAny = false

      function emitDelta(text: string) {
        if (!text) return
        if (!receivedAny) {
          receivedAny = true
          handlers.onStart({ statusPrefix: `Live reply from ${profile.label}` })
        }
        handlers.onDelta(text)
      }

      try {
        await readSseStream(
          response,
          (payload) => {
            try {
              const parsed: unknown = JSON.parse(payload)
              if (anthropic) {
                const event = parsed as AnthropicEvent
                if (event.type === 'content_block_delta' && typeof event.delta?.text === 'string') {
                  emitDelta(event.delta.text)
                }
              } else {
                const chunk = parsed as OpenAiChunk
                const delta = chunk.choices?.[0]?.delta?.content
                if (typeof delta === 'string') emitDelta(delta)
              }
            } catch {
              /* skip malformed keep-alive lines */
            }
          },
          signal,
        )
        if (!receivedAny && !signal.aborted) {
          handlers.onError({
            code: 'provider_error',
            message: 'The provider connected but returned no content — try a different model.',
          })
          return
        }
        handlers.onDone(signal.aborted ? 'stopped' : 'complete')
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          handlers.onDone('stopped')
          return
        }
        handlers.onError({
          code: 'provider_error',
          message: 'The stream ended unexpectedly — the reply may be incomplete. Try again or switch models.',
        })
      }
    },
  }
}
