import type { FastifyInstance } from 'fastify'
import {
  createMemoryNoteRequestSchema,
  memoryBlockDtoSchema,
  memoryJournalEntryDtoSchema,
  memoryNoteDtoSchema,
  putMemoryNoteRequestSchema,
} from '@uni/contracts'
import { notFound } from '../../lib/errors.js'
import { findEmployeeRow } from '../employees/employees.service.js'
import {
  buildMemoryBlock,
  createNote,
  deleteNote,
  listJournal,
  listNotes,
  putNote,
  revertJournalEntry,
} from './memory.service.js'

/**
 * Employee memory routes. Notes are redacted on write (credential
 * shapes never persist), edits are hash-guarded (409 carries the
 * current text), and every change lands in the append-only journal.
 */
export async function memoryRoutes(app: FastifyInstance): Promise<void> {
  const db = app.database!.db

  app.get<{ Params: { employeeId: string } }>('/employees/:employeeId/memory', async (request) => {
    const items = await listNotes(db, request.workspace!.id, request.params.employeeId)
    for (const note of items) {
      void memoryNoteDtoSchema.parse(note)
    }
    return { items }
  })

  app.post<{ Params: { employeeId: string } }>(
    '/employees/:employeeId/memory',
    async (request, reply) => {
      const body = createMemoryNoteRequestSchema.parse(request.body ?? {})
      const note = await createNote(db, request.workspace!.id, request.params.employeeId, body.text)
      void memoryNoteDtoSchema.parse(note)
      return void reply.status(201).send(note)
    },
  )

  app.put<{ Params: { employeeId: string; noteId: string } }>(
    '/employees/:employeeId/memory/:noteId',
    async (request, reply) => {
      const body = putMemoryNoteRequestSchema.parse(request.body ?? {})
      const note = await putNote(
        db,
        request.workspace!.id,
        request.params.employeeId,
        request.params.noteId,
        body.text,
        body.expectedHash,
      )
      void memoryNoteDtoSchema.parse(note)
      return reply.send(note)
    },
  )

  app.delete<{ Params: { employeeId: string; noteId: string } }>(
    '/employees/:employeeId/memory/:noteId',
    async (request, reply) => {
      await deleteNote(db, request.workspace!.id, request.params.employeeId, request.params.noteId)
      return void reply.status(204).send()
    },
  )

  app.get<{ Params: { employeeId: string } }>(
    '/employees/:employeeId/memory/journal',
    async (request) => {
      const query = (request.query as { limit?: string } | undefined) ?? {}
      const limit = Number.parseInt(query.limit ?? '50', 10)
      const items = await listJournal(
        db,
        request.workspace!.id,
        request.params.employeeId,
        Number.isFinite(limit) ? limit : 50,
      )
      for (const entry of items) {
        void memoryJournalEntryDtoSchema.parse(entry)
      }
      return { items }
    },
  )

  app.post<{ Params: { employeeId: string; entryId: string } }>(
    '/employees/:employeeId/memory/journal/:entryId/revert',
    async (request, reply) => {
      const result = await revertJournalEntry(
        db,
        request.workspace!.id,
        request.params.employeeId,
        request.params.entryId,
      )
      return reply.send({
        note: result.note,
        entry: result.entry,
      })
    },
  )

  app.get<{ Params: { employeeId: string } }>(
    '/employees/:employeeId/memory/block',
    async (request) => {
      // 404 for unknown ids exactly like the notes and journal routes.
      // The check lives here (not in buildMemoryBlock) because run
      // execution relies on that builder degrading dangling agents to
      // the base prompt instead of throwing.
      const employee = await findEmployeeRow(db, request.workspace!.id, request.params.employeeId)
      if (!employee) throw notFound('Employee not found.')
      const block = await buildMemoryBlock(db, request.workspace!.id, request.params.employeeId)
      void memoryBlockDtoSchema.parse(block)
      return block
    },
  )
}
