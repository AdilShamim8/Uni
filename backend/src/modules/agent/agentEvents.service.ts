import { randomUUID } from 'node:crypto'
import { and, asc, eq, gt, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { agentEvents } from '../../db/schema.js'
import type { AgentEvent, AgentEventPayload, AgentEventType } from '@uni/contracts'

export type AgentEventsDatabase = NodePgDatabase<typeof schema>

type EventRow = typeof agentEvents.$inferSelect

export function serializeEvent(row: EventRow): AgentEvent {
  return {
    eventId: row.id,
    sessionId: row.sessionId,
    runId: row.runId,
    sequence: row.sequence,
    type: row.type as AgentEventType,
    timestamp: row.createdAt instanceof Date ? row.createdAt.getTime() : new Date(row.createdAt).getTime(),
    payload: row.payload as AgentEventPayload,
  }
}

/**
 * Append one event, persist-then-publish: the per-session sequence is
 * assigned under the same advisory lock the runs module uses for run
 * events (hashtextextended of the session id), so concurrent writers
 * cannot interleave or duplicate a sequence. The row commits before any
 * subscriber is notified — a subscriber that reconnects with `after` sees
 * everything, never a gap.
 */
export async function appendAgentEvent(
  db: AgentEventsDatabase,
  input: {
    workspaceId: string
    sessionId: string
    runId: string | null
    type: AgentEventType
    payload: AgentEventPayload
  },
): Promise<AgentEvent> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.sessionId}, 0))`,
    )

    const maxRow = await tx
      .select({ max: sql<number | null>`max(${agentEvents.sequence})` })
      .from(agentEvents)
      .where(eq(agentEvents.sessionId, input.sessionId))
    const next = (maxRow[0]?.max ?? -1) + 1

    const inserted = await tx
      .insert(agentEvents)
      .values({
        id: randomUUID(),
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        runId: input.runId,
        sequence: next,
        type: input.type,
        payload: input.payload,
      })
      .returning()
    const row = inserted[0]
    if (!row) throw new Error('Agent event insert returned no row')
    return serializeEvent(row)
  })
}

/** Events with sequence strictly greater than `after`, oldest first. */
export async function listEventsAfter(
  db: AgentEventsDatabase,
  workspaceId: string,
  sessionId: string,
  after: number,
  limit = 500,
): Promise<AgentEvent[]> {
  const rows = await db
    .select()
    .from(agentEvents)
    .where(
      and(
        eq(agentEvents.workspaceId, workspaceId),
        eq(agentEvents.sessionId, sessionId),
        gt(agentEvents.sequence, after),
      ),
    )
    .orderBy(asc(agentEvents.sequence))
    .limit(limit)
  return rows.map(serializeEvent)
}

/** The latest sequence a session has reached (for SSE resume hints). */
export async function latestSequence(
  db: AgentEventsDatabase,
  sessionId: string,
): Promise<number> {
  const rows = await db
    .select({ max: sql<number | null>`max(${agentEvents.sequence})` })
    .from(agentEvents)
    .where(eq(agentEvents.sessionId, sessionId))
  return rows[0]?.max ?? -1
}
