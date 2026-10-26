import { z } from 'zod'

/**
 * Employee memory (B04): redacted notes with an append-only audit
 * journal. Notes carry a content hash used as the optimistic
 * concurrency token — a write that does not present the hash it read
 * fails with 409 and the current text, mirroring upstream file-memory
 * semantics (OpenMausBot's expectedHash, Apache-2.0 — see
 * third_party/sources.lock.json).
 */

export const memoryNoteDtoSchema = z.object({
  id: z.string().min(1),
  employeeId: z.string().min(1),
  text: z.string(),
  /** sha256 of the stored (redacted) text — the concurrency token. */
  contentHash: z.string().length(64),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})

export type MemoryNoteDto = z.infer<typeof memoryNoteDtoSchema>

export const createMemoryNoteRequestSchema = z.object({
  text: z.string().trim().min(1).max(20_000),
})

export type CreateMemoryNoteRequest = z.infer<typeof createMemoryNoteRequestSchema>

export const putMemoryNoteRequestSchema = z.object({
  text: z.string().trim().min(1).max(20_000),
  /** Hash of the version the caller last saw; mismatch = 409 + current. */
  expectedHash: z.string().length(64),
})

export type PutMemoryNoteRequest = z.infer<typeof putMemoryNoteRequestSchema>

export const memoryActorSchema = z.enum(['user', 'employee', 'import', 'system'])
export const memoryChangeKindSchema = z.enum(['created', 'edited', 'deleted'])

export const memoryJournalEntryDtoSchema = z.object({
  id: z.string().min(1),
  employeeId: z.string().min(1),
  noteId: z.string().nullable(),
  actor: memoryActorSchema,
  via: z.string(),
  kind: memoryChangeKindSchema,
  beforeHash: z.string().nullable(),
  afterHash: z.string().nullable(),
  before: z.string().nullable(),
  diff: z.string(),
  added: z.number().int().nonnegative(),
  removed: z.number().int().nonnegative(),
  canRevert: z.boolean(),
  revertUnavailableReason: z.string().nullable(),
  createdAt: z.number().int().nonnegative(),
})

export type MemoryJournalEntryDto = z.infer<typeof memoryJournalEntryDtoSchema>

/** Rendered prompt-context view of one employee's memory (m07 semantics). */
export const memoryBlockDtoSchema = z.object({
  employeeId: z.string().min(1),
  noteCount: z.number().int().nonnegative(),
  includedNotes: z.number().int().nonnegative(),
  truncated: z.boolean(),
  /** null when the employee has no usable notes. */
  block: z.string().nullable(),
})

export type MemoryBlockDto = z.infer<typeof memoryBlockDtoSchema>
