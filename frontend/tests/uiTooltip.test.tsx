import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Tooltip } from '@/components/ui/Tooltip'
import { IconButton } from '@/components/ui/IconButton'

/**
 * The CSS-only tooltip is a visual supplement: the trigger keeps its own
 * accessible name, and the bubble text rides along in the DOM.
 */
describe('Tooltip', () => {
  afterEach(() => cleanup())

  it('wraps the child without stealing its accessible name', () => {
    render(
      <Tooltip label="Attach files">
        <IconButton label="Attach files">📎</IconButton>
      </Tooltip>,
    )
    const button = screen.getByRole('button', { name: 'Attach files' })
    expect(button).toHaveAttribute('aria-label', 'Attach files')
  })

  it('the bubble label is present in the DOM (hover/focus shows it via CSS)', () => {
    const { container } = render(
      <Tooltip label="Mark as temporary">
        <button type="button">Temp</button>
      </Tooltip>,
    )
    expect(container.textContent).toContain('Mark as temporary')
  })

  it('accepts the bottom side variant without changing semantics', () => {
    render(
      <Tooltip label="Hint" side="bottom">
        <button type="button">Trigger</button>
      </Tooltip>,
    )
    expect(screen.getByRole('button', { name: 'Trigger' })).toBeInTheDocument()
  })
})
