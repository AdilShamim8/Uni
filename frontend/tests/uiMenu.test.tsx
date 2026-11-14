import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Menu, MenuItem } from '@/components/ui/Menu'

/**
 * The dropdown Menu: wired trigger, portaled panel, Escape closes and
 * restores focus, outside clicks dismiss.
 */
describe('Menu', () => {
  afterEach(() => cleanup())

  function setup() {
    const onPick = vi.fn()
    render(
      <Menu
        label="Row actions"
        trigger={
          <button type="button">Open actions</button>
        }
      >
        <MenuItem onClick={onPick}>Rename</MenuItem>
        <MenuItem onClick={onPick}>Archive</MenuItem>
      </Menu>,
    )
    return { onPick }
  }

  it('the trigger announces the menu and starts collapsed', () => {
    setup()
    const trigger = screen.getByRole('button', { name: 'Open actions' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('clicking the trigger opens a labelled menu with its items', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Open actions' }))
    const menu = await screen.findByRole('menu')
    expect(menu).toHaveAttribute('aria-label', 'Row actions')
    expect(screen.getByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Archive' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open actions' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })

  it('Escape closes the menu and focus returns to the trigger', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Open actions' }))
    await screen.findByRole('menu')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).toBeNull()
    expect(screen.getByRole('button', { name: 'Open actions' })).toHaveFocus()
  })

  it('a pointer press outside dismisses the menu', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Open actions' }))
    await screen.findByRole('menu')
    await user.click(document.body)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('picking an item fires its handler and closes', async () => {
    const user = userEvent.setup()
    const { onPick } = setup()
    await user.click(screen.getByRole('button', { name: 'Open actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Rename' }))
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })
})
