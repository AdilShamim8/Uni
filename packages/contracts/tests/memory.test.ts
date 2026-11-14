import { describe, expect, it } from 'vitest'
import {
  createMemoryNoteRequestSchema,
  memoryActorSchema,
  memoryBlockDtoSchema,
  memoryChangeKindSchema,
  memoryJournalEntryDtoSchema,
  memoryNoteDtoSchema,
  putMemoryNoteRequestSchema,
} from '../src/index.js'

/**
 * Employee memory: redacted notes with a 64-char content hash as the
 * optimistic concurrency token, and an append-only audit journal.
 */
describe('memory note DTO', () => {
  it('the content hash is exactly 64 characters', () => {
    const note = {
      id: 'note_1',
      employeeId: 'emp_1',
      text: 'Prefers bullet points.',
      contentHash: 'a'.repeat(64),
      createdAt: 1,
      updatedAt: 1,
    }
    expect(memoryNoteDtoSchema.parse(note)).toEqual(note)
    expect(
      memoryNoteDtoSchema.safeParse({ ...note, contentHash: 'a'.repeat(63) }).success,
    ).toBe(false)
  })
})

describe('memory write requests', () => {
  it('a new note needs non-empty bounded text', () => {
    expect(createMemoryNoteRequestSchema.safeParse({ text: 'Loves tables.' }).success).toBe(true)
    expect(createMemoryNoteRequestSchema.safeParse({ text: '' }).success).toBe(false)
    expect(
      createMemoryNoteRequestSchema.safeParse({ text: 'a'.repeat(20_001) }).success,
    ).toBe(false)
  })

  it('an edit must present the hash it read — the concurrency token', () => {
    expect(
      putMemoryNoteRequestSchema.safeParse({ text: 'Updated.', expectedHash: 'b'.repeat(64) })
        .success,
    ).toBe(true)
    expect(putMemoryNoteRequestSchema.safeParse({ text: 'Updated.', expectedHash: 'short' }).success).toBe(
      false,
    )
  })
})

describe('memory journal', () => {
  it('actors and change kinds keep their vocabularies', () => {
    expect(memoryActorSchema.safeParse('user').success).toBe(true)
    expect(memoryActorSchema.safeParse('employee').success).toBe(true)
    expect(memoryActorSchema.safeParse('import').success).toBe(true)
    expect(memoryActorSchema.safeParse('system').success).toBe(true)
    expect(memoryActorSchema.safeParse('anonymous').success).toBe(false)
    expect(memoryChangeKindSchema.safeParse('created').success).toBe(true)
    expect(memoryChangeKindSchema.safeParse('edited').success).toBe(true)
    expect(memoryChangeKindSchema.safeParse('deleted').success).toBe(true)
    expect(memoryChangeKindSchema.safeParse('merged').success).toBe(false)
  })

  it('a journal entry records the honest diff and revertability', () => {
    const entry = {
      id: 'j_1',
      employeeId: 'emp_1',
      noteId: 'note_1',
      actor: 'user',
      via: 'api',
      kind: 'edited',
      beforeHash: 'a'.repeat(64),
      afterHash: 'b'.repeat(64),
      before: 'old text',
      diff: '-old +new',
      added: 1,
      removed: 1,
      canRevert: true,
      revertUnavailableReason: null,
      createdAt: 1,
    }
    expect(memoryJournalEntryDtoSchema.parse(entry)).toEqual(entry)
  })
})

describe('memory block (prompt-context view)', () => {
  it('reports counts, truncation, and a nullable block', () => {
    const block = {
      employeeId: 'emp_1',
      noteCount: 3,
      includedNotes: 2,
      truncated: true,
      block: '…',
    }
    expect(memoryBlockDtoSchema.parse(block)).toEqual(block)
    expect(memoryBlockDtoSchema.safeParse({ ...block, block: null }).success).toBe(true)
  })
})
