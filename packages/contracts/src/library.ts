import { z } from 'zod'

/**
 * Server Library (B04): canonical artifacts with immutable versions.
 * The canonical-save transaction enforces the m07 conflict rules —
 * re-saving unchanged content is a no-op, an update in place links to
 * the same artifact, and a deleted-but-still-linked artifact is
 * recreated explicitly instead of silently duplicating.
 */

export const libraryArtifactKindSchema = z.enum(['report', 'document', 'email', 'data'])

export const libraryProvenanceSchema = z.enum(['provider-generated', 'demo-simulation', 'imported'])

export const libraryGeneratedBySchema = z.object({
  providerLabel: z.string(),
  modelLabel: z.string(),
})

export type LibraryGeneratedBy = z.infer<typeof libraryGeneratedBySchema>

export const libraryArtifactDtoSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  kind: libraryArtifactKindSchema,
  markdown: z.string(),
  provenance: libraryProvenanceSchema,
  generatedBy: libraryGeneratedBySchema.nullable(),
  taskId: z.string().nullable(),
  sourceConversationId: z.string().nullable(),
  sourceMessageId: z.string().nullable(),
  versionCount: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

export type LibraryArtifactDto = z.infer<typeof libraryArtifactDtoSchema>

export const libraryArtifactVersionDtoSchema = z.object({
  version: z.number().int().positive(),
  title: z.string(),
  markdown: z.string(),
  createdAt: z.number().int().nonnegative(),
})

export type LibraryArtifactVersionDto = z.infer<typeof libraryArtifactVersionDtoSchema>

export const createLibraryArtifactRequestSchema = z.object({
  title: z.string().trim().min(1).max(300),
  kind: libraryArtifactKindSchema,
  markdown: z.string().min(1).max(500_000),
  provenance: libraryProvenanceSchema.optional(),
  generatedBy: libraryGeneratedBySchema.nullable().optional(),
  taskId: z.string().trim().min(1).max(200).nullable().optional(),
  sourceConversationId: z.string().trim().min(1).max(200).nullable().optional(),
  sourceMessageId: z.string().trim().min(1).max(200).nullable().optional(),
})

export type CreateLibraryArtifactRequest = z.infer<typeof createLibraryArtifactRequestSchema>

export const patchLibraryArtifactRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    markdown: z.string().min(1).max(500_000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No fields to update.' })

export type PatchLibraryArtifactRequest = z.infer<typeof patchLibraryArtifactRequestSchema>

/**
 * Canonical save result: which artifact holds the content now, whether
 * this call created it, and whether a previously linked artifact had
 * been deleted and was explicitly recreated.
 */
export const canonicalSaveResultSchema = z.object({
  artifactId: z.string().min(1),
  created: z.boolean(),
  recreated: z.boolean(),
  title: z.string(),
  version: z.number().int().positive(),
})

export type CanonicalSaveResult = z.infer<typeof canonicalSaveResultSchema>
