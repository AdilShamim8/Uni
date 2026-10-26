import { API_ROOT, apiUrl } from './client'

/**
 * Server-run API calls: create (idempotent), cancel, and the SSE event
 * stream. Types mirror @uni/contracts runs schemas (self-contained
 * frontend build; consolidated with the single-origin deployment).
 */

export type ServerRunStatus =
  | 'running'
  | 'cancelling'
  | 'complete'
  | 'stopped'
  | 'repetition_stopped'
  | 'error'

export interface ServerRun {
  id: string
  conversationId: string
  parentNodeId: string
  providerId: string | null
  providerKind: 'openai-compatible' | 'anthropic'
  providerEndpoint: string
  modelId: string
  status: ServerRunStatus
  outputText: string
  usage: { inputTokens?: number; outputTokens?: number } | null
  errorCode: string | null
  errorMessage: string | null
  createdAt: number
  updatedAt: number
  terminalAt: number | null
}

export interface ServerRunEvent {
  eventId: string
  runId: string
  sequence: number
  type: 'started' | 'delta' | 'usage' | 'terminal'
  timestamp: number
  payload: {
    text?: string
    usage?: { inputTokens?: number; outputTokens?: number }
    status?: ServerRunStatus
    errorCode?: string
    errorMessage?: string
  }
}

export interface CreateServerRunResponse {
  run: ServerRun
  events: ServerRunEvent[]
  reused: boolean
}

export async function createServerRun(
  conversationId: string,
  input: { parentNodeId: string; providerId: string; modelId?: string; idempotencyKey?: string },
): Promise<CreateServerRunResponse> {
  const { apiFetch } = await import('./client')
  return apiFetch<CreateServerRunResponse>(
    `${API_ROOT}/conversations/${encodeURIComponent(conversationId)}/runs`,
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export async function cancelServerRun(runId: string): Promise<{ run: ServerRun }> {
  const { apiFetch } = await import('./client')
  return apiFetch<{ run: ServerRun }>(`${API_ROOT}/runs/${encodeURIComponent(runId)}/cancel`, {
    method: 'POST',
  })
}

export interface RunStreamHandlers {
  onEvent: (event: ServerRunEvent) => void
}

/**
 * Subscribe to a run's event stream: replays persisted events after the
 * cursor, then tails live execution until the single terminal event
 * ends the stream. Resolves with every event received; rejects on
 * transport failure (the caller shows an honest error — the durable
 * events remain on the server for a later reconnect).
 */
export async function streamServerRunEvents(
  runId: string,
  after: number,
  handlers: RunStreamHandlers,
  signal?: AbortSignal,
): Promise<ServerRunEvent[]> {
  const response = await fetch(
    apiUrl(`${API_ROOT}/runs/${encodeURIComponent(runId)}/events?after=${after}`),
    { credentials: 'include', headers: { accept: 'text/event-stream' }, signal },
  )
  if (!response.ok) {
    throw new Error(`Run stream failed (${response.status}).`)
  }

  const events: ServerRunEvent[] = []
  const deliver = (frame: string): boolean => {
    for (const line of frame.split('\n')) {
      if (!line.startsWith('data: ')) continue
      try {
        const event = JSON.parse(line.slice(6)) as ServerRunEvent
        events.push(event)
        handlers.onEvent(event)
        if (event.type === 'terminal') return true
      } catch {
        /* keepalive or non-JSON frame */
      }
    }
    return false
  }

  const body = response.body
  if (body) {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let index: number
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, index)
          buffer = buffer.slice(index + 2)
          if (deliver(frame)) {
            await reader.cancel()
            return events
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
  } else {
    // Environments without a streaming body: read to completion.
    const text = await response.text()
    for (const frame of text.split('\n\n')) {
      if (deliver(frame)) break
    }
  }
  return events
}
