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
   * Connection status — always 'unavailable' in Uni today: no remote
   * gateway is integrated. The field exists so the API shape is stable
   * when a real integration lands.
   */
  status: z.literal('unavailable'),
})
export type ConnectorDto = z.infer<typeof connectorDtoSchema>
