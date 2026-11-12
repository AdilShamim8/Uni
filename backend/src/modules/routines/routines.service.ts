import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { agentSessions, routines, routineRuns } from '../../db/schema.js'
import {
  routineDtoSchema,
  routineRunDtoSchema,
  type RoutineDto,
  type RoutineRunDto,
} from '@uni/contracts'
import { badRequest, notFound } from '../../lib/errors.js'
import { InvalidCronError, parseCron } from './cron.js'

/**
 * The routines service (T030, P09): scheduled prompts inside agent
 * sessions. CRUD only in this slice — the scheduler tick (T031) and
 * execution (T032) build on these rows.
 *
 * Every operation is workspace-scoped, and the target session must
 * belong to the SAME workspace before a routine can reference it (a
 * browser-provided sessionId is never trusted on its own).
 */

export type RoutinesDatabase = NodePgDatabase<typeof schema>

function serializeRoutine(row: typeof routines.$inferSelect): RoutineDto {
  return routineDtoSchema.parse({
    id: row.id,
    sessionId: row.sessionId,
    name: row.name,
    prompt: row.prompt,
    schedule: row.schedule,
    catchUpMinutes: row.catchUpMinutes,
    paused: row.paused,
    archived: row.archived,
    lastFireAt: row.lastFireAt ? row.lastFireAt.getTime() : null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

function serializeRun(row: typeof routineRuns.$inferSelect): RoutineRunDto {
  return routineRunDtoSchema.parse({
    id: row.id,
    routineId: row.routineId,
    scheduledFor: row.scheduledFor.getTime(),
    status: row.status as RoutineRunDto['status'],
    agentRunId: row.agentRunId,
    outputText: row.outputText,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.getTime(),
    terminalAt: row.terminalAt ? row.terminalAt.getTime() : null,
  })
}

/** Validates the cron expression with the scheduler's own parser. */
export function assertValidSchedule(schedule: string): void {
  try {
    parseCron(schedule)
  } catch (error) {
    if (error instanceof InvalidCronError) {
      throw badRequest(`Invalid schedule: ${error.message}`)
    }
    throw error
  }
}

async function assertSessionInWorkspace(
  db: RoutinesDatabase,
  workspaceId: string,
  sessionId: string,
): Promise<void> {
  const rows = await db
    .select({ id: agentSessions.id })
    .from(agentSessions)
    .where(and(eq(agentSessions.id, sessionId), eq(agentSessions.workspaceId, workspaceId)))
    .limit(1)
  if (!rows[0]) {
    throw notFound('Agent session not found in this workspace.')
  }
}

export async function listRoutines(
  db: RoutinesDatabase,
  workspaceId: string,
  includeArchived = false,
): Promise<RoutineDto[]> {
  const rows = await db
    .select()
    .from(routines)
    .where(eq(routines.workspaceId, workspaceId))
    .orderBy(desc(routines.updatedAt))
    .limit(200)
  return rows
    .filter((row) => includeArchived || !row.archived)
    .map(serializeRoutine)
}

export async function getRoutine(
  db: RoutinesDatabase,
  workspaceId: string,
  routineId: string,
): Promise<{ routine: RoutineDto; runs: RoutineRunDto[] } | null> {
  const rows = await db
    .select()
    .from(routines)
    .where(and(eq(routines.id, routineId), eq(routines.workspaceId, workspaceId)))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  const runRows = await db
    .select()
    .from(routineRuns)
    .where(eq(routineRuns.routineId, routineId))
    .orderBy(desc(routineRuns.scheduledFor))
    .limit(100)
  return { routine: serializeRoutine(row), runs: runRows.map(serializeRun) }
}

export async function createRoutine(
  db: RoutinesDatabase,
  workspaceId: string,
  input: {
    sessionId: string
    name: string
    prompt: string
    schedule: string
    catchUpMinutes: number
  },
): Promise<RoutineDto> {
  assertValidSchedule(input.schedule)
  await assertSessionInWorkspace(db, workspaceId, input.sessionId)
  const row = await db
    .insert(routines)
    .values({
      id: randomUUID(),
      workspaceId,
      sessionId: input.sessionId,
      name: input.name,
      prompt: input.prompt,
      schedule: input.schedule,
      catchUpMinutes: input.catchUpMinutes,
    })
    .returning()
  const created = row[0]
  if (!created) throw new Error('Routine insert returned no row.')
  return serializeRoutine(created)
}

export async function patchRoutine(
  db: RoutinesDatabase,
  workspaceId: string,
  routineId: string,
  input: {
    name?: string
    prompt?: string
    schedule?: string
    catchUpMinutes?: number
    paused?: boolean
    archived?: boolean
  },
): Promise<RoutineDto | null> {
  if (input.schedule !== undefined) assertValidSchedule(input.schedule)
  const existing = await db
    .select()
    .from(routines)
    .where(and(eq(routines.id, routineId), eq(routines.workspaceId, workspaceId)))
    .limit(1)
  if (!existing[0]) return null
  const row = await db
    .update(routines)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(routines.id, routineId), eq(routines.workspaceId, workspaceId)))
    .returning()
  const updated = row[0]
  if (!updated) return null
  return serializeRoutine(updated)
}

export async function deleteRoutine(
  db: RoutinesDatabase,
  workspaceId: string,
  routineId: string,
): Promise<boolean> {
  const row = await db
    .delete(routines)
    .where(and(eq(routines.id, routineId), eq(routines.workspaceId, workspaceId)))
    .returning({ id: routines.id })
  return row.length > 0
}
