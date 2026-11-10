import { randomUUID } from 'node:crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { ModelMessage } from 'ai'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { agentTurns } from '../../db/schema.js'

/**
 * The session transcript (T008): persisted ModelMessage turns a run can
 * reload so the model answers from what previous turns (and their tool
 * results) actually said. Sequences are per-session and assigned under
 * the same advisory-lock discipline as agent_event, so concurrent runs
 * cannot interleave.
 */

export type AgentTurnsDatabase = NodePgDatabase<typeof schema>

/** The bounded number of prior turns reloaded as context. */
export const TURN_CONTEXT_LIMIT = 40

export async function appendAgentTurn(
  db: AgentTurnsDatabase,
  input: {
    workspaceId: string
    sessionId: string
    runId: string | null
    message: ModelMessage
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${input.sessionId}, 0))`,
    )
    const maxRow = await tx
      .select({ max: sql<number | null>`max(${agentTurns.sequence})` })
      .from(agentTurns)
      .where(eq(agentTurns.sessionId, input.sessionId))
    const next = (maxRow[0]?.max ?? -1) + 1
    await tx.insert(agentTurns).values({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      runId: input.runId,
      sequence: next,
      message: input.message,
    })
  })
}

/** Prior transcript messages, oldest first, newest-bound. */
export async function loadAgentTurns(
  db: AgentTurnsDatabase,
  workspaceId: string,
  sessionId: string,
  limit = TURN_CONTEXT_LIMIT,
): Promise<ModelMessage[]> {
  const rows = await db
    .select()
    .from(agentTurns)
    .where(and(eq(agentTurns.workspaceId, workspaceId), eq(agentTurns.sessionId, sessionId)))
    .orderBy(asc(agentTurns.sequence))
  if (rows.length <= limit) return rows.map((row) => row.message as ModelMessage)
  // Keep the OLDEST-turns head out: the newest `limit` messages carry
  // the live context; the user turn this run appends follows them.
  return rows.slice(rows.length - limit).map((row) => row.message as ModelMessage)
}
