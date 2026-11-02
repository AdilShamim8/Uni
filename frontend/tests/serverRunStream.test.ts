import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  RunStreamInterruptedError,
  streamServerRunEvents,
  type ServerRunEvent,
  type ServerRunStatus,
} from '@/services/api/serverRuns'

/**
 * Server-run SSE client hardening (audit F06 / U008). All cases run
 * against mocked transports — no network, no backend, deterministic.
 *
 * The audited failures this suite pins:
 * - CRLF framing produced zero events (the client only searched "\n\n")
 * - a trailing frame without a final blank line was dropped
 * - a stream that closed WITHOUT the run's terminal event resolved as
 *   success, silently discarding a still-live run
 *
 * The client now shares the standards-aware parser, dedupes by
 * sequence, and on a premature close reconnects to the SAME run by
 * cursor (never another generation), with the durable run as the
 * authority.
 */

const RUN_ID = 'run-1'

function eventFrame(sequence: number, type: ServerRunEvent['type'], payload: ServerRunEvent['payload']): string {
  return (
    'data: ' +
    JSON.stringify({
      eventId: `${RUN_ID}:${sequence}`,
      runId: RUN_ID,
      sequence,
      type,
      timestamp: sequence,
      payload,
    }) +
    '\n\n'
  )
}

function sseResponse(frames: string[]): Response {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame))
      controller.close()
    },
  })
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
}

function runStatusResponse(status: ServerRunStatus): Response {
  return new Response(JSON.stringify({ id: RUN_ID, status }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

interface TransportScript {
  /** Frames for each /events connection, in order (last list repeats if exhausted). */
  connections: string[][]
  /** Status for each GET /runs/:id, in order (repeats last). */
  runStatuses: ServerRunStatus[]
  /** When true, /events connections throw instead of answering. */
  dropConnections?: boolean
}

function mockTransport(script: TransportScript): { urls: string[] } {
  const urls: string[] = []
  let connectionIndex = 0
  let statusIndex = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = typeof input === 'string' ? input : String(input)
      urls.push(url)
      if (url.includes('/events')) {
        if (script.dropConnections && connectionIndex > 0) {
          throw new TypeError('Failed to fetch')
        }
        const frames = script.connections[connectionIndex] ?? []
        connectionIndex += 1
        return sseResponse(frames)
      }
      if (new RegExp(`/runs/${RUN_ID}$`).test(url)) {
        const status =
          script.runStatuses[Math.min(statusIndex, script.runStatuses.length - 1)] ?? 'running'
        statusIndex += 1
        return runStatusResponse(status)
      }
      return new Response('not found', { status: 404 })
    }),
  )
  return { urls }
}

function collect(): { events: ServerRunEvent[]; handlers: { onEvent: (event: ServerRunEvent) => void } } {
  const events: ServerRunEvent[] = []
  return { events, handlers: { onEvent: (event) => events.push(event) } }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('server run stream — standards-aware parsing', () => {
  it('parses CRLF-framed events (previously zero events)', async () => {
    mockTransport({
      connections: [
        [
          `data: ${JSON.stringify({ eventId: 'run-1:1', runId: RUN_ID, sequence: 1, type: 'delta', timestamp: 1, payload: { text: 'CRLF ok' } })}\r\n\r\n`,
          `data: ${JSON.stringify({ eventId: 'run-1:2', runId: RUN_ID, sequence: 2, type: 'terminal', timestamp: 2, payload: { status: 'complete' } })}\r\n\r\n`,
        ],
      ],
      runStatuses: ['complete'],
    })
    const { events, handlers } = collect()
    const result = await streamServerRunEvents(RUN_ID, 0, handlers)
    expect(events).toHaveLength(2)
    expect(events[0]?.payload.text).toBe('CRLF ok')
    expect(events.at(-1)?.type).toBe('terminal')
    expect(result).toHaveLength(2)
  })

  it('delivers a trailing frame without a final blank line (previously dropped)', async () => {
    const terminal = JSON.stringify({
      eventId: 'run-1:2',
      runId: RUN_ID,
      sequence: 2,
      type: 'terminal',
      timestamp: 2,
      payload: { status: 'complete' },
    })
    mockTransport({
      connections: [
        [
          eventFrame(1, 'delta', { text: 'first' }),
          `data: ${terminal}`, // no trailing \n\n before EOF
        ],
      ],
      runStatuses: ['complete'],
    })
    const { events, handlers } = collect()
    await streamServerRunEvents(RUN_ID, 0, handlers)
    expect(events).toHaveLength(2)
    expect(events.at(-1)?.type).toBe('terminal')
  })

  it('reassembles a multi-byte character split across chunks and joins multiline data', async () => {
    const delta = JSON.stringify({
      eventId: 'run-1:1',
      runId: RUN_ID,
      sequence: 1,
      type: 'delta',
      timestamp: 1,
      payload: { text: 'héllo' },
    })
    const terminal = JSON.stringify({
      eventId: 'run-1:2',
      runId: RUN_ID,
      sequence: 2,
      type: 'terminal',
      timestamp: 2,
      payload: { status: 'complete' },
    })
    // Split the delta frame at the second byte of 'é' (0xC3 0xA9) and
    // spread the terminal across two data lines.
    const encoder = new TextEncoder()
    const deltaBytes = encoder.encode(`data: ${delta}\n\n`)
    const splitAt = deltaBytes.indexOf(0xa9)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(deltaBytes.slice(0, splitAt))
        controller.enqueue(deltaBytes.slice(splitAt))
        controller.enqueue(encoder.encode(`data: ${terminal.slice(0, 10)}\ndata: ${terminal.slice(10)}\n\n`))
        controller.close()
      },
    })
    const urls: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown) => {
        const url = typeof input === 'string' ? input : String(input)
        urls.push(url)
        return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } })
      }),
    )
    const { events, handlers } = collect()
    await streamServerRunEvents(RUN_ID, 0, handlers)
    expect(events).toHaveLength(2)
    expect(events[0]?.payload.text).toBe('héllo')
    expect(events.at(-1)?.type).toBe('terminal')
    void urls
  })

  it('skips malformed frames without breaking the stream', async () => {
    mockTransport({
      connections: [
        [
          'data: not-json(\n\n',
          ': keepalive\n\n',
          eventFrame(1, 'delta', { text: 'good' }),
          `data: ${JSON.stringify({ runId: RUN_ID, type: 'delta' })}\n\n`, // missing sequence
          eventFrame(2, 'terminal', { status: 'complete' }),
        ],
      ],
      runStatuses: ['complete'],
    })
    const { events, handlers } = collect()
    await streamServerRunEvents(RUN_ID, 0, handlers)
    expect(events).toHaveLength(2)
    expect(events[0]?.payload.text).toBe('good')
  })
})

