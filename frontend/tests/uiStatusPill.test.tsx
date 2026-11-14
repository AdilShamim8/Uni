import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { StatusPill } from '@/components/ui/StatusPill'

/** StatusPill: one visual treatment for state across all surfaces. */
describe('StatusPill', () => {
  afterEach(() => cleanup())

  it('renders its label as plain text (no button semantics)', () => {
    render(<StatusPill label="Running" />)
    expect(screen.getByText('Running')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('the dot is decorative — hidden from the accessibility tree', () => {
    render(<StatusPill label="Live" tone="accent" dot />)
    const dot = screen.getByText('Live').querySelector('span[aria-hidden="true"]')
    expect(dot).not.toBeNull()
  })

  it('no dot element renders unless asked for', () => {
    render(<StatusPill label="Paused" />)
    expect(screen.getByText('Paused').querySelector('span[aria-hidden="true"]')).toBeNull()
  })

  it('every tone maps to its semantic color class', () => {
    const { rerender } = render(<StatusPill label="x" tone="success" />)
    expect(screen.getByText('x').className).toContain('text-success')
    for (const tone of ['neutral', 'accent', 'warning', 'danger'] as const) {
      rerender(<StatusPill label="x" tone={tone} />)
      expect(screen.getByText('x').className).toContain(`text-${tone === 'neutral' ? 'ink-soft' : tone}`)
    }
  })
})
