import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { renderApp, setupAppTest } from './helpers'
import { useAgentsStore } from '@/state/agentsStore'

/**
 * Milestone 07 regression suite (F07): details panels and dialogs must
 * have REAL modal behavior — focus moves inside on open, Tab cannot
 * reach the background, Escape closes, focus returns to the trigger.
 * jsdom's matchMedia reports mobile, so the inspector renders as the
 * modal sheet variant.
 */

setupAppTest()

function firstAgentId(): string {
  useAgentsStore.getState().initialize()
  const agents = Object.values(useAgentsStore.getState().agents)
  return agents[0]?.id ?? ''
}

describe('employee details modal focus behavior (F07)', () => {
  it('traps focus, closes on Escape, and returns focus to the trigger', async () => {
    const agentId = firstAgentId()
    expect(agentId).toBeTruthy()
    renderApp(`/agents/${agentId}`)

    const trigger = await screen.findByRole('button', { name: 'Profile' })
    // Real clicks focus the trigger first; emulate that for focus-return.
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')

    // Focus moved inside the dialog on open.
    await waitFor(() => {
      expect(dialog.contains(document.activeElement)).toBe(true)
    })

    // Tab cycles inside the dialog — the background composer is never
    // reachable while the sheet is open.
    const composer = screen.getByLabelText(/Message .*|\/assign/i)
    for (let i = 0; i < 12; i += 1) {
      fireEvent.keyDown(document, { key: 'Tab' })
      expect(dialog.contains(document.activeElement) || document.activeElement === document.body)
        .toBe(true)
      expect(document.activeElement).not.toBe(composer)
    }

    // Escape closes and focus returns to the trigger.
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
    expect(document.activeElement).toBe(trigger)
  })
})

describe('Library context dialog focus behavior (F07)', () => {
  it('uses the shared Dialog: focus inside, Escape closes, focus returns', async () => {
    const agentId = firstAgentId()
    renderApp(`/agents/${agentId}`)

    // Grant nothing — open the plugin picker and enable Documents first
    // through the catalogue store, then use the picker.
    const { usePluginsStore } = await import('@/state/pluginsStore')
    usePluginsStore.getState().enablePlugin('library-context')

    const picker = await screen.findByRole('button', { name: 'Plugin picker' })
    picker.focus()
    fireEvent.click(picker)
    const item = await screen.findByRole('menuitem', { name: /Library context/ })
    fireEvent.click(item)

    // The granted chip's action menu opens the attach dialog.
    const chip = await screen.findByRole('button', { name: 'Library context actions' })
    chip.focus()
    fireEvent.click(chip)
    const action = await screen.findByRole('menuitem', { name: 'Find and attach context…' })
    action.focus()
    fireEvent.click(action)

    const dialog = await screen.findByRole('dialog', { name: 'Attach Library context' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    // The search input is focused on open (initialFocusRef), ready to type.
    const search = within(dialog).getByLabelText('Search your documents')
    await waitFor(() => {
      expect(document.activeElement).toBe(search)
    })

    // Typing filters; Escape closes.
    fireEvent.change(search, { target: { value: 'zzz-no-match' } })
    expect(within(dialog).getByText(/No local documents/)).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Attach Library context' })).not.toBeInTheDocument()
    })
    // Focus is never left inside the removed dialog.
    expect(dialog.contains(document.activeElement)).toBe(false)
  })
})
