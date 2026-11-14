import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { IconButton } from '@/components/ui/IconButton'

/** IconButton: icon-only buttons must carry their accessible name. */
describe('IconButton', () => {
  afterEach(() => cleanup())

  it('exposes its label as both aria-label and title', () => {
    render(<IconButton label="Delete conversation">✕</IconButton>)
    const button = screen.getByRole('button', { name: 'Delete conversation' })
    expect(button).toHaveAttribute('aria-label', 'Delete conversation')
    expect(button).toHaveAttribute('title', 'Delete conversation')
  })

  it('the active state is exposed as aria-pressed', () => {
    const { rerender } = render(<IconButton label="Pin">📌</IconButton>)
    expect(screen.getByRole('button', { name: 'Pin' }).getAttribute('aria-pressed')).toBeNull()
    rerender(
      <IconButton label="Pin" active>
        📌
      </IconButton>,
    )
    expect(screen.getByRole('button', { name: 'Pin' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('fires onClick when enabled and not when disabled', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    const { rerender } = render(<IconButton onClick={onClick} label="Copy">⧉</IconButton>)
    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(onClick).toHaveBeenCalledTimes(1)

    rerender(
      <IconButton onClick={onClick} label="Copy" disabled>
        ⧉
      </IconButton>,
    )
    const disabled = screen.getByRole('button', { name: 'Copy' })
    expect(disabled).toBeDisabled()
    await user.click(disabled)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
