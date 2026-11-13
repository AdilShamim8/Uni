import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { routines, routineRuns } from '../../db/schema.js'
import {
  routineDtoSchema,
  routineRunDtoSchema,
  type RoutineDto,
  type RoutineRunDto,
} from '@uni/contracts'
import { badRequest, notFound } from '../../lib/errors.js'
import { InvalidCronError, parseCron, nextCronFire } from './cron.js'
import { createSession, patchSession, type AgentDatabase } from '../agent/agentSession.service.js'

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

/** Preview horizon for the computed next fire: 7 days of minutes. */
const NEXT_FIRE_SCAN_MINUTES = 7 * 24 * 60

function serializeRoutine(
  row: typeof routines.$inferSelect,
  employeeName: string | null = null,
): RoutineDto {
  // The next fire is computed by the server's own evaluator — paused
  // routines do not fire, so their preview is honestly null.
  let nextFireAt: number | null = null
  if (!row.paused && !row.archived) {
    try {
      const next = nextCronFire(row.schedule, new Date(), NEXT_FIRE_SCAN_MINUTES)
      nextFireAt = next ? next.getTime() : null
    } catch {
      nextFireAt = null // an unparseable stored schedule degrades honestly
    }
  }
  return routineDtoSchema.parse({
    id: row.id,
    sessionId: row.sessionId,
    employeeId: row.employeeId,
    employeeName,
    name: row.name,
    prompt: row.prompt,
    schedule: row.schedule,
    catchUpMinutes: row.catchUpMinutes,
    paused: row.paused,
    archived: row.archived,
    lastFireAt: row.lastFireAt ? row.lastFireAt.getTime() : null,
    nextFireAt,
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

/**
 * The read-only roster a routine may ever use unattended: no shell, no
 * writes, no web fetches (the unattended policy refuses them anyway —
 * this is the same list, declared up front so the session row and the
 * gate cannot drift).
 */
export const ROUTINE_ROSTER = [
  'read',
  'list',
  'grep',
  'current_time',
  'todo',
  // P10 — the workspace's indexed documents (read-only, bounded
  // excerpts; the unattended policy allows it explicitly).
  'knowledge_search',
] as const

/**
 * Provision the routine's own unattended session. Mode 'unattended' is
 * deliberately NOT creatable through the public session API; routines
 * are the one internal provisioner (scheduled tasks never inherit
 * interactive permissions — they cannot ask and cannot mutate).
 */
async function provisionRoutineSession(
  db: RoutinesDatabase,
  workspaceId: string,
  name: string,
  employee: { id: string; providerId: string | null; modelId: string | null } | null,
): Promise<string> {
  const request = {
    name: `Routine: ${name}`,
    description: `Unattended session provisioned for the routine "${name}".`,
    mode: 'unattended' as const,
    tools: [...ROUTINE_ROSTER],
    providerId: employee?.providerId ?? null,
    modelId: employee?.modelId ?? null,
    employeeId: employee?.id ?? null,
  }
  const session = await createSession(
    db as unknown as AgentDatabase,
    workspaceId,
    // 'unattended' is outside the public request union by design; this
    // is the single internal call site that may widen it.
    request as unknown as Parameters<typeof createSession>[2],
  )
  return session.id
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
  const visible = rows.filter((row) => includeArchived || !row.archived)
  const pinnedIds = [...new Set(visible.map((row) => row.employeeId).filter((id): id is string => id !== null))]
  const names = new Map<string, string>()
  if (pinnedIds.length > 0) {
    const employeeRows = await db
      .select({ id: schema.employees.id, name: schema.employees.name })
      .from(schema.employees)
      .where(and(eq(schema.employees.workspaceId, workspaceId), inArray(schema.employees.id, pinnedIds)))
    for (const employee of employeeRows) names.set(employee.id, employee.name)
  }
  return visible.map((row) => serializeRoutine(row, row.employeeId ? (names.get(row.employeeId) ?? null) : null))
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
  let employeeName: string | null = null
  if (row.employeeId) {
    const employeeRow = await db
      .select({ name: schema.employees.name })
      .from(schema.employees)
      .where(and(eq(schema.employees.id, row.employeeId), eq(schema.employees.workspaceId, workspaceId)))
      .limit(1)
    employeeName = employeeRow[0]?.name ?? null
  }
  return { routine: serializeRoutine(row, employeeName), runs: runRows.map(serializeRun) }
}

export async function createRoutine(
  db: RoutinesDatabase,
  workspaceId: string,
  input: {
    name: string
    prompt: string
    schedule: string
    catchUpMinutes: number
    employeeId?: string | null
  },
): Promise<RoutineDto> {
  assertValidSchedule(input.schedule)

  // Resolve the employee pin (same workspace) when linked; a foreign or
  // missing employee is an honest 404 before anything is provisioned.
  let employee: { id: string; name: string; providerId: string | null; modelId: string | null } | null = null
  if (input.employeeId) {
    const rows = await db
      .select({
        id: schema.employees.id,
        name: schema.employees.name,
        providerId: schema.employees.providerId,
        modelId: schema.employees.modelId,
      })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, input.employeeId),
          eq(schema.employees.workspaceId, workspaceId),
        ),
      )
      .limit(1)
    if (!rows[0]) throw notFound('Employee not found in this workspace.')
    employee = rows[0]
  }

  const sessionId = await provisionRoutineSession(db, workspaceId, input.name, employee)
  const row = await db
    .insert(routines)
    .values({
      id: randomUUID(),
      workspaceId,
      sessionId,
      employeeId: employee?.id ?? null,
      name: input.name,
      prompt: input.prompt,
      schedule: input.schedule,
      catchUpMinutes: input.catchUpMinutes,
    })
    .returning()
  const created = row[0]
  if (!created) throw new Error('Routine insert returned no row.')
  return serializeRoutine(created, employee?.name ?? null)
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
    employeeId?: string | null
  },
): Promise<RoutineDto | null> {
  if (input.schedule !== undefined) assertValidSchedule(input.schedule)
  const existing = await db
    .select()
    .from(routines)
    .where(and(eq(routines.id, routineId), eq(routines.workspaceId, workspaceId)))
    .limit(1)
  if (!existing[0]) return null

  // A re-pin resolves exactly like the create-time pin (same-workspace
  // employee, honest 404 before anything changes) and follows into the
  // provisioned session — the execution identity must match the badge.
  let employee: { id: string; name: string; providerId: string | null; modelId: string | null } | null = null
  if (input.employeeId !== undefined && input.employeeId !== null) {
    const rows = await db
      .select({
        id: schema.employees.id,
        name: schema.employees.name,
        providerId: schema.employees.providerId,
        modelId: schema.employees.modelId,
      })
      .from(schema.employees)
      .where(
        and(eq(schema.employees.id, input.employeeId), eq(schema.employees.workspaceId, workspaceId)),
      )
      .limit(1)
    if (!rows[0]) throw notFound('Employee not found in this workspace.')
    employee = rows[0]
  }
  if (input.employeeId !== undefined) {
    await patchSession(db as unknown as AgentDatabase, workspaceId, existing[0].sessionId, {
      employeeId: employee?.id ?? null,
      providerId: employee?.providerId ?? null,
      modelId: employee?.modelId ?? null,
    })
  }

  const row = await db
    .update(routines)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(routines.id, routineId), eq(routines.workspaceId, workspaceId)))
    .returning()
  const updated = row[0]
  if (!updated) return null
  return serializeRoutine(updated, employee?.name ?? null)
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
