import type { FastifyInstance } from 'fastify'
import {
  agentEventSchema,
  agentEventsQuerySchema,
  agentSessionDtoSchema,
  createAgentSessionRequestSchema,
  patchAgentSessionRequestSchema,
  respondAgentPermissionRequestSchema,
  sendAgentMessageRequestSchema,
  agentRunDtoSchema,
  agentToolDescriptorDtoSchema,
  AGENT_TOOL_DESCRIPTORS,
} from '@uni/contracts'
import {
  listSessions,
  createSession,
  patchSession,
  deleteSession,
  findSessionRow,
  serializeSession,
} from './agentSession.service.js'
import { listEventsAfter } from './agentEvents.service.js'
import {
  createAgentRun,
  respondToPermission,
  cancelAgentRun,
} from './agentRun.service.js'
import { and, eq } from 'drizzle-orm'
import { agentRuns } from '../../db/schema.js'
import { notFound, conflict } from '../../lib/errors.js'
import type { AgentDatabase } from './agentSession.service.js'

/**
 * Agent routes — all under the session-scoped /api/v1 scope, additive:
 * no existing route changes. The SSE route follows the runs module's
 * pattern exactly (hijack, replay-after-cursor, poll backstop, keepalive,
 * terminal close with an end sentinel).
 */
