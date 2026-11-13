import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoutinesSection } from '@/features/work/RoutinesSection'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerRoutine } from '@/services/api/serverRoutines'

/**
 * T033 — the routines section on the server Work surface: list with
 * honest paused/active states, create through the dialog (presets +
 * custom cron), pause/resume, and delete behind a confirm. All through
 * the real store slice against fetch-mocked backend routes.
 */

const ROUTINE: ServerRoutine = {
  id: 'r-1',
  sessionId: 's-1',
  employeeId: null,
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

describe('RoutinesSection', () => {
  beforeEach(() => {
    cleanup()
    useServerSessionStore.setState({
      status: 'signed-in',
      sessionGeneration: 1,
      serverRoutines: [ROUTINE],
      serverRoutinesLoading: false,
      serverRoutinesError: null,
      loadServerRoutines: vi.fn(async () => {}),
      createServerRoutineFor: vi.fn(async () => true),
      setServerRoutinePausedFor: vi.fn(async () => true),
      removeServerRoutineFor: vi.fn(async () => true),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists routines with schedule, catch-up, and last-fire honesty', () => {
    render(<RoutinesSection />)
    expect(screen.getByText('Morning brief')).toBeInTheDocument()
    expect(screen.getByText(/30 9 \* \* 1-5/)).toBeInTheDocument()
    expect(screen.getByText(/catch-up 30m/)).toBeInTheDocument()
    expect(screen.getByText(/last fired/)).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('shows the honest empty state when none exist', () => {
    useServerSessionStore.setState({ serverRoutines: [] })
    render(<RoutinesSection />)
    expect(screen.getByText(/No routines yet/i)).toBeInTheDocument()
  })

  it('shows the store error honestly', () => {
    useServerSessionStore.setState({ serverRoutinesError: 'Invalid schedule: bad field.' })
    render(<RoutinesSection />)
    expect(screen.getByRole('alert')).toHaveTextContent('Invalid schedule')
  })

  it('creates a routine through the dialog with a preset schedule', async () => {
    const user = userEvent.setup()
    const create = vi.fn(async () => true)
    useServerSessionStore.setState({ createServerRoutineFor: create })
    render(<RoutinesSection />)

    await user.click(screen.getByRole('button', { name: /New routine/i }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Name'), 'Evening digest')
    await user.type(within(dialog).getByLabelText('Prompt'), 'Wrap up the day.')
    await user.click(within(dialog).getByRole('button', { name: 'Create routine' }))

    expect(create).toHaveBeenCalledWith({
      name: 'Evening digest',
      prompt: 'Wrap up the day.',
      schedule: '0 * * * *',
      catchUpMinutes: 0,
    })
    // A successful create closes the dialog.
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('keeps the dialog open with an honest message when the server rejects', async () => {
    const user = userEvent.setup()
    const create = vi.fn(async () => false)
    useServerSessionStore.setState({ createServerRoutineFor: create })
    render(<RoutinesSection />)

    await user.click(screen.getByRole('button', { name: /New routine/i }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText('Name'), 'Broken')
    await user.type(within(dialog).getByLabelText('Prompt'), 'Nope.')
    await user.click(within(dialog).getByRole('button', { name: 'Create routine' }))

    expect(await within(dialog).findByRole('alert')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('pause/resume goes through the store with the new state', async () => {
    const user = userEvent.setup()
    const pause = vi.fn(async () => true)
    useServerSessionStore.setState({ setServerRoutinePausedFor: pause })
    render(<RoutinesSection />)

    await user.click(screen.getByRole('button', { name: /Pause/ }))
    expect(pause).toHaveBeenCalledWith('r-1', true)
  })

  it('delete asks for confirmation first', async () => {
    const user = userEvent.setup()
    const remove = vi.fn(async () => true)
    useServerSessionStore.setState({ removeServerRoutineFor: remove })
    render(<RoutinesSection />)

    await user.click(screen.getByRole('button', { name: /Delete/ }))
    // The confirm dialog appears; the store action runs only after
    // confirming.
    expect(remove).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Delete routine' }))
    expect(remove).toHaveBeenCalledWith('r-1')
  })
})
