import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditRoutineDialog } from '@/features/work/EditRoutineDialog'
import type { ServerRoutine } from '@/services/api/serverRoutines'

/**
 * RF-061 — the routine edit dialog: prefilled shared fields, a
 * changed-only patch, and honest failure handling.
 */

const ROUTINE: ServerRoutine = {
  id: 'r-1',
  sessionId: 's-1',
  employeeId: 'emp-1',
  employeeName: 'Researcher',
  name: 'Morning brief',
  prompt: 'Summarize overnight changes.',
  schedule: '0 * * * *',
  catchUpMinutes: 0,
  paused: false,
  archived: false,
  lastFireAt: null,
  nextFireAt: 123,
  createdAt: 1,
  updatedAt: 1,
}

const EMPLOYEES = [
  { id: 'emp-1', name: 'Researcher' },
  { id: 'emp-2', name: 'Writer' },
]

function renderDialog(
  routine: ServerRoutine | null,
  onSave: ReturnType<typeof vi.fn> = vi.fn(async () => true),
) {
  render(
    <EditRoutineDialog
      routine={routine}
      employees={EMPLOYEES}
      onClose={() => {}}
      onSave={onSave}
    />,
  )
  return onSave
}

describe('EditRoutineDialog', () => {
  beforeEach(() => {
    cleanup()
  })

  it('renders nothing when no routine is targeted', () => {
    const view = render(
      <EditRoutineDialog routine={null} employees={EMPLOYEES} onClose={() => {}} onSave={vi.fn()} />,
    )
    expect(view.container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('prefills every field from the routine and keeps Save disabled until a change', async () => {
    const user = userEvent.setup()
    renderDialog(ROUTINE)
    const dialog = await screen.findByRole('dialog')

    expect((within(dialog).getByLabelText('Name') as HTMLInputElement).value).toBe('Morning brief')
    expect(
      (within(dialog).getByLabelText('Prompt') as HTMLTextAreaElement).value,
    ).toBe('Summarize overnight changes.')
    expect(within(dialog).getByLabelText('Schedule (UTC)')).toHaveValue('0 * * * *')
    expect(within(dialog).getByLabelText('Run as employee (optional)')).toHaveValue('emp-1')
    // Nothing changed yet: Save is disabled (the API rejects empty patches).
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await user.type(within(dialog).getByLabelText('Name'), '!')
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })

  it('submits ONLY the changed fields (re-pin included)', async () => {
    const user = userEvent.setup()
    const onSave = renderDialog(ROUTINE)
    const dialog = await screen.findByRole('dialog')

    await user.clear(within(dialog).getByLabelText('Name'))
    await user.type(within(dialog).getByLabelText('Name'), 'Evening digest')
    await user.selectOptions(within(dialog).getByLabelText('Run as employee (optional)'), 'emp-2')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('r-1', {
        name: 'Evening digest',
        employeeId: 'emp-2',
      })
    })
  })

  it('sends employeeId: null when the pin is removed', async () => {
    const user = userEvent.setup()
    const onSave = renderDialog(ROUTINE)
    const dialog = await screen.findByRole('dialog')

    await user.selectOptions(
      within(dialog).getByLabelText('Run as employee (optional)'),
      '',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('r-1', { employeeId: null })
    })
  })

  it('prefills a non-preset schedule and catch-up honestly', async () => {
    const user = userEvent.setup()
    const onSave = renderDialog({
      ...ROUTINE,
      schedule: '*/15 9-17 * * 1-5',
      catchUpMinutes: 45,
    })
    const dialog = await screen.findByRole('dialog')

    // The custom schedule appears in the custom cron field.
    expect((within(dialog).getByLabelText('Custom 5-field cron') as HTMLInputElement).value).toBe(
      '*/15 9-17 * * 1-5',
    )
    // A stored catch-up outside the presets stays visible as its own option.
    expect(
      within(dialog).getByLabelText('Catch-up window after downtime (minutes)'),
    ).toHaveValue('45')
    await user.selectOptions(
      within(dialog).getByLabelText('Catch-up window after downtime (minutes)'),
      '120',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('r-1', { catchUpMinutes: 120 })
    })
  })

  it('keeps the dialog open with an honest message when the server rejects', async () => {
    const user = userEvent.setup()
    renderDialog(ROUTINE, vi.fn(async () => false))
    const dialog = await screen.findByRole('dialog')

    await user.type(within(dialog).getByLabelText('Name'), '!')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    // The change is still there, so a corrected retry stays possible.
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })
})
