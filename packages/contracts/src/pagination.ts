import { z } from 'zod'

/**
 * Cursor pagination primitives used by every list endpoint.
 * Cursors are opaque strings; limits are bounded server-side.
 */
export const pageQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export type PageQuery = z.infer<typeof pageQuerySchema>

export const pageSchema = z.object({
  items: z.array(z.unknown()),
  nextCursor: z.string().nullable(),
})

export type Page<T> = {
  items: T[]
  nextCursor: string | null
}
