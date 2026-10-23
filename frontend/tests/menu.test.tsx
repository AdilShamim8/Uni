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
/* Body-level portal — menus escape clipped glass ancestors             */
/* ------------------------------------------------------------------ */

describe('Menu portal escape (UI clipping fix)', () => {
  setupAppTest()

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the open panel as a child of document.body, outside any ancestor', async () => {
    // The floating sidebar and mobile drawer use backdrop-filter with
    // overflow-hidden, which turns them into containing blocks that trap
    // and clip a position:fixed panel — slicing menu text mid-letter. The
    // panel must therefore live at the body level, where fixed coordinates
    // are true viewport coordinates and nothing can clip it.
    render(
      <Menu label="Test menu" trigger={<button type="button">Open</button>}>
        <MenuItem>Item one</MenuItem>
      </Menu>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const panel = await screen.findByRole('menu')
    expect(panel.parentElement).toBe(document.body)
  })

  it('keeps the menu open for clicks inside the portaled panel and closes on item select', async () => {
    const onClick = vi.fn()
    render(
      <Menu label="Test menu" trigger={<button type="button">Open</button>}>
        <MenuItem onClick={onClick}>Item one</MenuItem>
      </Menu>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const item = await screen.findByRole('menuitem', { name: 'Item one' })
    // The mousedown phase must not treat the portaled panel as "outside".
    await userEvent.click(item)
    expect(onClick).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('does not phantom-flip an upward menu that fits above its trigger', async () => {
    // Regression for the first-placement measure: the panel used to be
    // measured at its temporary (0,0) origin, where rect.top < 8 always
    // held, so every direction="up" menu flipped down in real browsers —
    // landing below the footer trigger and past the viewport bottom. The
    // mock below derives geometry from the inline styles like a layout
    // engine would, so the panel is measured where it actually lands.
    const spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    spy.mockImplementation(function (this: HTMLElement) {
      const style = this.style
      if (this.getAttribute('role') === 'menu') {
        const width = 200
        const height = 250
        let top = 0
        if (style.top) {
          top = parseFloat(style.top)
        } else if (style.bottom) {
          top = window.innerHeight - parseFloat(style.bottom) - height
        }
        return {
          x: 0, y: top, top, bottom: top + height, left: 0, right: width,
          width, height, toJSON: () => ({}),
        }
      }
      if (this.getAttribute('aria-haspopup') === 'menu') {
        // Trigger (40px tall) ends just below the panel's bottom edge.
        return {
          x: 0, y: 716, top: 716, bottom: 756, left: 0, right: 120,
          width: 120, height: 40, toJSON: () => ({}),
        }
      }
      return { x: 0, y: 0, top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0, toJSON: () => ({}) }
    })

    render(
      <Menu
        label="Test menu"
        direction="up"
        trigger={<button type="button">Open</button>}
      >
        <MenuItem>Item one</MenuItem>
      </Menu>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Open' }))
    const panel = await screen.findByRole('menu')
    // Placed 6px above the trigger's top edge — comfortably inside the
    // 768px viewport — so it must keep opening upward.
    expect(panel.className).toContain('pop-in-up')
    expect(panel.style.bottom).toBe('58px')
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
