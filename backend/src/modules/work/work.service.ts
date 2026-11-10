import { randomUUID } from 'node:crypto'
import { and, desc, eq, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { workTasks, workRuns } from '../../db/schema.js'
import {
  workTaskDtoSchema,
  workRunDtoSchema,
  type WorkTaskDto,
  type WorkRunDto,
  type WorkTaskStatus,
  type WorkTaskDeliverable,
} from '@uni/contracts'
import { AppError } from '../../lib/errors.js'
import { createSession } from '../agent/agentSession.service.js'
import {
  createAgentRun,
  cancelAgentRun,
  type RunEngineDeps,
} from '../agent/agentRun.service.js'
import { agentRuns } from '../../db/schema.js'

/**
 * The Work service (T018): durable tasks over the agent engine.
 *
 * A task's execution reuses the agent machinery end-to-end — one
 * durable agent session per task (its transcript is the task's
 * conversation), revision runs through the normal admission path, and
 * the report reaches the Library through canonical-save. The service
 * deliberately holds NO execution logic of its own: it links rows and
 * delegates, so the F05/F06 guarantees (SSE semantics, atomic
 * admission, one-way terminals) apply to Work unchanged.
 */

export type WorkDatabase = NodePgDatabase<typeof schema>

/** Status labels shown in UI status lines, per status. */
const STATUS_LABELS: Record<WorkTaskStatus, string> = {
  draft: 'Draft',
  running: 'Working…',
  blocked: 'Waiting for input',
  complete: 'Complete',
  cancelled: 'Stopped',
  error: 'Failed',
}

/** Map a deliverable to the agent session's tool roster. */
function rosterForDeliverable(deliverable: WorkTaskDeliverable): string[] {
  // Read-only research by default; nothing mutating sneaks in via a task.
  return ['read', 'list', 'grep', 'current_time', 'todo', 'web_fetch']
}

function serializeTask(row: typeof workTasks.$inferSelect): WorkTaskDto {
  return workTaskDtoSchema.parse({
    id: row.id,
    title: row.title,
    goal: row.goal,
    deliverable: row.deliverable,
    status: row.status,
    employeeId: row.employeeId,
    sessionId: row.sessionId,
    activeRunId: row.activeRunId,
    artifactId: row.artifactId,
    statusLabel: row.statusLabel || STATUS_LABELS[row.status as WorkTaskStatus] || row.status,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

function serializeRun(row: typeof workRuns.$inferSelect): WorkRunDto {
  return workRunDtoSchema.parse({
    id: row.id,
    taskId: row.taskId,
    revision: row.revision,
    agentRunId: row.agentRunId,
    status: row.status,
    outcome: row.outcome,
    startedAt: row.startedAt.getTime(),
    finishedAt: row.finishedAt ? row.finishedAt.getTime() : null,
  })
}

export async function listWorkTasks(
  db: WorkDatabase,
  workspaceId: string,
  includeCancelled = false,
): Promise<WorkTaskDto[]> {
  const rows = await db
    .select()
    .from(workTasks)
    .where(eq(workTasks.workspaceId, workspaceId))
    .orderBy(desc(workTasks.updatedAt))
    .limit(200)
  return rows
    .filter((row) => includeCancelled || row.status !== 'cancelled')
    .map(serializeTask)
}

export async function getWorkTask(
  db: WorkDatabase,
  workspaceId: string,
  taskId: string,
): Promise<{ task: WorkTaskDto; runs: WorkRunDto[] } | null> {
  const rows = await db
    .select()
    .from(workTasks)
    .where(and(eq(workTasks.id, taskId), eq(workTasks.workspaceId, workspaceId)))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  const runRows = await db
    .select()
    .from(workRuns)
    .where(eq(workRuns.taskId, taskId))
    .orderBy(desc(workRuns.revision))
  return { task: serializeTask(row), runs: runRows.map(serializeRun) }
}

export async function createWorkTask(
  db: WorkDatabase,
  workspaceId: string,
  request: { title: string; goal: string; deliverable: WorkTaskDeliverable; employeeId?: string | null },
): Promise<WorkTaskDto> {
  const inserted = await db
    .insert(workTasks)
    .values({
      id: randomUUID(),
      workspaceId,
      title: request.title,
      goal: request.goal,
      deliverable: request.deliverable,
      status: 'draft',
      employeeId: request.employeeId ?? null,
      sessionId: null,
      activeRunId: null,
      artifactId: null,
      statusLabel: STATUS_LABELS.draft,
    })
    .returning()
  const row = inserted[0]
  if (!row) throw new Error('Work task insert returned no row')
  return serializeTask(row)
}

export async function patchWorkTask(
  db: WorkDatabase,
  workspaceId: string,
  taskId: string,
  patch: { title?: string; goal?: string; deliverable?: string; employeeId?: string | null; artifactId?: string | null },
): Promise<WorkTaskDto | null> {
  const updated = await db
    .update(workTasks)
    .set({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.goal !== undefined ? { goal: patch.goal } : {}),
      ...(patch.deliverable !== undefined ? { deliverable: patch.deliverable } : {}),
      ...(patch.employeeId !== undefined ? { employeeId: patch.employeeId } : {}),
      ...(patch.artifactId !== undefined ? { artifactId: patch.artifactId } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(workTasks.id, taskId), eq(workTasks.workspaceId, workspaceId)))
    .returning()
  const row = updated[0]
  return row ? serializeTask(row) : null
}

/**
 * Start (or restart) a task: provision the task's durable agent session
 * on first start, then admit a revision run through the normal engine
 * path. The prompt is assembled from the task's own fields — goal,
 * deliverable, and (when linked) the employee's instructions arrive via
 * the session's employee pin.
 */
export async function startWorkTask(
  deps: RunEngineDeps,
  workspaceId: string,
  taskId: string,
): Promise<{ task: WorkTaskDto; run: WorkRunDto } | null> {
  const { db } = deps
  const rows = await db
    .select()
    .from(workTasks)
    .where(and(eq(workTasks.id, taskId), eq(workTasks.workspaceId, workspaceId)))
    .limit(1)
  const task = rows[0]
  if (!task) return null
  if (task.status === 'running') {
    throw new AppError('CONFLICT', 'This task is already running.', 409)
  }

  // Provision the durable session on first start (or reuse the task's).
  // The session inherits the EMPLOYEE's pinned provider/model when one
  // is linked (the employee row owns that preference); without an
  // employee the run fails honestly at the provider-resolution step,
  // exactly like a bare agent session without a pin.
  let sessionId = task.sessionId
  if (!sessionId) {
    let providerPin: { providerId: string | null; modelId: string | null } = {
      providerId: null,
      modelId: null,
    }
    if (task.employeeId) {
      const employeeRows = await db
        .select({ providerId: schema.employees.providerId, modelId: schema.employees.modelId })
        .from(schema.employees)
        .where(
          and(
            eq(schema.employees.id, task.employeeId),
            eq(schema.employees.workspaceId, workspaceId),
          ),
        )
        .limit(1)
      if (employeeRows[0]) {
        providerPin = {
          providerId: employeeRows[0].providerId ?? null,
          modelId: employeeRows[0].modelId ?? null,
        }
      }
    }
    const session = await createSession(db, workspaceId, {
      name: `Work: ${task.title}`,
      description: `Durable execution session for the Work task "${task.title}".`,
      mode: 'default',
      tools: rosterForDeliverable(task.deliverable as WorkTaskDeliverable),
      providerId: providerPin.providerId,
      modelId: providerPin.modelId,
      ...(task.employeeId ? { employeeId: task.employeeId } : {}),
    })
    sessionId = session.id
    await db
      .update(workTasks)
      .set({ sessionId, updatedAt: new Date() })
      .where(eq(workTasks.id, taskId))
  }

  // Next revision number for this task.
  const maxRow = await db
    .select({ max: sql<number | null>`max(${workRuns.revision})` })
    .from(workRuns)
    .where(eq(workRuns.taskId, taskId))
  const revision = (maxRow[0]?.max ?? 0) + 1

  // Compose the run prompt from the task fields.
  const prompt = composeTaskPrompt(task.title, task.goal, task.deliverable)
  const { runId: agentRunId } = await createAgentRun(deps, {
    workspaceId,
    sessionId,
    text: prompt,
    idempotencyKey: `work-${taskId}-r${revision}`,
  })

  const runInserted = await db
    .insert(workRuns)
    .values({
      id: randomUUID(),
      workspaceId,
      taskId,
      revision,
      agentRunId,
      status: 'running',
      outcome: null,
      receipts: null,
    })
    .returning()
  const run = runInserted[0]
  if (!run) throw new Error('Work run insert returned no row')

  const updated = await db
    .update(workTasks)
    .set({ status: 'running', activeRunId: agentRunId, statusLabel: STATUS_LABELS.running, updatedAt: new Date() })
    .where(eq(workTasks.id, taskId))
    .returning()

  return updated[0]
    ? { task: serializeTask(updated[0]), run: serializeRun(run) }
    : null
}

function composeTaskPrompt(title: string, goal: string, deliverable: string): string {
  const lines = [`Work task: ${title}.`]
  if (goal.trim()) lines.push(`Goal: ${goal.trim()}`)
  lines.push(
    `Deliverable: ${deliverable}. Produce the requested output as your final message; ` +
      'it will be saved verbatim as the task report.',
  )
  return lines.join('\n')
}

export async function deleteWorkTask(
  db: WorkDatabase,
  workspaceId: string,
  taskId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(workTasks)
    .where(and(eq(workTasks.id, taskId), eq(workTasks.workspaceId, workspaceId)))
    .returning({ id: workTasks.id })
  return deleted.length > 0
}

/**
 * Cancel a running task: delegate to the engine's cancel (one-way
 * terminal; the T020 sync will map stopped → cancelled on the work
 * rows when the run settles).
 */
export async function cancelWorkTask(
  deps: RunEngineDeps,
  workspaceId: string,
  taskId: string,
): Promise<'cancelled' | 'not_found' | 'not_running' | 'already_terminal'> {
  const { db } = deps
  const rows = await db
    .select()
    .from(workTasks)
    .where(and(eq(workTasks.id, taskId), eq(workTasks.workspaceId, workspaceId)))
    .limit(1)
  const task = rows[0]
  if (!task) return 'not_found'
  if (task.status !== 'running' || !task.activeRunId) return 'not_running'

  const outcome = await cancelAgentRun(deps, workspaceId, task.activeRunId)
  return outcome === 'not_found' ? 'not_running' : outcome
}

/**
 * Answer a blocked task: the answer becomes the next user message in
 * the task's agent session (a follow-up run admitted through the
 * normal path, revision+1). A task that is not running/blocked has
 * nothing to answer — an honest 409.
 */
export async function answerWorkTask(
  deps: RunEngineDeps,
  workspaceId: string,
  taskId: string,
  answer: string,
): Promise<{ task: WorkTaskDto; run: WorkRunDto } | 'not_found' | 'not_blocked'> {
  const { db, env } = deps
  void env
  const rows = await db
    .select()
    .from(workTasks)
    .where(and(eq(workTasks.id, taskId), eq(workTasks.workspaceId, workspaceId)))
    .limit(1)
  const task = rows[0]
  if (!task) return 'not_found'
  if (task.status !== 'blocked' && task.status !== 'running') return 'not_blocked'
  if (!task.sessionId) return 'not_blocked'

  const maxRow = await db
    .select({ max: sql<number | null>`max(${workRuns.revision})` })
    .from(workRuns)
    .where(eq(workRuns.taskId, taskId))
  const revision = (maxRow[0]?.max ?? 0) + 1

  const { runId: agentRunId } = await createAgentRun(deps, {
    workspaceId,
    sessionId: task.sessionId,
    text: answer,
    idempotencyKey: `work-${taskId}-r${revision}`,
  })

  const runInserted = await db
    .insert(workRuns)
    .values({
      id: randomUUID(),
      workspaceId,
      taskId,
      revision,
      agentRunId,
      status: 'running',
      outcome: null,
      receipts: null,
    })
    .returning()

  const updated = await db
    .update(workTasks)
    .set({ status: 'running', activeRunId: agentRunId, statusLabel: STATUS_LABELS.running, updatedAt: new Date() })
    .where(eq(workTasks.id, taskId))
    .returning()

  if (!updated[0] || !runInserted[0]) throw new Error('Work answer update returned no row')
  return { task: serializeTask(updated[0]), run: serializeRun(runInserted[0]) }
}

export { serializeTask, serializeRun, STATUS_LABELS }
