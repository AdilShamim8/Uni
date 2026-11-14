import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

/** ConfirmDialog: destructive asks twice, honestly labelled. */
describe('ConfirmDialog', () => {
  afterEach(() => cleanup())

  function setup(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
    const onConfirm = vi.fn()
    const onClose = vi.fn()
    render(
      <ConfirmDialog
        open
        title="Delete the routine?"
        body="The routine and its run history are removed permanently."
        confirmLabel="Delete routine"
        cancelLabel="Keep it"
        onConfirm={onConfirm}
        onClose={onClose}
        {...overrides}
      />,
    )
    return { onConfirm, onClose }
  }

  it('shows the title, body, and both actions', () => {
    setup()
    expect(screen.getByText('Delete the routine?')).toBeInTheDocument()
    expect(
      screen.getByText('The routine and its run history are removed permanently.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete routine' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeInTheDocument()
  })

  it('confirming runs the action and closes the dialog', async () => {
    const user = userEvent.setup()
    const { onConfirm, onClose } = setup()
    await user.click(screen.getByRole('button', { name: 'Delete routine' }))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('cancelling closes without running the action', async () => {
    const user = userEvent.setup()
    const { onConfirm, onClose } = setup()
    await user.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('a destructive confirm renders in the danger style', () => {
    setup({ destructive: true })
    expect(screen.getByRole('button', { name: 'Delete routine' }).className).toContain('bg-danger')
  })
})
