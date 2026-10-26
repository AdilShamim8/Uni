import { z } from 'zod'

/**
 * Server-side employees (agent profiles) (B04). The server derives
 * identity and workspace scoping; clients send profile content only.
 * Timestamps are epoch milliseconds.
 */

export const employeeCategorySchema = z.enum(['personal', 'specialist'])

export const employeeDtoSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string(),
  instructions: z.string(),
  category: employeeCategorySchema,
  /** Pinned provider/model preference — soft: resolved at send time. */
  providerId: z.string().nullable(),
  modelId: z.string().nullable(),
  tools: z.array(z.string()),
  starters: z.array(z.string()),
  archived: z.boolean(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

export type EmployeeDto = z.infer<typeof employeeDtoSchema>

export const createEmployeeRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2_000).optional(),
  instructions: z.string().trim().max(20_000).optional(),
  category: employeeCategorySchema.optional(),
  providerId: z.string().trim().min(1).max(200).nullable().optional(),
  modelId: z.string().trim().min(1).max(200).nullable().optional(),
  tools: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  starters: z.array(z.string().trim().min(1).max(300)).max(12).optional(),
})

export type CreateEmployeeRequest = z.infer<typeof createEmployeeRequestSchema>

export const patchEmployeeRequestSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(2_000).optional(),
    instructions: z.string().trim().max(20_000).optional(),
    category: employeeCategorySchema.optional(),
    providerId: z.string().trim().min(1).max(200).nullable().optional(),
    modelId: z.string().trim().min(1).max(200).nullable().optional(),
    tools: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
    starters: z.array(z.string().trim().min(1).max(300)).max(12).optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No fields to update.' })

export type PatchEmployeeRequest = z.infer<typeof patchEmployeeRequestSchema>
