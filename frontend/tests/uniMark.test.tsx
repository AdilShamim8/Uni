import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { UniMark } from '@/components/layout/UniMark'

/** The brand mark is decorative by contract: hidden, not focusable. */
describe('UniMark', () => {
  afterEach(() => cleanup())

  it('renders a decorative svg — aria-hidden, not focusable', () => {
    const { container } = render(<UniMark />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(svg?.getAttribute('focusable')).toBe('false')
  })

  it('honors the requested pixel size', () => {
    const { container } = render(<UniMark size={40} />)
    expect(container.querySelector('svg')).toHaveAttribute('width', '40')
    expect(container.querySelector('svg')).toHaveAttribute('height', '40')
  })
})
