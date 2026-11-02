import { API_ROOT, apiUrl } from './client'
import { findEventBoundary, parseSseBlock } from '../sse/sseParser'

/**
 * Server-run API calls: create (idempotent), cancel, and the SSE event
 * stream. Types mirror @uni/contracts runs schemas (self-contained
 * frontend build; consolidated with the single-origin deployment).
 *
 * The stream client is standards-aware and recovery-oriented (audit
 * F06): LF/CRLF framing, multi-line data, split UTF-8, and trailing
 * frames without a final blank line all parse; events are validated at
 * runtime and deduplicated by sequence; and a transport that closes
 * WITHOUT the run's terminal event is never treated as success — the
 * client reconnects to the SAME run by cursor (never another
 * generation), checks the durable run as the authority, and fails
 * honestly if recovery is exhausted.
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
}

/** The stream ended and recovery could not confirm the run's outcome. */
export class RunStreamInterruptedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RunStreamInterruptedError'
  }
}

function isTerminalStatus(status: ServerRunStatus): boolean {
  return status !== 'running' && status !== 'cancelling'
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

export async function fetchServerRun(runId: string): Promise<ServerRun> {
  const { apiFetch } = await import('./client')
  return apiFetch<ServerRun>(`${API_ROOT}/runs/${encodeURIComponent(runId)}`)
}

export interface RunStreamHandlers {
  onEvent: (event: ServerRunEvent) => void
}

/** Reconnect policy for transport closes without a terminal event. */
const MAX_RECONNECT_ATTEMPTS = 3
const RECONNECT_BASE_DELAY_MS = 200

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(), ms)
    if (signal) {
      const onAbort = () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

/** Runtime validation: only well-formed run events are ever delivered. */
function parseRunEvent(data: string): ServerRunEvent | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(data)
  } catch {
    return null // keepalive or non-JSON frame
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const candidate = parsed as Partial<ServerRunEvent>
  if (
    typeof candidate.sequence !== 'number' ||
    !Number.isInteger(candidate.sequence) ||
    candidate.sequence <= 0 ||
    typeof candidate.type !== 'string' ||
    typeof candidate.runId !== 'string' ||
    typeof candidate.eventId !== 'string'
  ) {
    return null
  }
  if (candidate.type !== 'started' && candidate.type !== 'delta' && candidate.type !== 'usage' && candidate.type !== 'terminal') {
    return null
  }
  return parsed as ServerRunEvent
}

interface StreamRead {
  events: ServerRunEvent[]
  terminal: boolean
  lastSequence: number
}

/** One connection to the run's event stream: replay + tail. */
async function readRunStreamOnce(
  runId: string,
  after: number,
  handlers: RunStreamHandlers,
  signal?: AbortSignal,
): Promise<StreamRead> {
  const response = await fetch(
    apiUrl(`${API_ROOT}/runs/${encodeURIComponent(runId)}/events?after=${after}`),
    { credentials: 'include', headers: { accept: 'text/event-stream' }, signal },
  )
  if (!response.ok) {
    throw new Error(`Run stream failed (${response.status}).`)
  }

  const events: ServerRunEvent[] = []
  let terminal = false
  let lastSequence = after

  const deliver = (data: string, eventName?: string): void => {
    // The server's `end` sentinel means the run already reached a
    // terminal state whose event predates the cursor — nothing more
    // can arrive on this stream.
    if (eventName === 'end') return
    const event = parseRunEvent(data)
    if (!event) return
    // Deduplicate by monotonic sequence (replays overlap the cursor).
    if (event.sequence <= lastSequence) return
    lastSequence = event.sequence
    events.push(event)
    handlers.onEvent(event)
    if (event.type === 'terminal') terminal = true
  }

  let buffer = ''
  const consumeBuffer = (): void => {
    for (;;) {
      const boundary = findEventBoundary(buffer)
      if (!boundary) break
      const block = buffer.slice(0, boundary.end)
      buffer = buffer.slice(boundary.end)
      const parsed = parseSseBlock(block)
      if (parsed && parsed.data.length > 0) deliver(parsed.data, parsed.event)
    }
  }

  const body = response.body
  if (body) {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        consumeBuffer()
      }
      // Flush the decoder so a multi-byte character split across the
      // final chunks is never lost.
      buffer += decoder.decode()
    } finally {
      reader.releaseLock()
    }
  } else {
    // Environments without a streaming body: read to completion.
    buffer += await response.text()
    consumeBuffer()
  }
  // A trailing frame without a final blank line is still an event.
  const trailing = parseSseBlock(buffer)
  if (trailing && trailing.data.length > 0) deliver(trailing.data, trailing.event)

  return { events, terminal, lastSequence }
}

/**
 * Subscribe to a run's event stream: replays persisted events after the
 * cursor, then tails live execution until the single terminal event
 * ends the stream. If the transport closes WITHOUT that terminal
 * evidence, the durable run is the authority: reconnect to the same run
 * by cursor (bounded, with backoff) and confirm its status — never
 * start another provider generation. Resolves with every event
 * received; rejects with RunStreamInterruptedError when recovery is
 * exhausted and the outcome stays unconfirmed.
 */
export async function streamServerRunEvents(
  runId: string,
  after: number,
  handlers: RunStreamHandlers,
  signal?: AbortSignal,
): Promise<ServerRunEvent[]> {
  const all: ServerRunEvent[] = []
  let cursor = after

  for (let attempt = 0; ; attempt += 1) {
    let read: StreamRead | null = null
    try {
      read = await readRunStreamOnce(runId, cursor, handlers, signal)
    } catch (error) {
      if (isAbort(error)) throw error
      // Transport failure: same recovery path as a premature close.
    }
    if (read) {
      all.push(...read.events)
      cursor = read.lastSequence
      if (read.terminal) return all
    }

    // No terminal evidence. Check the durable run before reconnecting:
    // it may have finished while the transport was down (its outcome
    // arrives with the refreshed conversation), or the terminal event
    // may predate the cursor (the server's `end` sentinel case).
    try {
      const run = await fetchServerRun(runId)
      if (isTerminalStatus(run.status)) return all
    } catch (error) {
      if (isAbort(error)) throw error
      // Status unknown — reconnect and let the stream speak.
    }

    if (attempt >= MAX_RECONNECT_ATTEMPTS) {
      throw new RunStreamInterruptedError(
        'The connection to this run dropped before it finished. It may still be running — reopen the conversation to reconnect to the same run.',
      )
    }
    await sleep(RECONNECT_BASE_DELAY_MS * (attempt + 1), signal)
  }
}
