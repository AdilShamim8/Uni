import type { FastifyInstance } from 'fastify'
import {
  agentEventSchema,
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
import { listEventsAfter, latestSequence } from './agentEvents.service.js'
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

  app.get('/agent/sessions/:sessionId/events', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string }
    const query = request.query as { after?: string }
    const after = Number.parseInt(query.after ?? '0', 10) || 0
    const row = await findSessionRow(db, request.workspace!.id, sessionId)
    if (!row) throw notFound('Agent session not found.')

    const workspaceId = request.workspace!.id
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    })
    reply.raw.write('\n')

    let cursor = after
    let lastPollText = ''
    const poll = async (): Promise<boolean> => {
      const events = await listEventsAfter(db, workspaceId, sessionId, cursor, 100)
      for (const event of events) {
        cursor = event.sequence
        void agentEventSchema.parse(event)
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`)
        if (event.type === 'run_finished' || event.type === 'error') {
          reply.raw.write('event: end\ndata: {}\n\n')
          return true
        }
      }
      return false
    }

    if (await poll()) {
      reply.raw.end()
      return reply
    }

    const keepalive = setInterval(() => {
      try {
        reply.raw.write(': keepalive\n\n')
      } catch {
        /* closed */
      }
    }, 15_000)

    const timer = setInterval(() => {
      void (async () => {
        try {
          const latest = await latestSequence(db, sessionId)
          if (latest > cursor) {
            if (await poll()) {
              clearInterval(timer)
              clearInterval(keepalive)
              reply.raw.end()
            }
          } else if (lastPollText !== '') {
            lastPollText = ''
          }
        } catch {
          /* transient */
        }
      })()
    }, 200)

    request.raw.on('close', () => {
      clearInterval(timer)
      clearInterval(keepalive)
    })
    return reply
  })
}
