import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerMemoryJournalEntry } from '@/services/api/serverEmployees'

/**
 * RF-065 — the server memory journal store slice: loads per employee,
 * reverts through the service, and refreshes both the notes and the
 * journal (a revert appends its own entry and changes note content).
 */

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const ENTRY: ServerMemoryJournalEntry = {
  id: 'j-1',
  employeeId: 'emp-1',
  noteId: 'note-1',
  actor: 'user',
  via: 'memory panel',
  kind: 'edited',
  beforeHash: null,
  afterHash: 'abc',
  before: 'old text',
  diff: '+ new text',
  added: 9,
  removed: 9,
  canRevert: true,
  revertUnavailableReason: null,
  createdAt: 123,
}

describe('server memory journal store (RF-065)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    useServerSessionStore.setState({
      status: 'signed-in',
      sessionGeneration: 1,
      serverMemoryJournal: {},
      serverMemoryJournalLoading: false,
      serverMemoryJournalError: null,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads the journal into the per-employee slice', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [ENTRY] }))
    await useServerSessionStore.getState().loadServerMemoryJournal('emp-1')
    expect(useServerSessionStore.getState().serverMemoryJournal['emp-1']).toEqual([ENTRY])
    expect(useServerSessionStore.getState().serverMemoryJournalLoading).toBe(false)
  })

  it('records the honest error when the journal load fails', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { message: 'boom' }))
    await useServerSessionStore.getState().loadServerMemoryJournal('emp-1')
    expect(useServerSessionStore.getState().serverMemoryJournalError).toBeTruthy()
    expect(useServerSessionStore.getState().serverMemoryJournal['emp-1']).toBeUndefined()
  })

  it('reverts and refreshes both the notes and the journal', async () => {
    // POST revert, then GET notes, then GET journal.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { note: { id: 'note-1', text: 'old text' }, entry: ENTRY }),
    )
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { items: [{ id: 'note-1', text: 'old text' }] }),
    )
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [ENTRY] }))

    const ok = await useServerSessionStore
      .getState()
      .revertServerMemoryJournalEntryFor('emp-1', 'j-1')

    expect(ok).toBe(true)
    const calls = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(calls[0]).toContain('/employees/emp-1/memory/journal/j-1/revert')
    expect(calls[1]).toContain('/employees/emp-1/memory')
    expect(calls[2]).toContain('/employees/emp-1/memory/journal')
    expect(useServerSessionStore.getState().serverMemoryJournal['emp-1']).toEqual([ENTRY])
  })

  it('records the honest error when a revert is rejected', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(409, { message: 'Entry is no longer revertible.' }))
    const ok = await useServerSessionStore
      .getState()
      .revertServerMemoryJournalEntryFor('emp-1', 'j-1')
    expect(ok).toBe(false)
    expect(useServerSessionStore.getState().serverMemoryJournalError).toBeTruthy()
  })
})
