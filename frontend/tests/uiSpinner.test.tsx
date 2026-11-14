import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Spinner } from '@/components/ui/Spinner'

/** Spinner: decorative alone, a live status when it carries a label. */
describe('Spinner', () => {
  afterEach(() => cleanup())

  it('without a label it is purely decorative (no role)', () => {
    const { container } = render(<Spinner />)
    expect(screen.queryByRole('status')).toBeNull()
    const icon = container.querySelector('svg')
    expect(icon?.getAttribute('aria-hidden')).toBe('true')
  })

  it('with a label it becomes a polite status region', () => {
    render(<Spinner label="Loading the workspace" />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Loading the workspace')
    expect(screen.getByText('Loading the workspace')).toBeInTheDocument()
  })
})
