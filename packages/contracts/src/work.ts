import { z } from 'zod'

/**
 * Work contracts (T018) — durable, server-side Work tasks.
 *
 * A Work task is a goal delegated to an employee (agent), executed as
 * agent runs inside a durable session, producing reports that save to
 * the Library through the canonical-save operation. The domain mirrors
 * the frontend's task machine states so adapters map one-to-one:
 *
 *   draft → running (via a run) → blocked (input needed) → complete
 *   with cancel/pause paths that map to the machine's honest stops.
 *
 * Receipts (T020): every run persists what actually happened — source
 * ids used, tool outcomes, and output provenance — without secrets and
 * without invented citations.
 */

/* ------------------------------------------------------------------ */
/* Task                                                                */
/* ------------------------------------------------------------------ */

export const workTaskStatusSchema = z.enum([
  'draft',
  'running',
  'blocked',
  'complete',
  'cancelled',
  'error',
])
export type WorkTaskStatus = z.infer<typeof workTaskStatusSchema>

/** What the task should produce (maps to the frontend deliverable). */
export const workTaskDeliverableSchema = z.enum([
  'research-report',
  'data-report',
  'email-draft',
  'document-draft',
  'generic',
])
export type WorkTaskDeliverable = z.infer<typeof workTaskDeliverableSchema>

export const workTaskDtoSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(300),
  goal: z.string().max(10_000),
  deliverable: workTaskDeliverableSchema,
  status: workTaskStatusSchema,
  /** The employee (server identity) the task is assigned to. */
  employeeId: z.string().nullable(),
  /** The agent session durable runs execute in. */
  sessionId: z.string().nullable(),
  /** The run currently executing, if any. */
  activeRunId: z.string().nullable(),
  /** The Library artifact the canonical report is saved to. */
  artifactId: z.string().nullable(),
  /** Human-oriented status label ("Researching…", "Waiting for input"). */
  statusLabel: z.string(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export type WorkTaskDto = z.infer<typeof workTaskDtoSchema>

export const createWorkTaskRequestSchema = z.object({
  title: z.string().trim().min(1).max(300),
  goal: z.string().trim().max(10_000).default(''),
  deliverable: workTaskDeliverableSchema.default('generic'),
  /** Optional employee link; a null means unassigned. */
  employeeId: z.string().trim().min(1).max(200).nullable().optional(),
})
export type CreateWorkTaskRequest = z.infer<typeof createWorkTaskRequestSchema>

export const patchWorkTaskRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    goal: z.string().trim().max(10_000).optional(),
    deliverable: workTaskDeliverableSchema.optional(),
    employeeId: z.string().trim().min(1).max(200).nullable().optional(),
    artifactId: z.string().trim().min(1).max(200).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No fields to update.' })
export type PatchWorkTaskRequest = z.infer<typeof patchWorkTaskRequestSchema>

/* ------------------------------------------------------------------ */
/* Runs + revisions                                                    */
/* ------------------------------------------------------------------ */

/**
 * One durable execution attempt of a task: the agent run id, the
 * revision number (a follow-up is revision 2+), and how it ended.
 */
export const workRunDtoSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  revision: z.number().int().positive(),
  agentRunId: z.string().min(1),
  status: z.enum(['running', 'complete', 'stopped', 'error']),
  /** User-safe summary of how the run ended (never provider dumps). */
  outcome: z.string().nullable(),
  startedAt: z.number().int().nonnegative(),
  finishedAt: z.number().int().nonnegative().nullable(),
})
export type WorkRunDto = z.infer<typeof workRunDtoSchema>

/* ------------------------------------------------------------------ */
/* Receipts (T020)                                                     */
/* ------------------------------------------------------------------ */

/** One tool outcome recorded in a run — bounded, no secrets. */
export const workToolReceiptSchema = z.object({
  tool: z.string().min(1).max(100),
  /** ok | error | denied — the same status the event stream shows. */
  outcome: z.enum(['ok', 'error', 'denied']),
  /** Bounded user-safe detail (truncated server-side). */
  detail: z.string().max(2_000),
  at: z.number().int().nonnegative(),
})
export type WorkToolReceipt = z.infer<typeof workToolReceiptSchema>

/**
 * What a run actually used and produced: the source ids (conversation
 * nodes, artifacts, files) referenced, tool outcomes, and where the
 * output came from. Persisted on the run row; never contains
 * credentials and never cites a source the run did not read.
 */
export const workRunReceiptsSchema = z.object({
  sources: z
    .array(
      z.object({
        kind: z.enum(['conversation', 'artifact', 'file', 'url']),
        id: z.string().min(1).max(300),
      }),
    )
    .max(200),
  tools: z.array(workToolReceiptSchema).max(500),
  provenance: z.enum(['provider-generated', 'demo-simulation']),
})
export type WorkRunReceipts = z.infer<typeof workRunReceiptsSchema>

/* ------------------------------------------------------------------ */
/* Task actions                                                        */
/* ------------------------------------------------------------------ */

export const workTaskActionSchema = z.enum(['start', 'cancel', 'answer'])
export type WorkTaskAction = z.infer<typeof workTaskActionSchema>

export const workTaskActionRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start') }),
  z.object({ action: z.literal('cancel') }),
  z.object({ action: z.literal('answer'), answer: z.string().trim().min(1).max(10_000) }),
])
export type WorkTaskActionRequest = z.infer<typeof workTaskActionRequestSchema>
