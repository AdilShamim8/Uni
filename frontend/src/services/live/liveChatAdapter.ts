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
  choices?: Array<{ delta?: { content?: string | null } }>
  /** Providers stream errors as data payloads — terminal, never "complete". */
  error?: { message?: string }
}

interface AnthropicEvent {
  type?: string
  delta?: { text?: string }
  error?: { message?: string }
}

/** One parsed SSE event: joined multiline data + optional event name. */
interface SseEvent {
  event?: string
  data: string
}

function parseSseBlock(block: string): SseEvent | null {
  const dataLines: string[] = []
  let eventName: string | undefined
  for (const rawLine of block.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (line.startsWith(':')) continue // comment / keep-alive
    if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
    else if (line.startsWith('event:')) eventName = line.slice(6).replace(/^ /, '').trim()
  }
  if (dataLines.length === 0) return null
  // The SSE spec joins multiple data lines with newlines.
  return { event: eventName, data: dataLines.join('\n') }
}

function findEventBoundary(buffer: string): { end: number } | null {
  const match = buffer.match(/\r?\n\r?\n/)
  if (!match || match.index === undefined) return null
  return { end: match.index + match[0].length }
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
        if (parsed && parsed.data.length > 0 && parsed.data !== '[DONE]') {
          onEvent(parsed.data, parsed.event)
        }
      }
    }
    // Flush the decoder, then a trailing event that arrived WITHOUT a
    // final blank line — previously silently dropped (F13).
    buffer += decoder.decode()
    const trailing = parseSseBlock(buffer)
    if (trailing && trailing.data.length > 0 && trailing.data !== '[DONE]') {
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
      let errored = false

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
                const delta = chunk.choices?.[0]?.delta?.content
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
