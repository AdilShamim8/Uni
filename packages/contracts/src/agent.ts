import { z } from 'zod'
import { runUsageSchema } from './runs.js'

/**
 * Agent session contracts — a server-side agent workspace with tools,
 * permissioned execution, and an event stream (the abacusai-bot backend
 * model, adapted to Uni's API surface).
 *
 * A session is a standing agent context inside a workspace: a mode that
 * governs tool approval, an optional pinned provider/model, and a
 * workspace-directory sandbox root for file tools. Runs execute inside a
 * session and stream events; tool calls that the mode does not
 * auto-approve surface as permission requests that must be answered
 * before execution continues.
 */

/* ------------------------------------------------------------------ */
/* Modes                                                               */
/* ------------------------------------------------------------------ */

/**
 * Adapted from abacusai-bot `packages/agent/src/protocol.ts` (AgentMode).
 * DEFAULT asks before every mutation; ACCEPTEDITS lets edits through but
 * shell asks; PLAN refuses mutations outright; AUTO skips prompts but
 * stays confined; YOLO skips prompts with no confinement; UNATTENDED is
 * spawn-only (routines) and never asks.
 */
export const agentModeSchema = z.enum([
  'default',
  'acceptEdits',
  'plan',
  'auto',
  'yolo',
  'unattended',
])
export type AgentMode = z.infer<typeof agentModeSchema>

/** Modes a client may switch a session into; `unattended` is spawn-only. */
export const AGENT_SWITCHABLE_MODES = ['default', 'acceptEdits', 'plan', 'auto', 'yolo'] as const
export type AgentSwitchableMode = (typeof AGENT_SWITCHABLE_MODES)[number]

export const parseAgentModeStrict = (raw: string | undefined): AgentMode | null => {
  switch ((raw ?? '').trim().toLowerCase()) {
    case 'default':
    case 'normal':
      return 'default'
    case 'acceptedits':
      return 'acceptEdits'
    case 'plan':
      return 'plan'
    case 'auto':
      return 'auto'
    case 'yolo':
    case 'full_access':
      return 'yolo'
    case 'unattended':
      return 'unattended'
    default:
      return null
  }
}

/* ------------------------------------------------------------------ */
/* Session                                                             */
/* ------------------------------------------------------------------ */

export const agentSessionStatusSchema = z.enum([
  'idle',
  'running',
  'waiting-for-permission',
  'error',
])
export type AgentSessionStatus = z.infer<typeof agentSessionStatusSchema>

export const agentSessionDtoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(2_000),
  mode: agentModeSchema,
  status: agentSessionStatusSchema,
  /** Soft pin: resolved at send time, survives provider deletion. */
  providerId: z.string().nullable(),
  modelId: z.string().nullable(),
  /** Directory root file tools are confined to (relative to the workspace agent root). */
  rootDir: z.string().min(1).max(500),
  /** Tool names enabled for this session (roster names, see agentTools.ts). */
  tools: z.array(z.string().min(1).max(100)).max(64),
  archived: z.boolean(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export type AgentSessionDto = z.infer<typeof agentSessionDtoSchema>

/* ------------------------------------------------------------------ */
/* Session root safety (F01)                                           */
/* ------------------------------------------------------------------ */

/**
 * The one gate a rootDir string must pass before it may influence a
 * filesystem path: a RELATIVE path of forward-slash-joined safe
 * segments. Absolute paths, `..`/`.` segments (and any segment
 * CONTAINING `..`), backslashes, NULs and empty segments all fail, so a
 * stored rootDir can never traverse out of the workspace agent root.
 * Server-derived roots (`sessions/<sessionId>`) pass trivially.
 */
export function isValidRootDir(value: string): boolean {
  if (value.length === 0 || value.length > 500) return false
  // Trailing slashes are cosmetic; strip them so 'sessions/x/' is valid.
  const trimmed = value.replace(/\/+$/, '')
  if (trimmed.length === 0) return false
  if (trimmed.startsWith('/') || trimmed.includes('\\') || trimmed.includes('\0')) return false
  return trimmed.split('/').every((segment) => {
    if (segment.length === 0 || segment.length > 200) return false
    if (segment === '.' || segment.includes('..')) return false
    return /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(segment)
  })
}

export const createAgentSessionRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2_000).optional(),
  mode: agentModeSchema.exclude(['unattended']).optional(),
  providerId: z.string().trim().min(1).max(200).nullable().optional(),
  modelId: z.string().trim().min(1).max(200).nullable().optional(),
  /**
   * Optional sub-organization INSIDE the session's server-owned
   * directory. The server always prefixes the session's own id, so two
   * sessions can never share (or collide into) a root, and traversal
   * forms are rejected here before they reach the filesystem (F01).
   */
  rootDir: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .refine(isValidRootDir, {
      message:
        'rootDir must be a relative path of safe segments (no absolute paths, "..", "." or backslashes).',
    })
    .optional(),
  tools: z.array(z.string().trim().min(1).max(100)).max(64).optional(),
})
export type CreateAgentSessionRequest = z.infer<typeof createAgentSessionRequestSchema>

