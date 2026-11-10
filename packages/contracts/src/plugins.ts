import { z } from 'zod'

/**
 * Plugin contracts (T021) — workspace enablement vs per-thread grants.
 *
 * Two distinct gates, mirroring the local plugins store's model:
 *
 * 1. Workspace enablement — an administrator choice that a plugin's
 *    tools exist in this workspace at all. Persisted on the workspace.
 * 2. Grants — permission to use a plugin in ONE thread (conversation,
 *    agent session, or work task). A user grants per thread; revocation
 *    is immediate and in-flight runs are refused from that moment.
 *
 * A run may use a plugin only when BOTH hold: enabled in the workspace
 * AND granted for that thread. Execution receipts record what each run
 * actually did — bounded, user-safe, no secrets.
 */

export const pluginGrantKindSchema = z.enum(['conversation', 'agent-session', 'work-task'])
export type PluginGrantKind = z.infer<typeof pluginGrantKindSchema>

/** The registry entry — static metadata, the same catalog the UI shows. */
export const pluginDescriptorSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  description: z.string().max(2_000),
  /** Capabilities the plugin exposes (tool ids). */
  capabilities: z.array(z.string().min(1).max(100)).max(64),
  /** Whether the plugin needs an external integration to function. */
  integrationRequired: z.boolean(),
})
export type PluginDescriptor = z.infer<typeof pluginDescriptorSchema>

export const pluginGrantDtoSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  pluginId: z.string().min(1).max(100),
  kind: pluginGrantKindSchema,
  /** The thread this grant opens (conversation/agent session/work task id). */
  threadId: z.string().min(1).max(200),
  createdAt: z.number().int().nonnegative(),
})
export type PluginGrantDto = z.infer<typeof pluginGrantDtoSchema>

export const createPluginGrantRequestSchema = z.object({
  pluginId: z.string().trim().min(1).max(100),
  kind: pluginGrantKindSchema,
  threadId: z.string().trim().min(1).max(200),
})
export type CreatePluginGrantRequest = z.infer<typeof createPluginGrantRequestSchema>

/**
 * Execution receipt (T021): one row per plugin invocation, recording
 * the outcome honestly. `detail` is bounded and user-safe; tool inputs
 * appear as their bounded JSON rendering, never credentials.
 */
export const pluginRunReceiptDtoSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  pluginId: z.string().min(1).max(100),
  capability: z.string().min(1).max(100),
  kind: pluginGrantKindSchema,
  threadId: z.string().min(1).max(200),
  /** The agent run that invoked it, when invoked from a run. */
  runId: z.string().nullable(),
  status: z.enum(['ok', 'error', 'denied']),
  detail: z.string().max(2_000),
  createdAt: z.number().int().nonnegative(),
})
export type PluginRunReceiptDto = z.infer<typeof pluginRunReceiptDtoSchema>
