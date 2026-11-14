import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Chip } from '@/components/ui/Chip'

/** Chip: static when it has no handler, an honest toggle when it does. */
describe('Chip', () => {
  afterEach(() => cleanup())

  it('a chip without onClick renders as a static span', () => {
    render(<Chip>Local mode</Chip>)
    expect(screen.getByText('Local mode').tagName).toBe('SPAN')
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('a clickable chip renders as a button carrying aria-pressed', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Chip onClick={onClick} selected>
        GitHub
      </Chip>,
    )
    const chip = screen.getByRole('button', { name: 'GitHub' })
    expect(chip).toHaveAttribute('aria-pressed', 'true')
    await user.click(chip)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('an unselected clickable chip is aria-pressed=false', () => {
    render(<Chip onClick={() => undefined}>Draft</Chip>)
    expect(screen.getByRole('button', { name: 'Draft' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('a disabled chip never fires its handler', async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()
    render(
      <Chip onClick={onClick} disabled>
        Locked
      </Chip>,
    )
    const chip = screen.getByRole('button', { name: 'Locked' })
    expect(chip).toBeDisabled()
    await user.click(chip)
    expect(onClick).not.toHaveBeenCalled()
  })
})
