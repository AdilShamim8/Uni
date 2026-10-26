import type { FastifyInstance } from 'fastify'
import {
  cancelRunResponseSchema,
  createRunRequestSchema,
  createRunResponseSchema,
  runDtoSchema,
  runEventsQuerySchema,
  type CancelRunResponse,
  type CreateRunResponse,
  type RunDto,
  type RunEvent,
} from '@uni/contracts'
import { notFound } from '../../lib/errors.js'
import { cancelRun, createRun, getRun, getRunEvents } from './runs.service.js'
import { subscribeToRun } from './runRegistry.js'

/**
 * Run lifecycle routes. Creation is idempotent and separate from event
 * subscription and cancellation (three typed operations): create starts
 * server-side execution and returns immediately; events replay
 * persisted history then tail live execution; cancel is durable.
 */
export async function runsRoutes(app: FastifyInstance): Promise<void> {
  const db = app.database!.db
  const logger = app.log

  app.post<{ Params: { id: string }; Body: unknown; Reply: CreateRunResponse }>(
    '/conversations/:id/runs',
    async (request, reply) => {
      const body = createRunRequestSchema.parse(request.body)
      const created = await createRun(db, app.env, logger, request.workspace!.id, request.params.id, body)
      if (!created) {
        throw notFound('Conversation, message, or provider not found in this workspace.')
      }
      void createRunResponseSchema.parse(created) // response honors the contract
      return reply.status(created.reused ? 200 : 201).send(created)
    },
  )

  app.get<{ Params: { runId: string }; Reply: RunDto }>('/runs/:runId', async (request) => {
    const run = await getRun(db, request.workspace!.id, request.params.runId)
    if (!run) throw notFound('Run not found.')
    void runDtoSchema.parse(run)
    return run
  })

  app.post<{ Params: { runId: string }; Reply: CancelRunResponse }>(
    '/runs/:runId/cancel',
    async (request) => {
      const run = await cancelRun(db, request.workspace!.id, request.params.runId)
      if (!run) throw notFound('Run not found.')
      void cancelRunResponseSchema.parse({ run })
      return { run }
    },
  )

  /**
   * Server-sent events for a run: replay persisted events after the
   * cursor, then tail live execution until its one terminal event.
   *
   * Delivery order guarantee: the live subscription attaches BEFORE the
   * database replay, events dedupe by monotonic sequence, and a light
   * database poll backstops the bus so a terminal event can never be
   * missed (persisted-then-published, and the poll re-reads whatever
   * the bus already delivered). The stream ends at the terminal event;
   * the durable history stays authoritative for later reconnects.
   */
  app.get<{ Params: { runId: string } }>('/runs/:runId/events', async (request, reply) => {
    const query = runEventsQuerySchema.parse(request.query)
    const result = await getRunEvents(db, request.workspace!.id, request.params.runId, query.after)
    if (!result) throw notFound('Run not found.')

    // Fastify stops managing the response after hijack; apply the stored
    // headers to the raw response ourselves.
    reply.header('content-type', 'text/event-stream; charset=utf-8')
    reply.header('cache-control', 'no-cache, no-transform')
    reply.header('x-accel-buffering', 'no')
    reply.hijack()
    const raw = reply.raw
    raw.writeHead(200, reply.getHeaders() as Record<string, string | number>)

    let closed = false
    request.raw.on('close', () => {
      closed = true
    })

    let lastSequence = query.after
    let terminalSeen = false
    let ended = false

    const writeEvent = (payload: string): void => {
      if (closed || raw.writableEnded) return
      raw.write(`data: ${payload}\n\n`)
    }

    const endStream = (): void => {
      if (ended || raw.writableEnded) return
      ended = true
      cleanup()
      raw.end()
    }

    /** Write one event honoring sequence dedupe; terminal closes. */
    const handleEvent = (event: RunEvent): void => {
      if (event.sequence <= lastSequence) return
      lastSequence = event.sequence
      writeEvent(JSON.stringify(event))
      if (event.type === 'terminal') {
        terminalSeen = true
        endStream()
      }
    }

    /** Re-read persisted events after the cursor (bus backstop). */
    let polling = false
    const refreshTail = async (): Promise<void> => {
      if (polling || terminalSeen || closed || raw.writableEnded) return
      polling = true
      try {
        const tail = await getRunEvents(
          db,
          request.workspace!.id,
          request.params.runId,
          lastSequence,
        )
        if (!tail) {
          endStream()
          return
        }
        for (const event of tail.events) handleEvent(event)
        if (!terminalSeen && terminalReached(tail.run.status)) {
          // Terminal state whose event predates the cursor: nothing more
          // can arrive — close honestly without inventing an event.
          raw.write('event: end\ndata: {}\n\n')
          endStream()
        }
      } catch {
        /* transient read errors retry on the next poll */
      } finally {
        polling = false
      }
    }

    // Live subscription first (misses nothing published afterwards),
    // then replay, then poll as backstop.
    const unsubscribe = subscribeToRun(request.params.runId, (event) => {
      if ('terminal' in event && (event as { terminal?: boolean }).terminal === true) {
        // Sentinel: the runner finished — re-read the tail now so the
        // stream closes without waiting for the next poll tick.
        void refreshTail()
        return
      }
      handleEvent(event as RunEvent)
    })

    const keepalive = setInterval(() => {
      if (closed || raw.writableEnded) return
      raw.write(': keepalive\n\n')
    }, 15_000)
    if (typeof keepalive.unref === 'function') keepalive.unref()

    const poll = setInterval(() => {
      void refreshTail()
      if (terminalSeen || closed || raw.writableEnded) {
        clearInterval(poll)
        endStream()
      }
    }, 200)
    if (typeof poll.unref === 'function') poll.unref()

    function cleanup(): void {
      clearInterval(keepalive)
      clearInterval(poll)
      unsubscribe()
    }

    for (const event of result.events) handleEvent(event)

    if (terminalSeen) {
      endStream()
      return
    }
    if (terminalReached(result.run.status)) {
      raw.write('event: end\ndata: {}\n\n')
      endStream()
      return
    }
    // The poll interval keeps the handler alive until the terminal
    // event, client disconnect, or run finalization ends the stream.
  })
}

function terminalReached(status: string): boolean {
  return (
    status === 'complete' || status === 'stopped' || status === 'error' || status === 'repetition_stopped'
  )
}
