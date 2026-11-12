import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { routineRuns } from '../../db/schema.js'

/**
 * T032 — sync agent-run terminals into the routine_run rows.
 *
 * Called from the agent engine's terminal resolution (the same
 * best-effort hook Work uses): complete → complete with the output
 * text; stopped → stopped with partial output; error → error with the
 * user-safe message. Idempotent — an already-terminal routine_run is
 * never flipped, so a late replay cannot rewrite history.
 */

export type RoutinesSyncDatabase = NodePgDatabase<typeof schema>

export async function syncRoutineRunOutcome(
  db: RoutinesSyncDatabase,
  workspaceId: string,
  agentRunId: string,
  terminalStatus: string,
  outputText: string,
): Promise<boolean> {
  const rows = await db
    .select()
    .from(routineRuns)
    .where(and(eq(routineRuns.workspaceId, workspaceId), eq(routineRuns.agentRunId, agentRunId)))
    .limit(1)
  const run = rows[0]
  if (!run) return false // not routine-bound
  if (run.status !== 'running' && run.status !== 'pending') return false // idempotent

  const status =
    terminalStatus === 'complete' ? 'complete' : terminalStatus === 'stopped' ? 'stopped' : 'error'
  await db
    .update(routineRuns)
    .set({
      status,
      outputText: outputText.slice(0, 200_000),
      errorCode: status === 'error' ? 'agent_run_error' : null,
      errorMessage:
        status === 'error'
          ? (outputText || 'The scheduled run failed.').slice(0, 2_000)
          : null,
      terminalAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(routineRuns.id, run.id))
  return true
}
