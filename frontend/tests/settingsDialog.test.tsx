import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, setupAppTest } from './helpers'
import { useAppStore } from '@/state/store'

/**
 * The settings dialog: opens on the requested section once (the
 * “Connect a provider” deep link), then manual navigation wins.
 */
describe('SettingsDialog', () => {
  setupAppTest()
  afterEach(() => cleanup())

  it('stays closed until the ui asks for it', () => {
    renderApp('/chat')
    expect(screen.queryByRole('dialog', { name: 'Settings' })).toBeNull()
  })

  it('opens on the requested section when a deep link asks for it', async () => {
    renderApp('/chat')
    useAppStore.getState().setUi({ settingsOpen: true, settingsSection: 'providers' })
    await screen.findByRole('dialog', { name: 'Settings' })
    const nav = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(nav).getByRole('button', { name: /Providers & models/ })).toHaveAttribute(
      'aria-current',
      'true',
    )
  })

  it('manual navigation switches sections and the one-shot request clears', async () => {
    const user = userEvent.setup()
    renderApp('/chat')
    useAppStore.getState().setUi({ settingsOpen: true, settingsSection: 'appearance' })
    await screen.findByRole('dialog', { name: 'Settings' })
    // The one-shot section request was consumed by the open.
    expect(useAppStore.getState().ui.settingsSection).toBeNull()

    const nav = screen.getByRole('navigation', { name: 'Settings sections' })
    await user.click(within(nav).getByRole('button', { name: /^Chat$/ }))
    expect(within(nav).getByRole('button', { name: /^Chat$/ })).toHaveAttribute(
      'aria-current',
      'true',
    )

    // Closing and reopening lands on the last-visited section, not a stale request.
    useAppStore.getState().setUi({ settingsOpen: false })
    useAppStore.getState().setUi({ settingsOpen: true })
    expect(await screen.findByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    const navAgain = screen.getByRole('navigation', { name: 'Settings sections' })
    expect(within(navAgain).getByRole('button', { name: /^Chat$/ })).toHaveAttribute(
      'aria-current',
      'true',
    )
  })
})
