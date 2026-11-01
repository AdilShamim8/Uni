import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from '@/app/App'

// Multiple renders in this file: detach each one so queries stay scoped.
afterEach(cleanup)

describe('scaffold smoke test', () => {
  it('renders the marketing home page at "/" with app entry points', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )
    // The ported ReWoo home page owns the root route: the hero headline,
    // the header CTA into the app, and the five agent cards — named for
    // the five agents that actually ship with the app (Uni, Uni
    // Assistant, Research Analyst, Writing Assistant, Finance Analyst).
    expect(
      screen.getByRole('heading', {
        name: /a little ai\.?\s*a lot more you\./i,
      }),
    ).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /try uni/i }).length).toBeGreaterThan(0)
    // The agent cards render inside the helpers section; "Uni" alone is
    // ambiguous because the footer brand is also a heading-level element.
    const helperSection = screen
      .getAllByRole('heading', { name: /five agents/i })
      .map((heading) => heading.closest('section'))
      .find((section): section is HTMLElement => section !== null)
    expect(helperSection).toBeDefined()
    for (const agent of [
      'Uni',
      'Uni Assistant',
      'Research Analyst',
      'Writing Assistant',
      'Finance Analyst',
    ]) {
      expect(
        within(helperSection as HTMLElement).getByRole('heading', { name: agent }),
      ).toBeInTheDocument()
    }
    // No fictional helper names or leftover predecessor-product copy.
    expect(screen.queryByText('Order Desk Pro')).not.toBeInTheDocument()
    for (const fictional of ['Woo', 'Scout', 'Quill', 'Tally', 'Hush']) {
      expect(screen.queryByRole('heading', { name: fictional })).not.toBeInTheDocument()
    }
  })

  it('renders the application placeholder', () => {
    render(
      <MemoryRouter initialEntries={['/chat']}>
        <App />
      </MemoryRouter>,
    )
    // The dashboard home is "/chat" since the marketing page took "/".
    // Empty state shows the welcome composition; the sidebar carries the
    // Uni wordmark, so the top bar no longer duplicates it.
    expect(
      screen.getByRole('heading', { name: /what would you like to create today\?/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('Uni')).toBeInTheDocument()
  })

  it('primary action and temporary chat are separate sibling controls', () => {
    render(
      <MemoryRouter initialEntries={['/chat']}>
        <App />
      </MemoryRouter>,
    )
    // The temporary-chat control must never live inside a New-chat
    // button (nested interactives): every "New chat" control is a real
    // button, none of them contains the temporary-chat control, and the
    // sidebar's primary action sits in the same row as its sibling.
    const temporary = screen.getAllByRole('button', { name: 'New temporary chat' })
    const newChats = screen.getAllByRole('button', { name: /^New chat$/ })
    expect(newChats.length).toBeGreaterThan(0)
    for (const newChat of newChats) {
      expect(newChat).not.toContainElement(temporary[0])
    }
    for (const control of temporary) {
      expect(control).toHaveAccessibleName('New temporary chat')
      expect(control.tagName).toBe('BUTTON')
    }
    // The sidebar primary action and its temporary sibling share one row
    // (the row container contains both controls).
    const siblingPair = newChats.find((button) =>
      button.parentElement?.contains(temporary[0]),
    )
    expect(siblingPair).toBeDefined()
  })

  it('primary navigation is a flat list, not a settings-style card', () => {
    render(
      <MemoryRouter initialEntries={['/chat']}>
        <App />
      </MemoryRouter>,
    )
    const nav = screen.getByRole('navigation', { name: 'Primary' })
    // Four destinations as direct semantic links/buttons inside one nav.
    for (const label of ['Chat', 'Work', 'Agents', 'Library']) {
      expect(
        within(nav).getByRole('button', { name: new RegExp(`^${label}$`) }),
      ).toBeInTheDocument()
    }
  })
})
