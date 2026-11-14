import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ThemeProvider } from '@/app/ThemeProvider'
import { AppearanceSection } from '@/features/settings/AppearanceSection'
import { resetStoreForTests, useAppStore } from '@/state/store'

/** Appearance: theme, density, text size — all persisted preferences. */
describe('AppearanceSection', () => {
  afterEach(() => {
    cleanup()
    resetStoreForTests()
    localStorage.removeItem('universe:theme')
  })

  it('offers the three theme modes in a labelled group', () => {
    render(
      <ThemeProvider>
        <AppearanceSection />
      </ThemeProvider>,
    )
    const group = screen.getByRole('radiogroup', { name: 'Theme' })
    expect(group).toBeInTheDocument()
    for (const label of ['Light', 'Dark', 'System']) {
      expect(screen.getByRole('radio', { name: label })).toBeInTheDocument()
    }
  })

  it('switching the theme writes the document attribute and the preference', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <AppearanceSection />
      </ThemeProvider>,
    )
    await user.click(screen.getByRole('radio', { name: 'Dark' }))
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('universe:theme')).toBe('dark')
  })

  it('density and text size report through the preferences store', async () => {
    const user = userEvent.setup()
    render(
      <ThemeProvider>
        <AppearanceSection />
      </ThemeProvider>,
    )
    await user.click(screen.getByRole('radio', { name: 'Compact' }))
    expect(useAppStore.getState().preferences.density).toBe('compact')
    const textSizes = screen.getByRole('radiogroup', { name: 'Text size' })
    expect(textSizes).toBeInTheDocument()
  })
})