export const patchAgentSessionRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2_000).optional(),
    mode: agentModeSchema.exclude(['unattended']).optional(),
    providerId: z.string().trim().min(1).max(200).nullable().optional(),
    modelId: z.string().trim().min(1).max(200).nullable().optional(),
    tools: z.array(z.string().trim().min(1).max(100)).max(64).optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No fields to update.' })
export type PatchAgentSessionRequest = z.infer<typeof patchAgentSessionRequestSchema>

/* ------------------------------------------------------------------ */
/* Permission requests (adapted from abacusai-bot permissions.ts)      */
/* ------------------------------------------------------------------ */

/** A tool call the model wants to make, as the permission gate sees it. */
export const toolRequestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  input: z.record(z.string(), z.unknown()),
})
export type ToolRequest = z.infer<typeof toolRequestSchema>

/** The ask kinds the gate can produce; one per decision the user faces. */
export const permissionRequestTypeSchema = z.enum([
  'run_terminal',
  'edit_file',
  'write_file',
  'read_outside_directory',
  'write_outside_directory',
  'edit_outside_directory',
  'fetch_url',
  'generic',
  'exit_plan_mode',
])
export type PermissionRequestType = z.infer<typeof permissionRequestTypeSchema>

const permissionRequestBase = {
  /** Unique per request; the response addresses it. */
  requestId: z.string().min(1),
  tool: toolRequestSchema,
  displayName: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
}

export const permissionRequestSchema = z.discriminatedUnion('type', [
  z.object({
    ...permissionRequestBase,
    type: z.literal('run_terminal'),
    command: z.string(),
    cwd: z.string(),
    background: z.boolean().optional(),
    credentialPaths: z.array(z.string()).optional(),
  }),
  z.object({
    ...permissionRequestBase,
    type: z.literal('edit_file'),
    filePath: z.string(),
    originalContent: z.string(),
    newContent: z.string(),
  }),
  z.object({
    ...permissionRequestBase,
    type: z.literal('write_file'),
    filePath: z.string(),
    originalContent: z.string(),
    content: z.string(),
    isNewFile: z.boolean(),
  }),
  z.object({
    ...permissionRequestBase,
    type: z.literal('read_outside_directory'),
    filePath: z.string(),
    resolvedPath: z.string(),
    deducedDirectory: z.string(),
  }),
  z.object({
    ...permissionRequestBase,
    type: z.literal('write_outside_directory'),
    filePath: z.string(),
    resolvedPath: z.string(),
    deducedDirectory: z.string(),
    isNewFile: z.boolean().optional(),
  }),
  z.object({
    ...permissionRequestBase,
    type: z.literal('edit_outside_directory'),
    filePath: z.string(),
    resolvedPath: z.string(),
    deducedDirectory: z.string(),
  }),
  z.object({
    ...permissionRequestBase,
    type: z.literal('fetch_url'),
    /** The full URL, never a summary: the query string can carry data. */
    url: z.string(),
    origin: z.string(),
  }),
  z.object({
    ...permissionRequestBase,
    type: z.literal('generic'),
    toolName: z.string(),
    inputSummary: z.string(),
  }),
  z.object({
    ...permissionRequestBase,
    type: z.literal('exit_plan_mode'),
    planContent: z.string(),
    planFilePath: z.string(),
  }),
])
export type PermissionRequest = z.infer<typeof permissionRequestSchema>

/** The user's answer. `always` scopes by kind: command prefix, tool, origin, or directory. */
export const permissionDecisionSchema = z.object({
  requestId: z.string().min(1),
  decision: z.enum(['approve', 'deny']),
  /** once = this call; always = widen the session allowance for the kind. */
  scope: z.enum(['once', 'always']).default('once'),
})
export type PermissionDecision = z.infer<typeof permissionDecisionSchema>

