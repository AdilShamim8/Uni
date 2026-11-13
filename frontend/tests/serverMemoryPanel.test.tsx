import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryPanel } from '@/features/agents/EmployeeView'
import { useAgentsStore } from '@/state/agentsStore'
import { useServerSessionStore } from '@/state/serverSessionStore'

/**
 * T016 — the memory panel is dual-mode: local notes through the agents
 * store in local mode; server notes through the memory service (loaded
 * by linked employee id, added and removed through it) in server mode.
 * The linked employee is the same identity ensureServerEmployee binds.
 */

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const AGENT_ID = 'agent-test'

describe('MemoryPanel dual-mode (T016)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    useAgentsStore.setState({
      hydrated: true,
      agents: {
        [AGENT_ID]: {
          id: AGENT_ID,
          name: 'Researcher',
          description: '',
          instructions: '',
          category: 'specialist',
          providerId: null,
          modelId: null,
          tools: [],
          projectIds: [],
          starters: [],
          archived: false,
          builtin: false,
          serverEmployeeId: 'emp-1',
          createdAt: 1,
          updatedAt: 1,
        },
      },
      memoryNotes: {},
      schedules: {},
      threadEvents: {},
      recoveredFromQuarantine: false,
    })
  })
  afterEach(() => {
    cleanup()
    useServerSessionStore.getState().resetForTests()
  })

  it('local mode lists and adds local notes (unchanged behavior)', async () => {
    useServerSessionStore.setState({ status: 'signed-out', account: null })
    render(<MemoryPanel agentId={AGENT_ID} />)

    await userEvent.type(screen.getByLabelText('New memory note'), 'Prefers tables')
    await userEvent.click(screen.getByRole('button', { name: /Add/ }))

    const state = useAgentsStore.getState()
    const mine = Object.values(state.memoryNotes).filter((note) => note.agentId === AGENT_ID)
    expect(mine).toHaveLength(1)
    expect(mine[0]!.text).toBe('Prefers tables')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('server mode loads the linked employee’s notes from the service', async () => {
    useServerSessionStore.setState({ status: 'signed-in', account: null })
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        items: [{ id: 'n-1', text: 'Works in GMT+1', createdAt: 1 }],
      }),
    )
    render(<MemoryPanel agentId={AGENT_ID} />)

    await screen.findByText('Works in GMT+1')
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/employees/emp-1/memory')
  })

  it('server mode adds a note through the service, not the local store', async () => {
    useServerSessionStore.setState({ status: 'signed-in', account: null })
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [] }))
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, { id: 'n-2', text: 'Prefers brevity', createdAt: 2 }),
    )
    render(<MemoryPanel agentId={AGENT_ID} />)
    await screen.findByText(/No notes yet/)

    await userEvent.type(screen.getByLabelText('New memory note'), 'Prefers brevity')
    await userEvent.click(screen.getByRole('button', { name: /Add/ }))

    await screen.findByText('Prefers brevity')
    const addCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST')
    expect(addCall).toBeDefined()
    expect(String(addCall![0])).toContain('/employees/emp-1/memory')
    // Local store untouched.
    expect(Object.keys(useAgentsStore.getState().memoryNotes)).toHaveLength(0)
  })

  it('server mode edits a note through the hash-guarded PUT (RF-082)', async () => {
    useServerSessionStore.setState({ status: 'signed-in', account: null })
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        items: [
          { id: 'n-1', text: 'Works in GMT+1', contentHash: 'a'.repeat(64), createdAt: 1 },
        ],
      }),
    )
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        id: 'n-1',
        text: 'Works in GMT+2',
        contentHash: 'b'.repeat(64),
        createdAt: 1,
      }),
    )
    render(<MemoryPanel agentId={AGENT_ID} />)
    await screen.findByText('Works in GMT+1')

    await userEvent.click(screen.getByRole('button', { name: /Edit server note n-1/i }))
    const input = screen.getByLabelText('Edit server memory note') as HTMLInputElement
    expect(input.value).toBe('Works in GMT+1')
    await userEvent.clear(input)
    await userEvent.type(input, 'Works in GMT+2')
    await userEvent.click(screen.getByRole('button', { name: /Save server note n-1/i }))

    await screen.findByText('Works in GMT+2')
    // The PUT presented the hash the caller had read.
    const putCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'PUT')
    expect(putCall).toBeDefined()
    expect(String(putCall![0])).toContain('/employees/emp-1/memory/n-1')
    expect(JSON.parse(putCall![1]!.body as string)).toEqual({
      text: 'Works in GMT+2',
      expectedHash: 'a'.repeat(64),
    })
  })

  it('a stale edit conflicts honestly: notice shown, winner rendered (RF-083)', async () => {
    useServerSessionStore.setState({ status: 'signed-in', account: null })
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        items: [
          { id: 'n-1', text: 'Works in GMT+1', contentHash: 'a'.repeat(64), createdAt: 1 },
        ],
      }),
    )
    // The PUT loses the race: someone else saved first.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { message: 'This note changed since you opened it.' }),
    )
    // The store then reloads the honest current state.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        items: [
          { id: 'n-1', text: 'Works in GMT+3', contentHash: 'c'.repeat(64), createdAt: 3 },
        ],
      }),
    )
    render(<MemoryPanel agentId={AGENT_ID} />)
    await screen.findByText('Works in GMT+1')

    await userEvent.click(screen.getByRole('button', { name: /Edit server note n-1/i }))
    const input = screen.getByLabelText('Edit server memory note')
    await userEvent.clear(input)
    await userEvent.type(input, 'Works in GMT+2')
    await userEvent.click(screen.getByRole('button', { name: /Save server note n-1/i }))

    // The honest outcome: the notice explains, the winner's text shows.
    expect(await screen.findByRole('status')).toHaveTextContent(/changed on the server/i)
    await screen.findByText('Works in GMT+3')
    expect(screen.queryByLabelText('Edit server memory note')).toBeNull()
  })

  it('server mode deletes through the service with an honest error path', async () => {
    useServerSessionStore.setState({ status: 'signed-in', account: null })
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { items: [{ id: 'n-1', text: 'Works in GMT+1', createdAt: 1 }] }),
    )
    render(<MemoryPanel agentId={AGENT_ID} />)
    await screen.findByText('Works in GMT+1')

    fetchMock.mockResolvedValueOnce(jsonResponse(204))
    await userEvent.click(screen.getByRole('button', { name: 'Delete server note' }))
    await screen.findByText(/No notes yet/)

    const deleteCall = fetchMock.mock.calls.find((call) => call[1]?.method === 'DELETE')
    expect(deleteCall).toBeDefined()
    expect(String(deleteCall![0])).toContain('/employees/emp-1/memory/n-1')
  })
})
