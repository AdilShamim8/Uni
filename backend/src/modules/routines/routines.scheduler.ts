import { randomUUID } from 'node:crypto'
import { and, eq, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { routines, routineRuns } from '../../db/schema.js'
import { cronMatchesMinute } from './cron.js'
import type { RoutinesDatabase } from './routines.service.js'

/**
 * The routine scheduler tick (T031, P09): a pure-DB minute-tick that
 * decides which routine fires are DUE, claims them with slot
 * semantics, and hands each claimed fire to the executor.
 *
 * Concurrency model:
 * - One fire per routine at a time (the slot): a pending or running
 *   fire blocks new claims until it reaches a terminal status.
 * - Missed-fire policy (deliberate, bounded): after downtime, the MOST
 *   RECENT missed minute inside the routine's catch-up window fires
 *   once; older minutes are skipped without records (0 = no catch-up;
 *   the routine simply waits for its next scheduled minute).
 * - Idempotence: the (routineId, scheduledFor) unique index makes a
 *   double claim by concurrent ticks impossible — the second insert
 *   conflicts and is ignored.
 */

export interface TickResult {
  /** Routines the tick considered (active, non-paused). */
  considered: number
  /** Fires claimed and handed to the executor this tick. */
  claimed: number
  /** Routines skipped because a fire is still pending or running. */
  skippedBusy: number
  /** Routines with no due minute in their catch-up window. */
  skippedNotDue: number
}

/** The non-terminal statuses that hold a routine's slot. */
const SLOT_HOLDING_STATUSES = ['pending', 'running'] as const

export interface RoutineFire {
  routineId: string
  workspaceId: string
  sessionId: string
  prompt: string
  runId: string
  scheduledFor: Date
}

export type FireExecutor = (fire: RoutineFire) => Promise<void>

/**
 * The most recent matching minute for the routine inside its catch-up
 * window (strictly at or before `now`), or null when nothing is due.
 * Minutes before the routine's creation never fire.
 */
export function mostRecentDueMinute(
  schedule: string,
  catchUpMinutes: number,
  createdAt: Date,
  now: Date,
): Date | null {
  // Candidates are whole minutes in [currentMinute - catchUp, currentMinute];
  // catchUp 0 means only the current minute can fire. Minutes before the
  // routine existed never fire. The NEWEST matching minute wins.
  const currentMinute = Math.floor(now.getTime() / 60_000) * 60_000
  const windowStart = currentMinute - catchUpMinutes * 60_000
  const createdFloor = Math.floor(createdAt.getTime() / 60_000) * 60_000
  const oldestAllowed = Math.max(windowStart, createdFloor)
  for (let cursorMs = currentMinute; cursorMs >= oldestAllowed; cursorMs -= 60_000) {
    const cursor = new Date(cursorMs)
    if (cronMatchesMinute(schedule, cursor)) return cursor
  }
  return null
}

export async function runSchedulerTick(
  db: RoutinesDatabase,
  execute: FireExecutor,
  now: Date = new Date(),
): Promise<TickResult> {
  const result: TickResult = { considered: 0, claimed: 0, skippedBusy: 0, skippedNotDue: 0 }

  const active = await db
    .select()
    .from(routines)
    .where(and(eq(routines.paused, false), eq(routines.archived, false)))
    .limit(1_000)
  result.considered = active.length

  for (const routine of active) {
    // Slot check: any pending/running fire holds the routine's slot.
    const held = await db
      .select({ id: routineRuns.id })
      .from(routineRuns)
      .where(
        and(eq(routineRuns.routineId, routine.id), inArray(routineRuns.status, [...SLOT_HOLDING_STATUSES])),
      )
      .limit(1)
    if (held.length > 0) {
      result.skippedBusy += 1
      continue
    }

    const due = mostRecentDueMinute(
      routine.schedule,
      routine.catchUpMinutes,
      routine.createdAt,
      now,
    )
    if (!due) {
      result.skippedNotDue += 1
      continue
    }

    // Claim: insert-or-ignore on the unique (routine, scheduledFor).
    const runId = randomUUID()
    const inserted = await db
      .insert(routineRuns)
      .values({
        id: runId,
        workspaceId: routine.workspaceId,
        routineId: routine.id,
        scheduledFor: due,
        status: 'pending',
      })
      .onConflictDoNothing({ target: [routineRuns.routineId, routineRuns.scheduledFor] })
      .returning({ id: routineRuns.id })
    if (inserted.length === 0) {
      // Another tick (or process) claimed this minute first.
      result.skippedBusy += 1
      continue
    }

    await db
      .update(routines)
      .set({ lastFireAt: due, updatedAt: new Date() })
      .where(eq(routines.id, routine.id))

    result.claimed += 1
    await execute({
      routineId: routine.id,
      workspaceId: routine.workspaceId,
      sessionId: routine.sessionId,
      prompt: routine.prompt,
      runId,
      scheduledFor: due,
    })
  }

  return result
}
