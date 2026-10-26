import { z } from 'zod'
import { pageQuerySchema } from './pagination.js'

/**
 * Conversation persistence contracts (B02). The server owns IDs and the
 * active-branch selection; clients send content and structure only.
 * Timestamps are epoch milliseconds.
 */

export const nodeRoleSchema = z.enum(['user', 'assistant'])

/**
 * Client-creatable statuses. `streaming` is reserved for server-run
 * execution (B03) and is rejected on direct node creation.
 */
export const nodeStatusSchema = z.enum(['complete', 'stopped', 'error'])

export const feedbackSchema = z.enum(['up', 'down'])

/** Attachment/source metadata pass through unchanged (persistence only). */
export const messageNodeDtoSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().nullable(),
  role: nodeRoleSchema,
  status: nodeStatusSchema,
  content: z.string(),
  createdAt: z.number().int().nonnegative(),
  feedback: feedbackSchema.nullable(),
  error: z.string().nullable().optional(),
  statusPrefix: z.string().nullable().optional(),
  tools: z.array(z.string()).nullable().optional(),
  attachments: z.array(z.unknown()).nullable().optional(),
  sources: z.array(z.unknown()).nullable().optional(),
})

export type MessageNodeDto = z.infer<typeof messageNodeDtoSchema>

export const conversationSummaryDtoSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  agentId: z.string().nullable(),
  pinned: z.boolean(),
  archived: z.boolean(),
  activeLeafId: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  messageCount: z.number().int().nonnegative(),
})

export type ConversationSummaryDto = z.infer<typeof conversationSummaryDtoSchema>

export const conversationDetailDtoSchema = conversationSummaryDtoSchema.extend({
  nodes: z.array(messageNodeDtoSchema),
})

export type ConversationDetailDto = z.infer<typeof conversationDetailDtoSchema>

export const conversationListQuerySchema = pageQuerySchema.extend({
  archived: z.enum(['include', 'exclude', 'only']).default('exclude'),
})

export type ConversationListQuery = z.infer<typeof conversationListQuerySchema>

export const createConversationRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  agentId: z.string().min(1).max(200).nullable().optional(),
})

export type CreateConversationRequest = z.infer<typeof createConversationRequestSchema>

export const patchConversationRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
    activeLeafId: z.string().min(1).nullable().optional(),
    /** Optimistic concurrency: reject silent overwrites from stale editors. */
    expectedUpdatedAt: z.number().int().nonnegative().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No fields to update.' })

export type PatchConversationRequest = z.infer<typeof patchConversationRequestSchema>

export const createNodeRequestSchema = z.object({
  parentId: z.string().min(1).nullable().optional(),
  role: nodeRoleSchema,
  content: z.string().min(1).max(200_000),
  status: nodeStatusSchema.optional(),
  feedback: feedbackSchema.nullable().optional(),
  error: z.string().max(2000).optional(),
  statusPrefix: z.string().max(200).optional(),
  tools: z.array(z.string().max(50)).max(20).optional(),
  attachments: z.array(z.unknown()).max(20).optional(),
  sources: z.array(z.unknown()).max(50).optional(),
  /** Client-generated idempotency key: repeated posts reuse the same node. */
  clientId: z.string().min(1).max(200).optional(),
})

export type CreateNodeRequest = z.infer<typeof createNodeRequestSchema>
