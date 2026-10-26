import { z } from 'zod'

/**
 * Run contracts — one model execution answering a user node.
 *
 * A run is created against a conversation (answering an existing user
 * node), executed server-side, and observed through ordered events.
 * Event subscription and cancellation are separate operations from
 * creation: creation is idempotent (client key), events replay from
 * persistence on reconnect, and cancel is durable.
 */

export const runStatusSchema = z.enum([
  'running',
  'cancelling',
  'complete',
  'stopped',
  'repetition_stopped',
  'error',
])
export type RunStatus = z.infer<typeof runStatusSchema>

/** Terminal outcomes — exactly one of these ends a run. */
export const RUN_TERMINAL_STATUSES = ['complete', 'stopped', 'repetition_stopped', 'error'] as const
export type RunTerminalStatus = (typeof RUN_TERMINAL_STATUSES)[number]

export const runEventTypeSchema = z.enum(['started', 'delta', 'usage', 'terminal'])
export type RunEventType = z.infer<typeof runEventTypeSchema>

export const runUsageSchema = z.object({
  inputTokens: z.number().int().nonnegative().optional(),
  outputTokens: z.number().int().nonnegative().optional(),
})
export type RunUsage = z.infer<typeof runUsageSchema>

/** Payload varies by event type; validators check presence at use sites. */
export const runEventPayloadSchema = z.object({
  /** started/delta: exact text for that event (started carries the empty prefix). */
  text: z.string().optional(),
  usage: runUsageSchema.optional(),
  /** terminal only: the one truthful terminal status. */
  status: runStatusSchema.optional(),
  errorCode: z.string().optional(),
  /** User-safe message; never provider dumps or secrets. */
  errorMessage: z.string().optional(),
})
export type RunEventPayload = z.infer<typeof runEventPayloadSchema>

export const runEventSchema = z.object({
  eventId: z.string().min(1),
  runId: z.string().min(1),
  /** Per-run monotonic sequence — the dedupe/resume cursor. */
  sequence: z.number().int().nonnegative(),
  type: runEventTypeSchema,
  timestamp: z.number().int().nonnegative(),
  payload: runEventPayloadSchema,
})
export type RunEvent = z.infer<typeof runEventSchema>

export const createRunRequestSchema = z.object({
  /** The user node this run answers; must exist in the conversation. */
  parentNodeId: z.string().min(1),
  providerId: z.string().min(1),
  /** Defaults to the provider's saved default model. */
  modelId: z.string().min(1).optional(),
  /** Client idempotency key: the same key returns the same run. */
  idempotencyKey: z.string().min(1).max(200).optional(),
})
export type CreateRunRequest = z.infer<typeof createRunRequestSchema>

export const runDtoSchema = z.object({
  id: z.string().min(1),
  conversationId: z.string().min(1),
  parentNodeId: z.string().min(1),
  providerId: z.string().nullable(),
  providerKind: z.enum(['openai-compatible', 'anthropic']),
  providerEndpoint: z.string().min(1),
  modelId: z.string().min(1),
  status: runStatusSchema,
  outputText: z.string(),
  usage: runUsageSchema.nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  terminalAt: z.number().int().nonnegative().nullable(),
})
export type RunDto = z.infer<typeof runDtoSchema>

/** Create-run response: the run plus events persisted so far. */
export const createRunResponseSchema = z.object({
  run: runDtoSchema,
  events: z.array(runEventSchema),
  /** True when an existing run was returned via the idempotency key. */
  reused: z.boolean(),
})
export type CreateRunResponse = z.infer<typeof createRunResponseSchema>

export const cancelRunResponseSchema = z.object({
  run: runDtoSchema,
})
export type CancelRunResponse = z.infer<typeof cancelRunResponseSchema>

/** Event replay cursor: stream events with sequence strictly greater. */
export const runEventsQuerySchema = z.object({
  after: z.coerce.number().int().nonnegative().default(0),
})
export type RunEventsQuery = z.infer<typeof runEventsQuerySchema>
