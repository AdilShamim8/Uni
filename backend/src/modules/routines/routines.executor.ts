import { and, eq } from 'drizzle-orm'
import { routineRuns } from '../../db/schema.js'
import {
  createAgentRun,
  type RunEngineDeps,
} from '../agent/agentRun.service.js'
import type { RoutinesDatabase } from './routines.service.js'
import type { RoutineFire } from './routines.scheduler.js'

/**
 * T032 — execute a claimed routine fire as an agent run in the
 * routine's session (unattended by construction: the session's own
 * mode and roster govern; the prompt is the routine's prompt).
 *
 * The fire row holds the slot until the agent run's terminal resolves
 * (the engine's terminal hook syncs it through routinesSync). Failure
 * to admit the run — an archived session, admission caps, an engine
 * error — resolves the fire to an honest terminal immediately; it is
 * never left pending forever.
 */
export async function executeRoutineFire(deps: RunEngineDeps, fire: RoutineFire): Promise<void> {
  const { db } = deps
  try {
    const { runId: agentRunId } = await createAgentRun(deps, {
      workspaceId: fire.workspaceId,
      sessionId: fire.sessionId,
      text: fire.prompt,
      // One agent run per (routine, scheduled minute): a scheduler
      // retry or worker restart replays the same run instead of
      // firing a second provider call.
      idempotencyKey: `routine-${fire.routineId}-${fire.scheduledFor.getTime()}`,
    })

    await db
      .update(routineRuns)
      .set({ agentRunId, status: 'running', updatedAt: new Date() })
      .where(and(eq(routineRuns.id, fire.runId), eq(routineRuns.workspaceId, fire.workspaceId)))
  } catch (error) {
    // Admission failed: resolve the fire honestly (the agent engine's
    // replay/conflict outcomes map to skipped, everything else to error).
    const message = error instanceof Error ? error.message : String(error)
    const isReplayOrConflict = /another session|bound to a different request/i.test(message)
    await db
      .update(routineRuns)
      .set({
        status: isReplayOrConflict ? 'skipped' : 'error',
        errorCode: isReplayOrConflict ? 'already_fired' : 'admission_failed',
        errorMessage: message.slice(0, 2_000),
        terminalAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(routineRuns.id, fire.runId), eq(routineRuns.workspaceId, fire.workspaceId)))
  }
}
