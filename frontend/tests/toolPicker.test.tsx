import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToolPicker } from '@/features/chat/ToolPicker'

/**
 * The composer tool picker: availability follows the model's advertised
 * capabilities — never API keys — and the honest empty state says so.
 */
describe('ToolPicker', () => {
  afterEach(() => cleanup())

  it('the trigger shows the selected count and stays quiet when none', () => {
    const { rerender } = render(
      <ToolPicker selected={[]} onToggle={() => undefined} capabilities={['search']} />,
    )
    const trigger = screen.getByRole('button', { name: /tools/i })
    expect(trigger.textContent).not.toContain('1')

    rerender(
      <ToolPicker selected={['search', 'research']} onToggle={() => undefined} capabilities={['search', 'research']} />,
    )
    expect(screen.getByRole('button', { name: /tools/i }).textContent).toContain('2')
  })

  it('offers only what the active model advertises; the rest stay disabled', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(
      <ToolPicker selected={[]} onToggle={onToggle} capabilities={['search', 'research']} />,
    )
    await user.click(screen.getByRole('button', { name: /tools/i }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByText('Search')).toBeInTheDocument()
    expect(within(menu).getByText('Research')).toBeInTheDocument()
    // Images and voice are not advertised by this model — present but disabled.
    const imagesItem = within(menu).getByText('Images').closest('button')
    expect(imagesItem).toBeDisabled()
  })

  it('toggling reports the exact tool id', async () => {
    const user = userEvent.setup()
    const onToggle = vi.fn()
    render(
      <ToolPicker selected={[]} onToggle={onToggle} capabilities={['search']} />,
    )
    await user.click(screen.getByRole('button', { name: /tools/i }))
    await user.click(within(screen.getByRole('menu')).getByText('Search'))
    expect(onToggle).toHaveBeenCalledWith('search')
  })

  it('a model with no tool capabilities gets the honest empty note', async () => {
    const user = userEvent.setup()
    render(<ToolPicker selected={[]} onToggle={() => undefined} capabilities={[]} />)
    await user.click(screen.getByRole('button', { name: /tools/i }))
    expect(
      screen.getByText('The selected model does not advertise tool capabilities.'),
    ).toBeInTheDocument()
  })
})
