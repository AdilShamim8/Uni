import { createHash, randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { memoryJournal, memoryNotes } from '../../db/schema.js'
import { badRequest, conflict, notFound } from '../../lib/errors.js'
import { findEmployeeRow } from '../employees/employees.service.js'
import {
  recallTerms,
  renderRecall,
  type RecallPassage,
} from '../../vendor/openmausbot/recall.js'
import { redactSecretsInText } from '../../vendor/openmausbot/redact.js'
import { unifiedDiff } from '../../vendor/openmausbot/unified-diff.js'
import { withoutExpired, withoutSuperseded } from '../../vendor/openmausbot/memory-entries.js'
import type {
  MemoryBlockDto,
  MemoryJournalEntryDto,
  MemoryNoteDto,
} from '@uni/contracts'

export type MemoryDatabase = NodePgDatabase<typeof schema>

type MemoryNoteRow = typeof memoryNotes.$inferSelect
type MemoryJournalRow = typeof memoryJournal.$inferSelect

/* ------------------------------------------------------------------ */
/* Bounds (documented in the API surface)                              */
/* ------------------------------------------------------------------ */

/** Hard cap on stored notes per employee — one note beyond rejects 413. */
export const MAX_NOTES_PER_EMPLOYEE = 500
/** m07 parity with the frontend Memory panel: block bounds. */
export const AGENT_MEMORY_MAX_NOTES = 20
export const AGENT_MEMORY_MAX_CHARS = 4_000
/** Snapshot cap for journal `before` (defense in depth; zod caps at 20k). */
const BEFORE_CAP = 512 * 1024

function toMillis(value: Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

/** sha256 of the stored text — the optimistic concurrency token. */
export function hashMemoryText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export function serializeNote(row: MemoryNoteRow): MemoryNoteDto {
  return {
    id: row.id,
    employeeId: row.employeeId,
    text: row.text,
    contentHash: row.contentHash,
    createdAt: toMillis(row.createdAt),
    updatedAt: toMillis(row.updatedAt),
  }
}

export function serializeJournalEntry(row: MemoryJournalRow): MemoryJournalEntryDto {
  return {
    id: row.id,
    employeeId: row.employeeId,
    noteId: row.noteId,
    actor: row.actor as MemoryJournalEntryDto['actor'],
    via: row.via,
    kind: row.kind as MemoryJournalEntryDto['kind'],
    beforeHash: row.beforeHash,
    afterHash: row.afterHash,
    before: row.before,
    diff: row.diff,
    added: row.added,
    removed: row.removed,
    canRevert: row.canRevert,
    revertUnavailableReason: row.revertUnavailableReason,
    createdAt: toMillis(row.createdAt),
  }
}

/* ------------------------------------------------------------------ */
/* Journal — append-only, best-effort                                  */
/* ------------------------------------------------------------------ */

export interface MemoryChangeInput {
  noteId: string
  actor: MemoryJournalEntryDto['actor']
  via: string
  before: string | null
  after: string | null
}

/**
 * Record one memory change in the audit journal. Best-effort by design:
 * an audit failure must never fail the change it records (upstream
 * journal semantics) — it is logged and swallowed.
 */
async function recordMemoryChange(
  db: MemoryDatabase,
  workspaceId: string,
  employeeId: string,
  change: MemoryChangeInput,
): Promise<MemoryJournalEntryDto | null> {
  const { before, after } = change
  if (before === after) return null
  const kind = before === null ? 'created' : after === null ? 'deleted' : 'edited'
  const diff = unifiedDiff(before ?? '', after ?? '', `memory/${change.noteId}.md`)
  let keptBefore: string | null = null
  let canRevert = true
  let revertUnavailableReason: string | undefined
  if (before !== null) {
    if (Buffer.byteLength(before, 'utf8') > BEFORE_CAP) {
      canRevert = false
      revertUnavailableReason = 'The earlier version was too large to keep, so this change cannot be reverted.'
    } else {
      keptBefore = before
    }
  }
  try {
    const inserted = await db
      .insert(memoryJournal)
      .values({
        id: randomUUID(),
        workspaceId,
        employeeId,
        noteId: change.noteId,
        actor: change.actor,
        via: change.via,
        kind,
        beforeHash: before === null ? null : hashMemoryText(before),
        afterHash: after === null ? null : hashMemoryText(after),
        before: keptBefore,
        diff: diff.text,
        added: diff.added,
        removed: diff.removed,
        canRevert,
        revertUnavailableReason: revertUnavailableReason ?? null,
      })
      .returning()
    const row = inserted[0]
    return row ? serializeJournalEntry(row) : null
  } catch (error) {
    // Best-effort by design (upstream journal semantics): the audit row is
    // logged and dropped, never surfaced to the change that was recorded.
    console.error(
      'memory journal: could not record change:',
      error instanceof Error ? error.message : error,
    )
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Notes CRUD with hash-guarded writes                                */
/* ------------------------------------------------------------------ */

async function assertEmployee(
  db: MemoryDatabase,
  workspaceId: string,
  employeeId: string,
): Promise<void> {
  const row = await findEmployeeRow(db, workspaceId, employeeId)
  if (!row) throw notFound('Employee not found.')
}

export async function listNotes(
  db: MemoryDatabase,
  workspaceId: string,
  employeeId: string,
): Promise<MemoryNoteDto[]> {
  await assertEmployee(db, workspaceId, employeeId)
  const rows = await db
    .select()
    .from(memoryNotes)
    .where(eq(memoryNotes.employeeId, employeeId))
    .orderBy(desc(memoryNotes.updatedAt))
  return rows.map(serializeNote)
}

export async function createNote(
  db: MemoryDatabase,
  workspaceId: string,
  employeeId: string,
  text: string,
  opts: { actor: MemoryJournalEntryDto['actor']; via: string } = { actor: 'user', via: 'api' },
): Promise<MemoryNoteDto> {
  await assertEmployee(db, workspaceId, employeeId)
  const existing = await db
    .select({ id: memoryNotes.id })
    .from(memoryNotes)
    .where(eq(memoryNotes.employeeId, employeeId))
  if (existing.length >= MAX_NOTES_PER_EMPLOYEE) {
    throw badRequest(
      `This employee already holds the maximum of ${MAX_NOTES_PER_EMPLOYEE} memory notes — remove or merge some first.`,
    )
  }
  const redacted = redactSecretsInText(text)
  const id = randomUUID()
  const inserted = await db
    .insert(memoryNotes)
    .values({
      id,
      workspaceId,
      employeeId,
      text: redacted,
      contentHash: hashMemoryText(redacted),
    })
    .returning()
  const row = inserted[0]
  if (!row) throw new Error('Memory note insert returned no row')
  await recordMemoryChange(db, workspaceId, employeeId, {
    noteId: id,
    actor: opts.actor,
    via: opts.via,
    before: null,
    after: redacted,
  })
  return serializeNote(row)
}

/**
 * Hash-guarded edit: the UPDATE only lands when the stored hash still
 * equals `expectedHash`; otherwise 409 carrying the current text and
 * hash so the caller can re-apply deliberately — never silently.
 */
export async function putNote(
  db: MemoryDatabase,
  workspaceId: string,
  employeeId: string,
  noteId: string,
  text: string,
  expectedHash: string,
  opts: { actor: MemoryJournalEntryDto['actor']; via: string } = { actor: 'user', via: 'api' },
): Promise<MemoryNoteDto> {
  await assertEmployee(db, workspaceId, employeeId)
  const current = await db
    .select()
    .from(memoryNotes)
    .where(and(eq(memoryNotes.id, noteId), eq(memoryNotes.workspaceId, workspaceId)))
    .limit(1)
  const currentRow = current[0]
  if (!currentRow || currentRow.employeeId !== employeeId) {
    throw notFound('Memory note not found.')
  }
  const redacted = redactSecretsInText(text)
  const updated = await db
    .update(memoryNotes)
    .set({
      text: redacted,
      contentHash: hashMemoryText(redacted),
      updatedAt: new Date(),
    })
    .where(and(eq(memoryNotes.id, noteId), eq(memoryNotes.contentHash, expectedHash)))
    .returning()
  const row = updated[0]
  if (!row) {
    throw conflict('This note changed since you opened it — reload to see the new version, or edit again to overwrite it.', {
      currentHash: currentRow.contentHash,
      currentText: currentRow.text,
    })
  }
  await recordMemoryChange(db, workspaceId, employeeId, {
    noteId,
    actor: opts.actor,
    via: opts.via,
    before: currentRow.text,
    after: redacted,
  })
  return serializeNote(row)
}

export async function deleteNote(
  db: MemoryDatabase,
  workspaceId: string,
  employeeId: string,
  noteId: string,
  opts: { actor: MemoryJournalEntryDto['actor']; via: string } = { actor: 'user', via: 'api' },
): Promise<void> {
  await assertEmployee(db, workspaceId, employeeId)
  const deleted = await db
    .delete(memoryNotes)
    .where(and(eq(memoryNotes.id, noteId), eq(memoryNotes.workspaceId, workspaceId)))
    .returning()
  const row = deleted[0]
  if (!row || row.employeeId !== employeeId) {
    throw notFound('Memory note not found.')
  }
  await recordMemoryChange(db, workspaceId, employeeId, {
    noteId,
    actor: opts.actor,
    via: opts.via,
    before: row.text,
    after: null,
  })
}

/* ------------------------------------------------------------------ */
/* Journal reads + revert                                              */
/* ------------------------------------------------------------------ */

export async function listJournal(
  db: MemoryDatabase,
  workspaceId: string,
  employeeId: string,
  limit: number,
): Promise<MemoryJournalEntryDto[]> {
  await assertEmployee(db, workspaceId, employeeId)
  const rows = await db
    .select()
    .from(memoryJournal)
    .where(
      and(eq(memoryJournal.workspaceId, workspaceId), eq(memoryJournal.employeeId, employeeId)),
    )
    .orderBy(desc(memoryJournal.createdAt))
    .limit(Math.min(Math.max(1, limit), 200))
  return rows.map(serializeJournalEntry)
}

/**
 * Revert one journal entry (upstream revertMemoryChange semantics):
 * created → the note is deleted; edited → the stored before-text is
 * written back; deleted → a fresh note is created with the before-text
 * (new id — the journal records the recreation honestly). Reverting a
 * revert produces a new journal row, never a rewritten one.
 */
export async function revertJournalEntry(
  db: MemoryDatabase,
  workspaceId: string,
  employeeId: string,
  entryId: string,
): Promise<{ note: MemoryNoteDto | null; entry: MemoryJournalEntryDto | null }> {
  const rows = await db
    .select()
    .from(memoryJournal)
    .where(
      and(
        eq(memoryJournal.id, entryId),
        eq(memoryJournal.workspaceId, workspaceId),
        eq(memoryJournal.employeeId, employeeId),
      ),
    )
    .limit(1)
  const entry = rows[0]
  if (!entry) throw notFound('No such memory change.')
  if (!entry.canRevert) {
    throw badRequest(entry.revertUnavailableReason ?? 'This change cannot be reverted.')
  }
  if (entry.kind === 'created') {
    if (entry.noteId === null) throw badRequest('This change cannot be reverted.')
    await db
      .delete(memoryNotes)
      .where(and(eq(memoryNotes.id, entry.noteId), eq(memoryNotes.workspaceId, workspaceId)))
    const journalEntry = await recordMemoryChange(db, workspaceId, employeeId, {
      noteId: entry.noteId,
      actor: 'user',
      via: 'revert',
      before: entry.before,
      after: null,
    })
    return { note: null, entry: journalEntry }
  }
  if (entry.kind === 'edited') {
    if (entry.noteId === null) throw badRequest('This change cannot be reverted.')
    // The note row still exists (edits do not delete rows): write the
    // before-text back to the SAME row, exactly as upstream reverts a
    // file by path. A deliberate overwrite, not a hash-guarded merge.
    const current = await db
      .select()
      .from(memoryNotes)
      .where(and(eq(memoryNotes.id, entry.noteId), eq(memoryNotes.workspaceId, workspaceId)))
      .limit(1)
    const currentRow = current[0]
    if (currentRow && currentRow.employeeId === employeeId) {
      const beforeText = entry.before ?? ''
      const updated = await db
        .update(memoryNotes)
        .set({
          text: beforeText,
          contentHash: hashMemoryText(beforeText),
          updatedAt: new Date(),
        })
        .where(and(eq(memoryNotes.id, entry.noteId), eq(memoryNotes.workspaceId, workspaceId)))
        .returning()
      const row = updated[0]
      const journalEntry = await recordMemoryChange(db, workspaceId, employeeId, {
        noteId: entry.noteId,
        actor: 'user',
        via: 'revert',
        before: currentRow.text,
        after: beforeText,
      })
      return { note: row ? serializeNote(row) : null, entry: journalEntry }
    }
  }
  // deleted (or edited-then-deleted): the row is gone — restore the
  // before-text as a fresh note; the journal records the recreation.
  const note = await createNote(db, workspaceId, employeeId, entry.before ?? '', {
    actor: 'user',
    via: 'revert',
  })
  return { note, entry: null }
}

/* ------------------------------------------------------------------ */
/* Prompt context: the memory block (m07 semantics) + recall           */
/* ------------------------------------------------------------------ */

/** Today as a `YYYY-MM-DD` calendar date for the entry grammar. */
function todayUTC(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * The memory block for one employee — the server-side port of the
 * frontend's buildAgentMemoryBlock (m07): scoped to this employee's own
 * notes, newest first, bounded by note count and total characters,
 * matching what the Memory panel tells the user. Enriched with the
 * vendored entry grammar: expired and superseded entries inside a note
 * are hidden from the prompt but preserved in storage.
 */
export async function buildMemoryBlock(
  db: MemoryDatabase,
  workspaceId: string,
  employeeId: string,
): Promise<MemoryBlockDto> {
  const rows = await db
    .select()
    .from(memoryNotes)
    .where(and(eq(memoryNotes.workspaceId, workspaceId), eq(memoryNotes.employeeId, employeeId)))
    .orderBy(desc(memoryNotes.updatedAt))
  const today = todayUTC()
  const lines: string[] = []
  let total = 0
  let count = 0
  let truncated = false
  for (const row of rows) {
    const visible = withoutSuperseded(withoutExpired(row.text, today).text).trim()
    if (!visible) continue
    if (count >= AGENT_MEMORY_MAX_NOTES || total + visible.length > AGENT_MEMORY_MAX_CHARS) {
      truncated = true
      break
    }
    lines.push(`- ${visible}`)
    total += visible.length
    count += 1
  }
  if (lines.length === 0) {
    return {
      employeeId,
      noteCount: rows.length,
      includedNotes: 0,
      truncated: false,
      block: null,
    }
  }
  const scope = `Known facts and preferences the user asked this employee to remember (up to ${AGENT_MEMORY_MAX_NOTES} notes, ~${AGENT_MEMORY_MAX_CHARS} characters; oldest beyond the limit are dropped${truncated ? ' — some notes were left out this time' : ''}):`
  return {
    employeeId,
    noteCount: rows.length,
    includedNotes: count,
    truncated,
    block: `${scope}\n${lines.join('\n')}`,
  }
}

const RECALL_NOTE_HITS = 4
const PASSAGE_CHARS = 600

/** Strip the [term] markers after the match-count gate has run. */
const plain = (snippet: string) => snippet.replace(/\[([^[\]]+)\]/g, '$1')

function markTerms(text: string, terms: readonly string[]): string {
  let out = text
  for (const term of terms) {
    out = out.replace(new RegExp(`\\b(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '[$1]')
  }
  return out
}

function enoughMatches(query: string, snippet: string): boolean {
  const terms = recallTerms(query)
  if (terms.length < 5) return true
  return new Set([...snippet.matchAll(/\[([^[\]]+)\]/g)].map((m) => m[1]!.toLowerCase())).size >= 2
}

/**
 * Recall passages for one employee and a message — the upstream design:
 * passages ride in front of the turn's message (never the system
 * prompt), matched by shared words, gated to at least two distinct
 * matched terms for long queries, fence markers neutralised by the
 * vendored renderer.
 */
export async function buildRecall(
  db: MemoryDatabase,
  workspaceId: string,
  employeeId: string,
  message: string,
): Promise<string | null> {
  const trimmed = message.trim().slice(0, 500)
  if (trimmed.length < 8) return null
  const terms = recallTerms(trimmed)
  if (!terms.length) return null
  const rows = await db
    .select()
    .from(memoryNotes)
    .where(and(eq(memoryNotes.workspaceId, workspaceId), eq(memoryNotes.employeeId, employeeId)))
    .orderBy(desc(memoryNotes.updatedAt))
    .limit(50)
  const today = todayUTC()
  const passages: RecallPassage[] = []
  for (const row of rows) {
    if (passages.length >= RECALL_NOTE_HITS) break
    const visible = withoutSuperseded(withoutExpired(row.text, today).text).trim()
    if (!visible) continue
    const marked = markTerms(visible, terms)
    if (!/\[[^[\]]+\]/.test(marked)) continue
    if (!enoughMatches(trimmed, marked)) continue
    const snippet = plain(marked)
    passages.push({
      source: 'memory',
      label: `memory note (updated ${new Date(toMillis(row.updatedAt)).toISOString().slice(0, 10)})`,
      at: toMillis(row.updatedAt),
      snippet: snippet.length > PASSAGE_CHARS ? `${snippet.slice(0, PASSAGE_CHARS)}…` : snippet,
    })
  }
  const rendered = renderRecall(passages)
  return rendered?.text ?? null
}