describe('server run stream — premature close recovery (F06)', () => {
  it('reconnects to the same run by cursor and never resolves a dropped run as done', async () => {
    const { urls } = mockTransport({
      connections: [
        // First connection: one delta, then the transport closes with
        // NO terminal evidence.
        [eventFrame(1, 'delta', { text: 'part' })],
        // Reconnect must ask for events AFTER the cursor (after=1) and
        // receives the terminal.
        [eventFrame(2, 'terminal', { status: 'complete' })],
      ],
      runStatuses: ['running'],
    })
    const { events, handlers } = collect()
    const result = await streamServerRunEvents(RUN_ID, 0, handlers)

    expect(result).toHaveLength(2)
    expect(events.at(-1)?.type).toBe('terminal')
    const eventCalls = urls.filter((url) => url.includes('/events'))
    expect(eventCalls).toHaveLength(2)
    expect(eventCalls[1]).toContain('after=1')
    // Recovery is subscription-only: no run creation, no message send.
    expect(urls.every((url) => !url.includes('POST') && url.includes('/runs/'))).toBe(true)
  })

  it('deduplicates replayed events by sequence across reconnects', async () => {
    mockTransport({
      connections: [
        [eventFrame(1, 'delta', { text: 'a' }), eventFrame(2, 'delta', { text: 'b' })],
        // The replay repeats sequence 2 before the terminal.
        [eventFrame(2, 'delta', { text: 'b' }), eventFrame(3, 'terminal', { status: 'complete' })],
      ],
      runStatuses: ['running'],
    })
    const { events, handlers } = collect()
    const result = await streamServerRunEvents(RUN_ID, 0, handlers)
    expect(result.map((event) => event.sequence)).toEqual([1, 2, 3])
    expect(events.filter((event) => event.sequence === 2)).toHaveLength(1)
  })

  it('accepts the durable run as the authority when it finished while disconnected', async () => {
    const { urls } = mockTransport({
      connections: [[eventFrame(1, 'delta', { text: 'part' })]],
      runStatuses: ['complete'],
    })
    const { events, handlers } = collect()
    const result = await streamServerRunEvents(RUN_ID, 0, handlers)
    // The run row says the run completed: resolve without further
    // stream connections (the refreshed conversation carries the node).
    expect(result).toHaveLength(1)
    expect(urls.filter((url) => url.includes('/events'))).toHaveLength(1)
    expect(events).toHaveLength(1)
  })

  it('fails honestly when recovery is exhausted and the outcome stays unconfirmed', async () => {
    const { urls } = mockTransport({
      connections: [[eventFrame(1, 'delta', { text: 'part' })]],
      runStatuses: ['running'],
    })
    const { handlers } = collect()
    await expect(streamServerRunEvents(RUN_ID, 0, handlers)).rejects.toBeInstanceOf(
      RunStreamInterruptedError,
    )
    // Initial connection + the bounded reconnect attempts.
    expect(urls.filter((url) => url.includes('/events')).length).toBeGreaterThanOrEqual(2)
  })

  it('treats repeated transport failures as premature closes (bounded retries, honest error)', async () => {
    const { urls } = mockTransport({
      connections: [[]],
      runStatuses: ['running'],
      dropConnections: true,
    })
    const { handlers } = collect()
    await expect(streamServerRunEvents(RUN_ID, 0, handlers)).rejects.toThrow(
      /dropped before it finished/i,
    )
    expect(urls.filter((url) => url.includes('/events')).length).toBeGreaterThanOrEqual(2)
  })
})
