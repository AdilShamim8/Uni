import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { setupAppTest, renderApp } from './helpers'

/* ------------------------------------------------------------------ */
/* D1 regression — menus never overflow the viewport                    */
/* ------------------------------------------------------------------ */

describe('Menu collision handling (audit D1)', () => {
  setupAppTest()

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('flips a downward menu upward when it would overflow the viewport bottom', async () => {
    // Simulate a panel that opens near the bottom of a 768px-tall viewport.
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    spy.mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') === 'menu') {
        return {
          x: 0, y: 700, top: 700, bottom: 950, left: 0, right: 200,
          width: 200, height: 250, toJSON: () => ({}),
        }
      }
      return { x: 0, y: 0, top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) }
    })

    render(
      <Menu
        label="Test menu"
        direction="down"
        trigger={<button type="button">Open</button>}
      >
        <MenuItem>Item one</MenuItem>
      </Menu>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const panel = await screen.findByRole('menu')
    expect(panel.className).toContain('pop-in-up')
  })

  it('focuses the first item without scrolling (preventScroll)', async () => {
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')
    render(
      <Menu label="Test menu" trigger={<button type="button">Open</button>}>
        <MenuItem>Item one</MenuItem>
        <MenuItem>Item two</MenuItem>
      </Menu>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => {
      expect(focusSpy).toHaveBeenCalledWith(expect.objectContaining({ preventScroll: true }))
    })
  })

  it('renders the sidebar account menu opening upward', async () => {
    renderApp()
    await userEvent.click(screen.getByRole('button', { name: /Demo user/ }))
    const panel = await screen.findByRole('menu', { name: 'Account menu' })
    expect(panel.className).toContain('pop-in-up')
  })
})

/* ------------------------------------------------------------------ */
/* R1 regression — selectable menu items use proper ARIA roles          */
/* ------------------------------------------------------------------ */

describe('MenuItem selection roles (audit R1)', () => {
  setupAppTest()

  it('renders checkbox-selection items as menuitemcheckbox', async () => {
    render(
      <Menu label="Tools" trigger={<button type="button">Open</button>}>
        <MenuItem selection="checkbox" selected>
          Research
        </MenuItem>
      </Menu>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const item = await screen.findByRole('menuitemcheckbox', { name: 'Research' })
    expect(item).toHaveAttribute('aria-checked', 'true')
  })

  it('renders radio-selection items as menuitemradio', async () => {
    render(
      <Menu label="Model" trigger={<button type="button">Open</button>}>
        <MenuItem selection="radio" selected={false}>
          Demo Pro
        </MenuItem>
      </Menu>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const item = await screen.findByRole('menuitemradio', { name: 'Demo Pro' })
    expect(item).toHaveAttribute('aria-checked', 'false')
  })

  it('plain actions stay menuitem without aria-checked', async () => {
    render(
      <Menu label="Actions" trigger={<button type="button">Open</button>}>
        <MenuItem selected={undefined}>Rename</MenuItem>
      </Menu>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const item = await screen.findByRole('menuitem', { name: 'Rename' })
    expect(item).not.toHaveAttribute('aria-checked')
  })
})
