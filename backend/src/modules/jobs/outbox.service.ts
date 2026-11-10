import type { FastifyInstance } from 'fastify'
import PgBoss from 'pg-boss'
import { randomUUID } from 'node:crypto'
import { and, eq, lt, sql } from 'drizzle-orm'
import * as schema from '../../db/schema.js'
import { jobOutbox } from '../../db/schema.js'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Logger } from 'pino'
import { isUniqueViolation } from '../../lib/pgErrors.js'

/**
 * The jobs module (T013): durable work on pg-boss, with the
 * application-row-to-queue gap closed by an outbox.
 *
 * Why the outbox: pg-boss enqueues in ITS OWN schema, so a run row
 * committed in one transaction and a queue send in another can diverge
 * (crash between them = a durable run nobody executes). The pattern is
 * the standard one: the API transaction also inserts an outbox row;
 * a dispatcher moves outbox rows into pg-boss and marks them sent;
 * a reconciler re-sends anything that stalls. Exactly-once EXECUTION
 * of external side effects is not claimed — pg-boss guarantees at
 * least once delivery; idempotent handlers make double delivery safe.
 */

export type JobsDatabase = NodePgDatabase<typeof schema>

/** The single queue agent-run execution flows through. */
export const AGENT_RUN_QUEUE = 'agent-run-execute'

/** How often the outbox dispatcher runs (ms). */
export const OUTBOX_DISPATCH_INTERVAL_MS = 500

/** An outbox row older than this with no send is re-dispatched (ms). */
export const OUTBOX_STALE_MS = 10_000

export interface JobPayload {
  kind: 'agent-run-execute'
  runId: string
  workspaceId: string
  sessionId: string
}

interface OutboxRow {
  id: string
  kind: string
  runId: string | null
  workspaceId: string
  sessionId: string | null
  payload: JobPayload
  sentAt: Date | null
  createdAt: Date
}

/**
 * Transactional enqueue: call INSIDE the same transaction that commits
 * the application row (the run). The outbox row commits or rolls back
 * with it — the gap is closed at the source.
 */
export async function enqueueInTransaction(
  tx: JobsDatabase,
  payload: JobPayload,
): Promise<void> {
  await tx.insert(jobOutbox).values({
    id: randomUUID(),
    kind: payload.kind,
    runId: payload.runId,
    workspaceId: payload.workspaceId,
    sessionId: payload.sessionId,
    payload,
  })
}

/**
 * The dispatcher: move unsent outbox rows into pg-boss, marking sent
 * only after the send succeeds. A send that crashes midway leaves the
 * row unsent and the next tick retries — pg-boss's own send is
 * idempotent per (queue, singletonKey) where we use the run id.
 */
export async function dispatchOutbox(
  db: JobsDatabase,
  boss: PgBoss,
  logger: Logger,
): Promise<number> {
  const rows = await db
    .select()
    .from(jobOutbox)
    .where(sql`${jobOutbox.sentAt} is null`)
    .limit(100)
  let sent = 0
  for (const row of rows as OutboxRow[]) {
    try {
      await boss.send({
        name: AGENT_RUN_QUEUE,
        data: row.payload,
        options: {
          // One queue entry per run: a reconciler re-send replaces
          // nothing and never duplicates execution of the same attempt.
          singletonKey: row.runId ?? row.id,
          // The worker claims within this window or the entry expires
          // and the reconciler can re-enqueue.
          expireInSeconds: 600,
        },
      })
      await db
        .update(jobOutbox)
        .set({ sentAt: new Date() })
        .where(eq(jobOutbox.id, row.id))
      sent += 1
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Already queued under this singleton key: mark sent, the
        // queue entry exists.
        await db
          .update(jobOutbox)
          .set({ sentAt: new Date() })
          .where(eq(jobOutbox.id, row.id))
        continue
      }
      logger.warn({ outboxId: row.id, err: errorMessage(error) }, 'outbox dispatch failed; will retry')
    }
  }
  return sent
}

/** Drop sent outbox rows older than a day (bounded growth). */
export async function pruneOutbox(db: JobsDatabase): Promise<void> {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
  await db.delete(jobOutbox).where(and(sql`${jobOutbox.sentAt} is not null`, lt(jobOutbox.createdAt, cutoff)))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
