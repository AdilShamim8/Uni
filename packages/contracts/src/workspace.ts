import { z } from 'zod'

/**
 * Workspace export contract (B07) — a complete, honest, plain-JSON
 * snapshot of the workspace's own data: employees (with instructions),
 * their memory notes, routines, and knowledge documents (with extracted
 * text). No cross-workspace data can appear: the export is built from
 * workspace-scoped queries only, and counts are computed from the same
 * rows that are serialized — never claimed independently.
 */

export const exportEmployeeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  instructions: z.string(),
  category: z.string(),
  providerId: z.string().nullable(),
  modelId: z.string().nullable(),
  tools: z.array(z.string()),
  starters: z.array(z.string()),
  archived: z.boolean(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

export const exportMemoryNoteSchema = z.object({
  id: z.string().min(1),
  employeeId: z.string().min(1),
  text: z.string(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

export const exportRoutineSchema = z.object({
  id: z.string().min(1),
  sessionId: z.string().min(1),
  employeeId: z.string().nullable(),
  name: z.string().min(1),
  prompt: z.string(),
  schedule: z.string(),
  catchUpMinutes: z.number().int().nonnegative(),
  paused: z.boolean(),
  archived: z.boolean(),
  lastFireAt: z.number().int().nonnegative().nullable(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

export const exportFileDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  fileName: z.string().min(1),
  extension: z.string(),
  mimeType: z.string(),
  extraction: z.string(),
  extractedText: z.string(),
  charCount: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
})

export const workspaceExportDtoSchema = z.object({
  /** Format identity: exports stay importable if the shape evolves. */
  format: z.literal('uni.workspace.export/1'),
  exportedAt: z.number().int().nonnegative(),
  employees: z.array(exportEmployeeSchema),
  memoryNotes: z.array(exportMemoryNoteSchema),
  routines: z.array(exportRoutineSchema),
  files: z.array(exportFileDocumentSchema),
  /** Counts derived from the arrays above — same rows, no drift. */
  counts: z.object({
    employees: z.number().int().nonnegative(),
    memoryNotes: z.number().int().nonnegative(),
    routines: z.number().int().nonnegative(),
    files: z.number().int().nonnegative(),
  }),
})
export type WorkspaceExportDto = z.infer<typeof workspaceExportDtoSchema>
