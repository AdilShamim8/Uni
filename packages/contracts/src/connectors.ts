import { z } from 'zod'

/**
 * The connector catalog contract — adapted from abacusai-bot
 * packages/connectors/src/registry.ts. In Uni every entry is HONESTLY
 * NOT CONNECTED until a real integration exists: the registry is the
 * allowlist of what a session may mention, and status endpoints report
 * 'unavailable' — never a fabricated live connection.
 */

export const connectorKindSchema = z.enum(['platform', 'messaging', 'mcp'])
export type ConnectorKind = z.infer<typeof connectorKindSchema>

export const connectorCategorySchema = z.enum([
  'messaging',
  'featured',
  'development',
  'productivity',
  'data',
  'infrastructure',
  'web',
  'payments',
  'support',
])
export type ConnectorCategory = z.infer<typeof connectorCategorySchema>

export const connectorDtoSchema = z.object({
  /** Stable across every surface (upstream: card data-ids, templates). */
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  kind: connectorKindSchema,
  category: connectorCategorySchema,
  /** Where the user would read what the service can do. */
  docsUrl: z.string().url(),
  /** The kinds of task this connector answers, in the model's words. */
  routes: z.array(z.string().min(1)).max(20),
  /** Steps to make this connectable, in order; honest prerequisites only. */
  setup: z.array(z.string().min(1)).max(20),
  /**
   * Connection status — 'unavailable' until a verified credential
   * exists for the caller's workspace (T027: GitHub), then 'available'.
   * Catalog-only connectors stay 'unavailable' honestly.
   */
  status: z.enum(['unavailable', 'available']),
})
export type ConnectorDto = z.infer<typeof connectorDtoSchema>

/**
 * T027 / RF-089 — connector credential shapes. The stored token itself
 * is never in any DTO: routes expose presence and verification state
 * only, plus the outcome of a connection test.
 */
export const connectorCredentialDtoSchema = z.object({
  connectorId: z.string().min(1),
  /** 'untested' | 'verified' | 'invalid'. */
  status: z.string().min(1),
  lastCheckedAt: z.number().int().nonnegative().nullable(),
  lastError: z.string().nullable(),
})
export type ConnectorCredentialDto = z.infer<typeof connectorCredentialDtoSchema>

export const connectorTestRequestSchema = z.object({
  /** Test this token now (nothing is stored). Omit to test the stored one. */
  token: z.string().trim().min(1).max(400).optional(),
})
export type ConnectorTestRequest = z.infer<typeof connectorTestRequestSchema>

export const connectorTestResultDtoSchema = z.object({
  connectorId: z.string().min(1),
  ok: z.boolean(),
  /** The account login the token belongs to (GitHub: /user). */
  login: z.string().nullable(),
  /** HTTP status of the upstream call; 0 = unreachable. */
  status: z.number().int().nonnegative(),
  error: z.string().nullable(),
})
export type ConnectorTestResultDto = z.infer<typeof connectorTestResultDtoSchema>
