import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  employeeDtoSchema,
  errorEnvelopeSchema,
  memoryBlockDtoSchema,
  memoryJournalEntryDtoSchema,
  memoryNoteDtoSchema,
} from '@uni/contracts'
import { buildApp } from '../src/app.js'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * B04 slices 1+2 — employees and their memory: workspace-scoped agent
 * profiles; notes redacted on write, hash-guarded edits (409 carries
 * the current text), the append-only journal with honest diffs, revert
 * semantics, and the m07 memory block (entry grammar respected).
 */

describe('employees + memory — profiles, redaction, journal, block', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let bob: { cookie: string }

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Employees' })
    bob = await signUpUser(testApp.app, { name: 'Bob Employees' })
  }, 180_000)

  afterAll(async () => {
    await testApp.stop()
  })

  async function createEmployee(cookie: string, name: string) {
    const response = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/employees',
      headers: { cookie },
      payload: { name, description: 'Research helper', instructions: 'Be terse.' },
    })
    expect(response.statusCode).toBe(201)
    return employeeDtoSchema.parse(response.json())
  }

  async function addNote(cookie: string, employeeId: string, text: string) {
    const response = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/employees/${employeeId}/memory`,
      headers: { cookie },
      payload: { text },
    })
    expect(response.statusCode).toBe(201)
    return memoryNoteDtoSchema.parse(response.json())
  }

  describe('employees — CRUD and scoping', () => {
    it('creates, lists, patches and archives employees', async () => {
      const created = await createEmployee(alice.cookie, 'Scout')
      expect(created.name).toBe('Scout')
      expect(created.category).toBe('personal')
      expect(created.tools).toEqual([])

      const listed = await testApp.app.inject({
        method: 'GET',
        url: '/api/v1/employees',
        headers: { cookie: alice.cookie },
      })
      expect(listed.statusCode).toBe(200)
      const items = (listed.json() as { items: unknown[] }).items
      expect(items.length).toBeGreaterThanOrEqual(1)

      const patched = await testApp.app.inject({
        method: 'PATCH',
        url: `/api/v1/employees/${created.id}`,
        headers: { cookie: alice.cookie },
        payload: { archived: true, category: 'specialist' },
      })
      expect(patched.statusCode).toBe(200)
      const dto = employeeDtoSchema.parse(patched.json())
      expect(dto.archived).toBe(true)
      expect(dto.category).toBe('specialist')

      // Default list hides archived; archived=true includes it.
      const active = await testApp.app.inject({
        method: 'GET',
        url: '/api/v1/employees',
        headers: { cookie: alice.cookie },
      })
      expect(
        ((active.json() as { items: Array<{ id: string }> }).items).some((e) => e.id === created.id),
      ).toBe(false)
      const all = await testApp.app.inject({
        method: 'GET',
        url: '/api/v1/employees?archived=true',
        headers: { cookie: alice.cookie },
      })
      expect(
        ((all.json() as { items: Array<{ id: string }> }).items).some((e) => e.id === created.id),
      ).toBe(true)
    })

    it('never leaks employees across workspaces (404, not 403)', async () => {
      const mine = await createEmployee(alice.cookie, 'Private Alice')
      const foreign = await testApp.app.inject({
        method: 'PATCH',
        url: `/api/v1/employees/${mine.id}`,
        headers: { cookie: bob.cookie },
        payload: { name: 'Hijacked' },
      })
      expect(foreign.statusCode).toBe(404)
      expect(errorEnvelopeSchema.parse(foreign.json())).toBeTruthy()
      const foreignDelete = await testApp.app.inject({
        method: 'DELETE',
        url: `/api/v1/employees/${mine.id}`,
        headers: { cookie: bob.cookie },
      })
      expect(foreignDelete.statusCode).toBe(404)
    })

    it('deletes an employee and cascades their memory', async () => {
      const employee = await createEmployee(alice.cookie, 'Doomed')
      await addNote(alice.cookie, employee.id, 'A note that will cascade')
      const deleted = await testApp.app.inject({
        method: 'DELETE',
        url: `/api/v1/employees/${employee.id}`,
        headers: { cookie: alice.cookie },
      })
      expect(deleted.statusCode).toBe(204)
      const memory = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/employees/${employee.id}/memory`,
        headers: { cookie: alice.cookie },
      })
      expect(memory.statusCode).toBe(404)
    })
  })

  describe('memory — redaction, hash guard, journal, revert', () => {
    it('redacts credential shapes before persistence but keeps the note usable', async () => {
      const employee = await createEmployee(alice.cookie, 'Redact Test')
      const note = await addNote(
        alice.cookie,
        employee.id,
        'Their API key is sk-ant-api03-abcdefghijklmnopqrst — do not lose it. Also likes tea.',
      )
      expect(note.text).not.toContain('sk-ant-api03-abcdefghijklmnopqrst')
      expect(note.text).toContain('«redacted ')
      expect(note.text).toContain('Also likes tea.')
      expect(note.contentHash).toHaveLength(64)
    })

    it('rejects a stale edit with 409 carrying the current text and hash', async () => {
      const employee = await createEmployee(alice.cookie, 'Conflict Test')
      const note = await addNote(alice.cookie, employee.id, 'First version')

      const staleEdit = await testApp.app.inject({
        method: 'PUT',
        url: `/api/v1/employees/${employee.id}/memory/${note.id}`,
        headers: { cookie: alice.cookie },
        payload: { text: 'Stale write', expectedHash: 'a'.repeat(64) },
      })
      expect(staleEdit.statusCode).toBe(409)
      const conflict = staleEdit.json() as {
        details?: { currentHash?: string; currentText?: string }
      }
      expect(conflict.details?.currentText).toBe('First version')
      expect(conflict.details?.currentHash).toBe(note.contentHash)

      // A deliberate overwrite with the CURRENT hash lands.
      const honestEdit = await testApp.app.inject({
        method: 'PUT',
        url: `/api/v1/employees/${employee.id}/memory/${note.id}`,
        headers: { cookie: alice.cookie },
        payload: { text: 'Second version', expectedHash: note.contentHash },
      })
      expect(honestEdit.statusCode).toBe(200)
      const updated = memoryNoteDtoSchema.parse(honestEdit.json())
      expect(updated.text).toBe('Second version')
      expect(updated.contentHash).not.toBe(note.contentHash)
    })

    it('journals created/edited/deleted with honest diffs', async () => {
      const employee = await createEmployee(alice.cookie, 'Journal Test')
      const note = await addNote(alice.cookie, employee.id, 'Journal line one')

      const edit = await testApp.app.inject({
        method: 'PUT',
        url: `/api/v1/employees/${employee.id}/memory/${note.id}`,
        headers: { cookie: alice.cookie },
        payload: { text: 'Journal line one\nJournal line two', expectedHash: note.contentHash },
      })
      expect(edit.statusCode).toBe(200)

      const remove = await testApp.app.inject({
        method: 'DELETE',
        url: `/api/v1/employees/${employee.id}/memory/${note.id}`,
        headers: { cookie: alice.cookie },
      })
      expect(remove.statusCode).toBe(204)

      const journal = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/employees/${employee.id}/memory/journal`,
        headers: { cookie: alice.cookie },
      })
      expect(journal.statusCode).toBe(200)
      const entries = (journal.json() as { items: unknown[] }).items.map((entry) =>
        memoryJournalEntryDtoSchema.parse(entry),
      )
      expect(entries.length).toBe(3)
      // Newest first.
      expect(entries[0]!.kind).toBe('deleted')
      expect(entries[1]!.kind).toBe('edited')
      expect(entries[2]!.kind).toBe('created')
      expect(entries[1]!.diff).toContain('+++ b/memory/')
      expect(entries[1]!.added).toBe(1)
      expect(entries[1]!.canRevert).toBe(true)
      expect(entries[0]!.noteId).toBe(note.id)
    })

    it('reverts an edit by restoring the before-text as a live note', async () => {
      const employee = await createEmployee(alice.cookie, 'Revert Test')
      const note = await addNote(alice.cookie, employee.id, 'Original text')

      await testApp.app.inject({
        method: 'PUT',
        url: `/api/v1/employees/${employee.id}/memory/${note.id}`,
        headers: { cookie: alice.cookie },
        payload: { text: 'Changed my mind', expectedHash: note.contentHash },
      })

      const journal = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/employees/${employee.id}/memory/journal`,
        headers: { cookie: alice.cookie },
      })
      const entries = (journal.json() as { items: Array<{ id: string; kind: string }> }).items
      const editEntry = entries.find((entry) => entry.kind === 'edited')!

      const revert = await testApp.app.inject({
        method: 'POST',
        url: `/api/v1/employees/${employee.id}/memory/journal/${editEntry.id}/revert`,
        headers: { cookie: alice.cookie },
      })
      expect(revert.statusCode).toBe(200)
      const restored = (revert.json() as { note: unknown | null }).note
      expect(restored).not.toBeNull()
      const restoredNote = memoryNoteDtoSchema.parse(restored)
      expect(restoredNote.text).toBe('Original text')
      // The SAME row was restored in place, not duplicated.
      expect(restoredNote.id).toBe(note.id)
      // The revert itself is journaled as an edit via 'revert'.
      const after = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/employees/${employee.id}/memory/journal`,
        headers: { cookie: alice.cookie },
      })
      const afterEntries = (after.json() as { items: Array<{ kind: string; via: string }> }).items
      const revertRow = afterEntries.find((entry) => entry.via === 'revert')
      expect(revertRow?.kind).toBe('edited')
      // And the live memory now holds exactly one note with the old text.
      const memory = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/employees/${employee.id}/memory`,
        headers: { cookie: alice.cookie },
      })
      const notes = (memory.json() as { items: Array<{ text: string }> }).items
      expect(notes).toHaveLength(1)
      expect(notes[0]!.text).toBe('Original text')
    })

    it('scopes memory reads to the owning workspace', async () => {
      const employee = await createEmployee(alice.cookie, 'Scoped Memory')
      await addNote(alice.cookie, employee.id, 'Alice only note')
      const foreign = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/employees/${employee.id}/memory`,
        headers: { cookie: bob.cookie },
      })
      expect(foreign.statusCode).toBe(404)
    })
  })

  describe('memory block — m07 semantics + entry grammar', () => {
    it('renders newest-first notes bounded by count and chars, hiding expired and superseded entries', async () => {
      const employee = await createEmployee(alice.cookie, 'Block Test')
      await addNote(
        alice.cookie,
        employee.id,
        '- 2026-01-01 · Away until Friday · until 2026-01-02\n- 2026-01-01 · Permanent preference for morning meetings',
      )
      await addNote(
        alice.cookie,
        employee.id,
        '- 2026-02-01 · ~~Likes oat milk~~ · superseded 2026-02-02\n- 2026-02-02 · Takes coffee black',
      )
      await addNote(alice.cookie, employee.id, '- 2026-03-01 · Newest note wins')

      const blockResponse = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/employees/${employee.id}/memory/block`,
        headers: { cookie: alice.cookie },
      })
      expect(blockResponse.statusCode).toBe(200)
      const block = memoryBlockDtoSchema.parse(blockResponse.json())
      expect(block.block).not.toBeNull()
      const text = block.block!
      // Newest first: the March note is the first bullet.
      expect(text.indexOf('Newest note wins')).toBeLessThan(text.indexOf('Permanent preference'))
      // Expired entry hidden, its sibling kept.
      expect(text).not.toContain('Away until Friday')
      expect(text).toContain('Permanent preference for morning meetings')
      // Superseded entry hidden, its replacement kept.
      expect(text).not.toContain('Likes oat milk')
      expect(text).toContain('Takes coffee black')
      expect(text).toContain('Known facts and preferences')
      expect(block.noteCount).toBe(3)
      expect(block.includedNotes).toBe(3)
      expect(block.truncated).toBe(false)
    })

    it('returns a null block for an employee with no notes', async () => {
      const employee = await createEmployee(alice.cookie, 'Empty Block')
      const blockResponse = await testApp.app.inject({
        method: 'GET',
        url: `/api/v1/employees/${employee.id}/memory/block`,
        headers: { cookie: alice.cookie },
      })
      expect(blockResponse.statusCode).toBe(200)
      const block = memoryBlockDtoSchema.parse(blockResponse.json())
      expect(block.block).toBeNull()
      expect(block.noteCount).toBe(0)
    })
  })

  it('keeps a buildApp import surface for the module (no accidental global state)', async () => {
    // buildApp is exercised by every request above; this assertion keeps
    // the import honest if the suite is split later.
    expect(typeof buildApp).toBe('function')
  })
})