export async function agentRoutes(app: FastifyInstance): Promise<void> {
  const db = app.database!.db as AgentDatabase

  app.get('/agent/tools', async () => {
    const descriptors = AGENT_TOOL_DESCRIPTORS.map((descriptor) =>
      agentToolDescriptorDtoSchema.parse(descriptor),
    )
    return { tools: descriptors }
  })

  app.get('/agent/sessions', async (request) => {
    const includeArchived =
      (request.query as { archived?: string } | undefined)?.archived === 'true'
    const items = await listSessions(db, request.workspace!.id, includeArchived)
    return { items }
  })

  app.post('/agent/sessions', async (request, reply) => {
    const body = createAgentSessionRequestSchema.parse(request.body)
    const session = await createSession(db, request.workspace!.id, body)
    void agentSessionDtoSchema.parse(session)
    return reply.code(201).send(session)
  })

  app.get('/agent/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const row = await findSessionRow(db, request.workspace!.id, sessionId)
    if (!row) throw notFound('Agent session not found.')
    return serializeSession(row)
  })

  app.patch('/agent/sessions/:sessionId', async (request) => {
    const { sessionId } = request.params as { sessionId: string }
    const body = patchAgentSessionRequestSchema.parse(request.body)
    return patchSession(db, request.workspace!.id, sessionId, body)
  })

  app.delete('/agent/sessions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const deleted = await deleteSession(db, request.workspace!.id, sessionId)
    if (!deleted) throw notFound('Agent session not found.')
    return reply.code(204).send()
  })

  app.post('/agent/sessions/:sessionId/runs', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const body = sendAgentMessageRequestSchema.parse(request.body)
    const { runId, reused } = await createAgentRun(
      { db, env: app.env },
      {
        workspaceId: request.workspace!.id,
        sessionId,
        text: body.text,
        idempotencyKey: body.idempotencyKey,
      },
    )
    return reply.code(reused ? 200 : 201).send({ runId, reused })
  })

  app.get('/agent/runs/:runId', async (request, reply) => {
    const { runId } = request.params as { runId: string }
    const rows = await db
      .select()
      .from(agentRuns)
      .where(and(eq(agentRuns.id, runId), eq(agentRuns.workspaceId, request.workspace!.id)))
      .limit(1)
    const row = rows[0]
    if (!row) throw notFound('Agent run not found.')
    const dto = agentRunDtoSchema.parse({
      id: row.id,
      sessionId: row.sessionId,
      status: row.status,
      inputText: row.inputText,
      outputText: row.outputText,
      providerId: row.providerId,
      modelId: row.modelId,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      inputTokens: row.inputTokens ?? null,
      outputTokens: row.outputTokens ?? null,
      createdAt: row.createdAt.getTime(),
      finishedAt: row.terminalAt ? row.terminalAt.getTime() : null,
    })
    return dto
  })

  app.post('/agent/runs/:runId/cancel', async (request) => {
    const { runId } = request.params as { runId: string }
    const outcome = await cancelAgentRun({ db, env: app.env }, request.workspace!.id, runId)
    if (outcome === 'not_found') throw notFound('Agent run not found.')
    if (outcome === 'already_terminal') throw conflict('Agent run already finished.')
    return { status: 'cancelling' }
  })

  app.post('/agent/runs/:runId/permissions/:requestId', async (request, reply) => {
    const { runId, requestId } = request.params as { runId: string; requestId: string }
    const body = respondAgentPermissionRequestSchema.parse(request.body)
    const rows = await db
      .select({ sessionId: agentRuns.sessionId })
      .from(agentRuns)
      .where(and(eq(agentRuns.id, runId), eq(agentRuns.workspaceId, request.workspace!.id)))
      .limit(1)
    if (!rows[0]) throw notFound('Agent run not found.')
    const answered = await respondToPermission(
      { db, env: app.env },
      request.workspace!.id,
      rows[0].sessionId,
      runId,
      requestId,
      body.decision,
    )
    if (!answered) throw notFound('Permission request not found or already answered.')
    return reply.code(202).send({ accepted: true })
  })

  /**
   * Server-sent events for a session (F05 semantics):
   * - `after` is the last sequence seen; -1 delivers sequence 0 (the
   *   first event) to new subscribers. The default 0 keeps old clients'
   *   skip-the-first behavior only when they omit the cursor entirely.
   * - With `runId`, the stream ends at THAT run's terminal only; a
   *   terminal belonging to a different (older) run in the same session
   *   no longer closes the stream mid-work.
   * - Without `runId` the stream is session-scoped and stays open until
   *   the client disconnects — the durable history is the authority for
   *   later reconnects.
   * - Drains are serialized (one poll at a time), writes honor
   *   backpressure via writable-length checks, and everything stops on
   *   response close.
   */
  app.get('/agent/sessions/:sessionId/events', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const query = agentEventsQuerySchema.parse(request.query)
    const row = await findSessionRow(db, request.workspace!.id, sessionId)
    if (!row) throw notFound('Agent session not found.')

    const workspaceId = request.workspace!.id
    reply.header('content-type', 'text/event-stream; charset=utf-8')
    reply.header('cache-control', 'no-cache, no-transform')
    reply.header('x-accel-buffering', 'no')
    reply.hijack()
    const raw = reply.raw
    raw.writeHead(200, reply.getHeaders() as Record<string, string | number>)
    raw.write('\n')

    let closed = false
    request.raw.on('close', () => {
      closed = true
    })

    let cursor = query.after
    /** One serialized drain at a time (F05: no interleaved async polls). */
    let draining = false
    /** The run whose terminal ends this stream (undefined = session-scoped). */
    const endRunId = query.runId ?? null
    let ended = false

    const endStream = (): void => {
      if (ended || raw.writableEnded) return
      ended = true
      raw.write('event: end\ndata: {}\n\n')
      cleanup()
      raw.end()
    }

    const cleanup = (): void => {
      clearInterval(pollTimer)
      clearInterval(keepalive)
    }

    /** Write one event; honor backpressure and close. */
    const writeEvent = (payload: string): void => {
      if (closed || raw.writableEnded || raw.writableLength > 1_000_000) return
      raw.write(`data: ${payload}\n\n`)
    }

    const drain = async (): Promise<void> => {
      if (draining || ended || closed || raw.writableEnded) return
      draining = true
      try {
        // Bounded page: a slow client catches up in chunks, and the
        // drain loop re-enters only after this page completes.
        const events = await listEventsAfter(db, workspaceId, sessionId, cursor, 100)
        for (const event of events) {
          cursor = event.sequence
          writeEvent(JSON.stringify(agentEventSchema.parse(event)))
          // A terminal closes the stream only for ITS run (or a
          // session-scoped stream without runId stays open).
          if (
            endRunId !== null &&
            event.runId === endRunId &&
            (event.type === 'run_finished' || event.type === 'error')
          ) {
            endStream()
            return
          }
        }
      } catch {
        /* transient db error: the next tick retries */
      } finally {
        draining = false
      }
    }

    const keepalive = setInterval(() => {
      if (closed || raw.writableEnded) return
      raw.write(': keepalive\n\n')
    }, 15_000)

    const pollTimer = setInterval(() => {
      if (closed || ended || raw.writableEnded) {
        cleanup()
        return
      }
      void drain()
    }, 200)

    // First drain immediately: a reconnecting client sees history without
    // waiting a tick.
    await drain()
    if (!ended && !closed && !raw.writableEnded && raw.writableLength === 0) {
      // fall through to the interval-driven tail
    }
    return reply
  })
}
