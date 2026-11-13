import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditEmployeeDialog } from '@/features/agents/EditEmployeeDialog'
import type { ServerEmployee } from '@/services/api/serverEmployees'

/**
 * RF-074 — the employee edit dialog: prefilled identity fields, a
 * changed-only patch, and honest failure handling.
 */

const EMPLOYEE: ServerEmployee = {
  id: 'emp-1',
  name: 'Researcher',
  description: 'Finds and summarizes sources',
  instructions: 'Be concise. Cite links.',
  category: 'specialist',
  providerId: null,
  modelId: null,
  tools: [],
  starters: [],
  archived: false,
  createdAt: 1,
  updatedAt: 1,
}

function renderDialog(
  employee: ServerEmployee | null,
  onSave: ReturnType<typeof vi.fn> = vi.fn(async () => true),
) {
  render(
    <EditEmployeeDialog employee={employee} onClose={() => {}} onSave={onSave} />,
  )
  return onSave
}

describe('EditEmployeeDialog', () => {
  beforeEach(() => {
    cleanup()
  })

  it('renders nothing when no employee is targeted', () => {
    const view = render(
      <EditEmployeeDialog employee={null} onClose={() => {}} onSave={vi.fn()} />,
    )
    expect(view.container.querySelector('[role="dialog"]')).toBeNull()
  })

  it('prefills every field and keeps Save disabled until a change', async () => {
    const user = userEvent.setup()
    renderDialog(EMPLOYEE)
    const dialog = await screen.findByRole('dialog')

    expect((within(dialog).getByLabelText('Name') as HTMLInputElement).value).toBe('Researcher')
    expect(
      (within(dialog).getByLabelText('Description') as HTMLInputElement).value,
    ).toBe('Finds and summarizes sources')
    expect(
      (within(dialog).getByLabelText(/Instructions \(sent with every assignment\)/) as HTMLTextAreaElement)
        .value,
    ).toBe('Be concise. Cite links.')
    expect(within(dialog).getByLabelText('Category')).toHaveValue('specialist')
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeDisabled()

    await user.type(within(dialog).getByLabelText('Name'), '!')
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })

  it('submits ONLY the changed fields', async () => {
    const user = userEvent.setup()
    const onSave = renderDialog(EMPLOYEE)
    const dialog = await screen.findByRole('dialog')

    await user.clear(within(dialog).getByLabelText('Name'))
    await user.type(within(dialog).getByLabelText('Name'), 'Writer')
    await user.selectOptions(within(dialog).getByLabelText('Category'), 'personal')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith('emp-1', {
        name: 'Writer',
        category: 'personal',
      })
    })
  })

  it('keeps the dialog open with an honest message when the server rejects', async () => {
    const user = userEvent.setup()
    renderDialog(EMPLOYEE, vi.fn(async () => false))
    const dialog = await screen.findByRole('dialog')

    await user.type(within(dialog).getByLabelText('Name'), '!')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Save changes' })).toBeEnabled()
  })
})
