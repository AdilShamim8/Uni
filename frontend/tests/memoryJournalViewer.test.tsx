import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryJournalViewer } from '@/features/agents/MemoryJournalViewer'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerMemoryJournalEntry } from '@/services/api/serverEmployees'

/**
 * RF-066 — the journal viewer: collapsed by default, loads through the
 * store when opened, and renders each entry honestly (kind, actor,
 * diff, counts, revertibility).
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

const NON_REVERTIBLE: ServerMemoryJournalEntry = {
  ...ENTRY,
  id: 'j-2',
  kind: 'created',
  canRevert: false,
  revertUnavailableReason: 'history before this entry',
}

describe('MemoryJournalViewer (RF-066)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    cleanup()
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

  it('stays collapsed until opened, then loads through the store', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [ENTRY] }))
    render(<MemoryJournalViewer employeeId="emp-1" />)

    // Collapsed: nothing loaded yet, nothing rendered.
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByLabelText('Journal entries')).toBeNull()

    await user.click(screen.getByRole('button', { name: /Show change history/i }))
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/employees/emp-1/memory/journal'),
      expect.anything(),
    )
    const list = await screen.findByLabelText('Journal entries')
    expect(within(list).getByText('edited')).toBeInTheDocument()
    expect(within(list).getByText(/by user · memory panel/)).toBeInTheDocument()
    expect(within(list).getByText('+ new text')).toBeInTheDocument()
    expect(within(list).getByText('+9 −9 characters')).toBeInTheDocument()
  })

  it('shows revertibility honestly per entry', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { items: [ENTRY, NON_REVERTIBLE] }),
    )
    render(<MemoryJournalViewer employeeId="emp-1" />)

    await user.click(screen.getByRole('button', { name: /Show change history/i }))
    const list = await screen.findByLabelText('Journal entries')
    const items = within(list).getAllByRole('listitem')
    expect(within(items[0]!).getByText('revertible')).toBeInTheDocument()
    expect(within(items[1]!).getByText('history before this entry')).toBeInTheDocument()
  })

  it('shows the honest empty state and the honest error', async () => {
    const user = userEvent.setup()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [] }))
    render(<MemoryJournalViewer employeeId="emp-1" />)

    await user.click(screen.getByRole('button', { name: /Show change history/i }))
    expect(
      await screen.findByText(/No changes recorded yet/i),
    ).toBeInTheDocument()

    // A failing reload surfaces the error inline.
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { message: 'boom' }))
    await user.click(screen.getByRole('button', { name: /Hide change history/i }))
    await user.click(screen.getByRole('button', { name: /Show change history/i }))
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
  })
})
