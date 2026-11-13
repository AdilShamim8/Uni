import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoutineDetailDialog } from '@/features/work/RoutineDetailDialog'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerRoutine, ServerRoutineRun } from '@/services/api/serverRoutines'

/**
 * T033 — the routine detail dialog: loads the run history through the
 * store (fetch-mocked GET /routines/:id), renders each fire with its
 * terminal status and output, shows the honest empty state, and
 * refreshes the routine row from the same fetch.
 */

const ROUTINE: ServerRoutine = {
  id: 'r-1',
  sessionId: 's-1',
  employeeId: null,
  employeeName: null,
  name: 'Morning brief',
  prompt: 'Summarize overnight changes.',
  schedule: '30 9 * * 1-5',
  catchUpMinutes: 30,
  paused: false,
  archived: false,
  lastFireAt: 1_700_000_000_000,
  nextFireAt: 1_700_040_000_000,
  createdAt: 1,
  updatedAt: 2,
}

const RUNS: ServerRoutineRun[] = [
  {
    id: 'rr-1',
    routineId: 'r-1',
    scheduledFor: 1_700_000_000_000,
    status: 'complete',
    agentRunId: 'ar-1',
    outputText: '# Brief\n\nAll quiet.',
    errorCode: null,
    errorMessage: null,
    createdAt: 1,
    terminalAt: 2,
  },
  {
    id: 'rr-2',
    routineId: 'r-1',
    scheduledFor: 1_699_990_000_000,
    status: 'error',
    agentRunId: 'ar-0',
    outputText: '',
    errorCode: 'agent_run_error',
    errorMessage: 'No provider pinned on the session.',
    createdAt: 1,
    terminalAt: 2,
  },
]

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// The REAL detail loader, captured before any setState replaces it.
const realOpenDetail = useServerSessionStore.getState().openServerRoutineDetail

describe('RoutineDetailDialog', () => {
  beforeEach(() => {
    cleanup()
    useServerSessionStore.setState({
      status: 'signed-in',
      sessionGeneration: 1,
      serverRoutines: [ROUTINE],
      serverRoutineRuns: [],
      serverRoutineRunsLoading: false,
      serverRoutinesError: null,
      openServerRoutineDetail: vi.fn(async () => {}),
      closeServerRoutineDetail: vi.fn(() => {}),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders nothing while no routine is targeted', () => {
    const { container } = renderDialog(null)
    expect(container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('loads and renders the run history with outputs and honest errors', async () => {
    // The real store action fetches through the API client.
    useServerSessionStore.setState({
      serverRoutines: [ROUTINE],
      openServerRoutineDetail: realOpenDetail,
    })
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { routine: ROUTINE, runs: RUNS }),
    )
    vi.stubGlobal('fetch', fetchMock)

    renderDialog(ROUTINE)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Morning brief')).toBeInTheDocument()
    expect(within(dialog).getByText(/Summarize overnight changes/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Weekdays at 09:30 UTC/)).toBeInTheDocument()

    await waitFor(() => {
      expect(within(dialog).getAllByRole('listitem')).toHaveLength(2)
    })
    expect(within(dialog).getByText(/# Brief/)).toBeInTheDocument()
    expect(within(dialog).getByText('No provider pinned on the session.')).toBeInTheDocument()
    expect(within(dialog).getAllByText('complete').length).toBeGreaterThan(0)
    expect(within(dialog).getAllByText('error').length).toBeGreaterThan(0)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/routines/r-1',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('offers Edit through the footer and hands the routine back (RF-063)', async () => {
    const onEdit = vi.fn()
    useServerSessionStore.setState({ serverRoutines: [ROUTINE] })
    render(
      <RoutineDetailDialog routine={ROUTINE} onClose={() => {}} onEdit={onEdit} />,
    )
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /Edit/i }))
    expect(onEdit).toHaveBeenCalledWith(ROUTINE)
  })

  it('shows the pinned employee when the routine has one', async () => {
    const pinned = { ...ROUTINE, employeeId: 'emp-1', employeeName: 'Researcher' }
    useServerSessionStore.setState({
      serverRoutines: [pinned],
      openServerRoutineDetail: realOpenDetail,
    })
    const user = userEvent.setup()
    renderDialog(pinned)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/runs as Researcher/i)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))
  })

  it('shows the honest empty state before the first fire', async () => {
    useServerSessionStore.setState({
      serverRoutineRuns: [],
      serverRoutineRunsLoading: false,
    })
    renderDialog(ROUTINE)
    const dialog = await screen.findByRole('dialog')
    expect(
      within(dialog).getByText(/No fires recorded yet/i),
    ).toBeInTheDocument()
  })

  it('closes through the dialog footer', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderDialog(ROUTINE, onClose)
    await screen.findByRole('dialog')
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalled()
    expect(
      useServerSessionStore.getState().closeServerRoutineDetail,
    ).toHaveBeenCalled()
  })
})

function renderDialog(
  routine: ServerRoutine | null,
  onClose = () => {},
): ReturnType<typeof render> {
  return render(<RoutineDetailDialog routine={routine} onClose={onClose} />)
}
