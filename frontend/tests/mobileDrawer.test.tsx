import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, setupAppTest } from './helpers'

/**
 * Audit D3 — the mobile navigation drawer must behave like a modal:
 * labelled dialog semantics, Escape closes, focus is trapped inside while
 * open, the page behind is inert, and focus returns to the trigger.
 */
describe('mobile drawer modal semantics (audit D3)', () => {
  setupAppTest()

  it('closes on Escape and keeps dialog semantics', async () => {
    renderApp('/')

    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }))

    const drawer = await screen.findByRole('dialog', { name: 'Navigation' })
    expect(drawer).toHaveAttribute('aria-modal', 'true')

    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull(),
    )
  })

  it('makes the background inert while open and restores it on close', async () => {
    renderApp('/')

    await userEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    await screen.findByRole('dialog', { name: 'Navigation' })

    const main = document.querySelector('main')
    expect(main?.hasAttribute('inert')).toBe(true)

    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull()
      expect(main?.hasAttribute('inert')).toBe(false)
    })
  })

  it('moves focus into the drawer and back to the trigger on close', async () => {
    renderApp('/')

    const trigger = screen.getByRole('button', { name: 'Open navigation' })
    trigger.focus()
    await userEvent.click(trigger)
    await screen.findByRole('dialog', { name: 'Navigation' })

    // Focus moved into the drawer (its first primary action).
    await waitFor(() => {
      const drawer = screen.getByRole('dialog', { name: 'Navigation' })
      expect(drawer.contains(document.activeElement)).toBe(true)
    })

    await userEvent.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Navigation' })).toBeNull()
      // Focus restored to the trigger that opened the drawer.
      expect(document.activeElement).toBe(trigger)
    })
  })
})
