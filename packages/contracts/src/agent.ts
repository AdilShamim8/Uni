import { z } from 'zod'

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

export const createAgentSessionRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2_000).optional(),
  mode: agentModeSchema.exclude(['unattended']).optional(),
  providerId: z.string().trim().min(1).max(200).nullable().optional(),
  modelId: z.string().trim().min(1).max(200).nullable().optional(),
  rootDir: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9._\-/]*$/)
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
