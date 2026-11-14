import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog } from '@/components/ui/Dialog'

/** The modal Dialog: portal-rendered, labelled, Escape-closable. */
describe('Dialog', () => {
  afterEach(() => cleanup())

  function setup(overrides: Partial<Parameters<typeof Dialog>[0]> = {}) {
    const onClose = vi.fn()
    render(
      <Dialog
        open
        onClose={onClose}
        title="Edit employee"
        description="Changes apply to new runs only."
        footer={<button type="button">Later</button>}
        {...overrides}
      >
        <p>Body content</p>
      </Dialog>,
    )
    return { onClose }
  }

  it('renders into the document as a labelled dialog with its description', () => {
    setup()
    const dialog = screen.getByRole('dialog', { name: 'Edit employee' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByText('Changes apply to new runs only.')).toBeInTheDocument()
    expect(screen.getByText('Body content')).toBeInTheDocument()
  })

  it('renders nothing at all when closed', () => {
    setup({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Body content')).toBeNull()
  })

  it('Escape closes the dialog', async () => {
    const user = userEvent.setup()
    const { onClose } = setup()
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('the footer slot renders inside the dialog', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Later' })).toBeInTheDocument()
  })

  it('the header exposes a close control', () => {
    setup()
    expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument()
  })
})