/** What a denied permission tells the model (it must adapt, not retry). */
export const permissionDenialSchema = z.object({
  requestId: z.string().min(1),
  reason: z.string(),
})
export type PermissionDenial = z.infer<typeof permissionDenialSchema>

/* ------------------------------------------------------------------ */
/* Agent event stream (AG-UI vocabulary, SSE-shaped like RunEvent)     */
/* ------------------------------------------------------------------ */

/**
 * Adapted from abacusai-bot's AG-UI event vocabulary
 * (packages/agent/src/agui/emit.ts) onto Uni's ordered,
 * persisted-event SSE model: every event is a row with a per-session
 * monotonic sequence (the replay cursor), exactly like RunEvent.
 */
export const agentEventTypeSchema = z.enum([
  'run_started',
  'text_delta',
  'tool_call_started',
  'tool_call_result',
  'permission_requested',
  'permission_resolved',
  'usage',
  'run_finished',
  'error',
])
export type AgentEventType = z.infer<typeof agentEventTypeSchema>

export const agentToolResultStatusSchema = z.enum(['ok', 'error', 'denied'])
export type AgentToolResultStatus = z.infer<typeof agentToolResultStatusSchema>

/** Terminal outcomes for an agent run — the runs module's honesty rules. */
export const agentRunStatusSchema = z.enum([
  'running',
  'waiting-for-permission',
  'cancelling',
  'complete',
  'stopped',
  'error',
])
export type AgentRunStatus = z.infer<typeof agentRunStatusSchema>

export const AGENT_RUN_TERMINAL_STATUSES = ['complete', 'stopped', 'error'] as const
export type AgentRunTerminalStatus = (typeof AGENT_RUN_TERMINAL_STATUSES)[number]

export const agentEventPayloadSchema = z.object({
  /** run_started: the input text that began the run. */
  inputText: z.string().optional(),
  /** text_delta: the exact text of this delta. */
  text: z.string().optional(),
  /** tool_call_started / tool_call_result. */
  toolCallId: z.string().optional(),
  toolName: z.string().optional(),
  toolInput: z.record(z.string(), z.unknown()).optional(),
  toolResultStatus: agentToolResultStatusSchema.optional(),
  /** Bounded tool output (errors and results are truncated server-side). */
  toolOutput: z.string().optional(),
  /** permission_requested: the full PermissionRequest. */
  permissionRequest: permissionRequestSchema.optional(),
  /** permission_resolved: approve/deny + scope. */
  decision: permissionDecisionSchema.optional(),
  usage: runUsageSchema.optional(),
  /** run_finished: the one truthful terminal status. */
  status: agentRunStatusSchema.optional(),
  errorCode: z.string().optional(),
  /** User-safe message; never provider dumps or secrets. */
  errorMessage: z.string().optional(),
})
export type AgentEventPayload = z.infer<typeof agentEventPayloadSchema>

export const agentEventSchema = z.object({
  eventId: z.string().min(1),
  sessionId: z.string().min(1),
  runId: z.string().min(1).nullable(),
  /** Per-session monotonic sequence — the dedupe/resume cursor. */
  sequence: z.number().int().nonnegative(),
  type: agentEventTypeSchema,
  timestamp: z.number().int().nonnegative(),
  payload: agentEventPayloadSchema,
})
export type AgentEvent = z.infer<typeof agentEventSchema>

/* ------------------------------------------------------------------ */
/* Session run + permission API requests                               */
/* ------------------------------------------------------------------ */

export const sendAgentMessageRequestSchema = z.object({
  text: z.string().trim().min(1).max(50_000),
  /** Client idempotency key: the same key returns the same run. */
  idempotencyKey: z.string().min(1).max(200).optional(),
})
export type SendAgentMessageRequest = z.infer<typeof sendAgentMessageRequestSchema>

export const respondAgentPermissionRequestSchema = z.object({
  decision: permissionDecisionSchema,
})
export type RespondAgentPermissionRequest = z.infer<typeof respondAgentPermissionRequestSchema>

export const agentRunDtoSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  status: agentRunStatusSchema,
  inputText: z.string(),
  outputText: z.string(),
  providerId: z.string().nullable(),
  modelId: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
  finishedAt: z.number().int().nonnegative().nullable(),
})
export type AgentRunDto = z.infer<typeof agentRunDtoSchema>
