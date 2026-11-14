import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AboutSection } from '@/features/settings/AboutSection'

/** About: the honest data-location, temporary-chat, and demo disclosures. */
describe('AboutSection', () => {
  afterEach(() => cleanup())

  it('discloses where the data lives (this browser, versioned key)', () => {
    render(<AboutSection />)
    const section = screen.getByRole('region', { name: 'Local persistence' })
    expect(section.textContent).toContain('localStorage')
    expect(section.textContent).toContain('Nothing leaves your device')
  })

  it('explains temporary chats are memory-only and never exported', () => {
    render(<AboutSection />)
    const section = screen.getByRole('region', { name: 'Temporary chats' })
    expect(section.textContent).toContain('memory only')
    expect(section.textContent).toContain('filtered out of every save, export, and backup')
  })

  it('says exactly what is simulated', () => {
    render(<AboutSection />)
    const section = screen.getByRole('region', { name: 'Demo behavior' })
    expect(section.textContent).toContain('deterministic local demo adapter')
    expect(section.textContent).toContain('labeled as such')
  })

  it('carries the open-source attributions with their licenses', () => {
    render(<AboutSection />)
    const text = document.body.textContent ?? ''
    expect(text).toContain('MIT')
    expect(text).toContain('highlight.js')
    expect(text).toContain('lucide-react')
  })
})
