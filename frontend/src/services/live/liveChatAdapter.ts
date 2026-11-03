import type { ChatAdapter, ChatRequest, ChatStreamHandlers } from '@/domain/chatAdapter'
import type { ProviderProfile } from '@/domain/types'
import { normalizeProviderBase } from '@/domain/providerDescriptors'
import { findEventBoundary, parseSseBlock } from '@/services/sse/sseParser'

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

/** True when the endpoint is OpenRouter — used for its optional headers. */
function isOpenRouter(profile: ProviderProfile): boolean {
  try {
    return new URL(profile.endpointUrl).hostname.toLowerCase() === 'openrouter.ai'
  } catch {
    return false
  }
}

function chatCompletionsUrl(profile: ProviderProfile): string {
  const base = profile.endpointUrl.replace(/\/+$/, '')
  return /\/chat\/completions\/?$/.test(base) ? base : `${base}/chat/completions`
}

function messagesUrl(profile: ProviderProfile): string {
  if (usesAnthropicProtocol(profile)) {
    // The descriptor registry's versioned-base policy (U011): the same
    // normalization feeds discovery's /models and this /messages route,
    // so root, `/v1`, and gateway prefixes can never diverge.
    return `${normalizeProviderBase('anthropic', profile.endpointUrl)}/messages`
  }
  return chatCompletionsUrl(profile)
}

function buildSystemPrompt(request: ChatRequest): string | undefined {
  const parts: string[] = ['You are Uni, a helpful assistant.']
  if (request.system?.trim()) {
    parts.push(`The user is chatting with a saved agent. Follow these instructions: ${request.system.trim()}`)
  }
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
  choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>
  /** Providers stream errors as data payloads — terminal, never "complete". */
  error?: { message?: string }
}

interface AnthropicEvent {
  type?: string
  delta?: { text?: string }
  error?: { message?: string }
}

async function readSseStream(
  response: Response,
  onEvent: (payload: string, eventName?: string) => void,
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
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // Dispatch only COMPLETE events (blank-line terminated); CRLF and
      // LF boundaries both count. This is the m07 SSE hardening (F13):
      // chunk boundaries can no longer split an event in half.
      for (;;) {
        const boundary = findEventBoundary(buffer)
        if (!boundary) break
        const block = buffer.slice(0, boundary.end)
        buffer = buffer.slice(boundary.end)
        const parsed = parseSseBlock(block)
        if (parsed && parsed.data.length > 0) {
          onEvent(parsed.data, parsed.event)
        }
      }
    }
    // Flush the decoder, then a trailing event that arrived WITHOUT a
    // final blank line — previously silently dropped (F13).
    buffer += decoder.decode()
    const trailing = parseSseBlock(buffer)
    if (trailing && trailing.data.length > 0) {
      onEvent(trailing.data, trailing.event)
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

      // Keyless generation (N003): a local runtime is never sent a dummy
      // Authorization header — an empty key means NO credential header.
      // The Anthropic protocol always requires its key (the connection
      // flow blocks keyless Anthropic profiles), so its headers stay
      // keyed-only.
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey) {
        if (anthropic) {
          headers['x-api-key'] = apiKey
          headers['anthropic-version'] = '2023-06-01'
          headers['anthropic-dangerous-direct-browser-access'] = 'true'
        } else {
          headers.Authorization = `Bearer ${apiKey}`
        }
      }
      if (!anthropic && isOpenRouter(profile)) {
        // OpenRouter's optional attribution header (their docs recommend it
        // so requests from Uni show up under an app name, not "unknown").
        headers['X-Title'] = 'Uni'
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
      let errored = false
      let sawTerminal = false

      function emitDelta(text: string) {
        if (!text) return
        if (!receivedAny) {
          receivedAny = true
          handlers.onStart({ statusPrefix: `Live reply from ${profile.label}` })
        }
        handlers.onDelta(text)
      }

      function emitProviderError(message: string) {
        if (errored) return
        errored = true
        handlers.onError({ code: 'provider_error', message })
      }

      try {
        await readSseStream(
          response,
          (payload, eventName) => {
            // Protocol-level error frames are terminal (F13): an upstream
            // error can never end the turn as "complete".
            if (eventName === 'error') {
              try {
                const parsed = JSON.parse(payload) as AnthropicEvent
                emitProviderError(
                  parsed.error?.message ?? 'The provider reported an error mid-stream — the reply may be incomplete.',
                )
              } catch {
                emitProviderError('The provider reported an error mid-stream — the reply may be incomplete.')
              }
              return
            }
            // The OpenAI-compatible [DONE] sentinel is protocol-level
            // terminal evidence (F05).
            if (payload === '[DONE]') {
              sawTerminal = true
              return
            }
            try {
              const parsed: unknown = JSON.parse(payload)
              if (anthropic) {
                const event = parsed as AnthropicEvent
                if (event.type === 'error') {
                  emitProviderError(
                    event.error?.message ?? 'The provider reported an error mid-stream — the reply may be incomplete.',
                  )
                  return
                }
                if (event.type === 'message_stop') {
                  sawTerminal = true
                  return
                }
                if (event.type === 'content_block_delta' && typeof event.delta?.text === 'string') {
                  emitDelta(event.delta.text)
                }
              } else {
                const chunk = parsed as OpenAiChunk
                if (chunk.error) {
                  emitProviderError(
                    chunk.error.message ?? 'The provider reported an error mid-stream — the reply may be incomplete.',
                  )
                  return
                }
                const choice = chunk.choices?.[0]
                if (typeof choice?.finish_reason === 'string' && choice.finish_reason.length > 0) {
                  sawTerminal = true
                }
                const delta = choice?.delta?.content
                if (typeof delta === 'string') emitDelta(delta)
              }
            } catch {
              /* skip malformed keep-alive lines */
            }
          },
          signal,
        )
        if (errored) return
        if (!receivedAny && !signal.aborted) {
          handlers.onError({
            code: 'provider_error',
            message: 'The provider connected but returned no content — try a different model.',
          })
          return
        }
        // EOF is not proof of completion (F05): without protocol-level
        // terminal evidence ([DONE], a finish reason, or message_stop)
        // the turn ends 'interrupted' — partial text preserved, never
        // presented as complete.
        handlers.onDone(signal.aborted ? 'stopped' : sawTerminal ? 'complete' : 'interrupted')
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
