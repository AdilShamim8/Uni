import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Segmented } from '@/components/ui/Segmented'

/** Segmented: the iOS-style control speaks radiogroup semantics. */
describe('Segmented', () => {
  afterEach(() => cleanup())

  const options = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'auto', label: 'Auto' },
  ] as const

  it('renders a labelled radiogroup with one radio per option', () => {
    render(<Segmented value="dark" options={options} onChange={() => undefined} ariaLabel="Theme" />)
    const group = screen.getByRole('radiogroup', { name: 'Theme' })
    expect(group).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Light' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Auto' })).toHaveAttribute('aria-checked', 'false')
  })

  it('selecting another segment reports exactly that value', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Segmented value="light" options={options} onChange={onChange} ariaLabel="Theme" />)
    await user.click(screen.getByRole('radio', { name: 'Auto' }))
    expect(onChange).toHaveBeenCalledWith('auto')
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
