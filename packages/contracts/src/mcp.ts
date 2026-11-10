import { z } from 'zod'

/**
 * MCP contracts (T023) — workspace-scoped external MCP servers.
 *
 * A configured server is a REMOTE tool provider connected over the
 * time-bounded, SSRF-guarded HTTP transport. Authentication material
 * (bearer tokens) is stored encrypted (the same secretBox envelope as
 * provider credentials) and NEVER leaves the server in API responses —
 * only a boolean `authConfigured` does.
 *
 * States are honest by construction: `disconnected` until a successful
 * connect/test, `connected` while the last test passed, `error` with
 * the last failure reason. stdio transport is intentionally absent —
 * remote HTTP only (T025 will gate stdio behind isolated workers).
 */

export const mcpServerStatusSchema = z.enum(['disconnected', 'connected', 'error'])
export type McpServerStatus = z.infer<typeof mcpServerStatusSchema>

/** Auth shapes the HTTP transport supports. */
export const mcpAuthConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('bearer'), token: z.string().min(1).max(4_000) }),
])
export type McpAuthConfig = z.infer<typeof mcpAuthConfigSchema>

/** The public DTO — auth material is never included. */
export const mcpServerDtoSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  /** The remote HTTP endpoint (https required in production). */
  url: z.string().min(1).max(2_000),
  status: mcpServerStatusSchema,
  /** Whether auth material is stored (never the material itself). */
  authConfigured: z.boolean(),
  authType: z.enum(['none', 'bearer']).nullable(),
  /** User-safe last error when status is 'error', null otherwise. */
  lastError: z.string().max(1_000).nullable(),
  /** Server-declared capabilities from the last successful connect. */
  serverInfo: z
    .object({ name: z.string().max(200).nullable(), version: z.string().max(100).nullable() })
    .nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export type McpServerDto = z.infer<typeof mcpServerDtoSchema>

export const createMcpServerRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  url: z.string().trim().url().max(2_000),
  auth: mcpAuthConfigSchema.optional(),
})
export type CreateMcpServerRequest = z.infer<typeof createMcpServerRequestSchema>

export const patchMcpServerRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    url: z.string().trim().url().max(2_000).optional(),
    auth: mcpAuthConfigSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No fields to update.' })
export type PatchMcpServerRequest = z.infer<typeof patchMcpServerRequestSchema>

/**
 * A tool listed from a connected server (T024 namespaces these by
 * server identity before any agent sees them). The remote's
 * readOnly/annotations hints are carried as UNTRUSTED hints — display
 * only, never an access decision.
 */
export const mcpToolDtoSchema = z.object({
  /** The remote's own tool name. */
  name: z.string().min(1).max(200),
  description: z.string().max(4_000).nullable(),
  /** The namespaced id agents call it by: <serverNameSlug>__<name>. */
  namespacedName: z.string().min(1).max(300),
  /** Untrusted remote hint — display only. */
  readOnlyHint: z.boolean().nullable(),
})
export type McpToolDto = z.infer<typeof mcpToolDtoSchema>
