import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from '@/components/ui/Button'

/** The Button primitive: default-safe type, honest disabled state. */
describe('Button', () => {
  afterEach(() => cleanup())

  it('defaults to type=button so it never submits a form by accident', () => {
    render(<Button>Save</Button>)
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button')
  })

  it('forwards an explicit submit type', () => {
    render(<Button type="submit">Send</Button>)
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'submit')
  })

  it('fires onClick when enabled and not when disabled', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const { rerender } = render(<Button onClick={onClick}>Act</Button>)
    await user.click(screen.getByRole('button', { name: 'Act' }))
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(
      <Button onClick={onClick} disabled>
        Act
      </Button>,
    )
    const disabled = screen.getByRole('button', { name: 'Act' })
    expect(disabled).toBeDisabled()
    await user.click(disabled)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('applies the danger and primary variant classes', () => {
    render(
      <>
        <Button variant="danger">Delete</Button>
        <Button variant="primary">Create</Button>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Delete' }).className).toContain('bg-danger')
    expect(screen.getByRole('button', { name: 'Create' }).className).toContain('bg-accent')
  })
})
