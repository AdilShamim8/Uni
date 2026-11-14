import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Switch } from '@/components/ui/Switch'

/** Switch: a real switch role with an associated label and description. */
describe('Switch', () => {
  afterEach(() => cleanup())

  it('exposes role=switch with the checked state', () => {
    const { rerender } = render(
      <Switch checked={false} onChange={() => undefined} label="Stream responses" />,
    )
    const control = screen.getByRole('switch', { name: 'Stream responses' })
    expect(control).toHaveAttribute('aria-checked', 'false')
    rerender(<Switch checked onChange={() => undefined} label="Stream responses" />)
    expect(screen.getByRole('switch', { name: 'Stream responses' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })

  it('clicking toggles through the callback with the next state', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} label="Reduce motion" />)
    await user.click(screen.getByRole('switch', { name: 'Reduce motion' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('the optional description is rendered as help text', () => {
    render(
      <Switch
        checked
        onChange={() => undefined}
        label="Share telemetry"
        description="Counts feature usage; never message content."
      />,
    )
    expect(screen.getByText('Counts feature usage; never message content.')).toBeInTheDocument()
  })
})
