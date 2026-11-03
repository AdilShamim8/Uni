import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, setupAppTest } from './helpers'
import { useAppStore } from '@/state/store'

/**
 * N013 — capability-aware model choices. The chat model picker lists
 * what every model advertises and can filter the choice by capability,
 * so "which of my models can do images?" is one tap instead of a memory
 * exercise. The seeded demo profiles advertise a known capability mix:
 * Demo Mini (chat), Demo Standard (chat, search), Demo Pro (all eight),
 * Demo Chat S (chat, search).
 */

setupAppTest()

async function openPicker() {
  await userEvent.click(await screen.findByRole('button', { name: /Demo Pro/i }))
  // The portaled menu panel carries the picker's accessible name.
  return await screen.findByRole('menu', { name: 'Select provider and model' })
}

describe('capability-aware model picker (N013)', () => {
  it('shows every model with an honest summary of what it advertises', async () => {
    renderApp('/chat')
    const menu = await openPicker()

    const items = within(menu).getAllByRole('menuitemradio')
    expect(items.length).toBeGreaterThan(3)
    const pro = within(menu).getByRole('menuitemradio', { name: /Demo Pro/ })
    expect(pro).toHaveTextContent('chat, search, research, images')
    const mini = within(menu).getByRole('menuitemradio', { name: /Demo Mini/ })
    expect(mini).toHaveTextContent('chat')
    // The filter row offers exactly the capabilities present in the
    // workspace (the demo set spans all eight).
    for (const capability of ['chat', 'search', 'research', 'images', 'voice', 'canvas', 'data-analysis', 'code']) {
      expect(within(menu).getByRole('button', { name: new RegExp(`^${capability}$`) })).toBeInTheDocument()
    }
  })

  it('filters the choice by capability and keeps groups honest', async () => {
    renderApp('/chat')
    const menu = await openPicker()

    // "Which of my models can do images?" — one tap.
    await userEvent.click(within(menu).getByRole('button', { name: /^images$/ }))

    // Only Demo Pro advertises images: it stays, everything else hides.
    expect(within(menu).getByRole('menuitemradio', { name: /Demo Pro/ })).toBeInTheDocument()
    expect(within(menu).queryByRole('menuitemradio', { name: /Demo Mini/ })).toBeNull()
    expect(within(menu).queryByRole('menuitemradio', { name: /Demo Chat S/ })).toBeNull()
    // Groups with nothing to offer under the filter collapse entirely.
    expect(within(menu).queryByText('Uni Demo — Balanced')).toBeInTheDocument()
    expect(within(menu).queryByText('Demo — Another-style profile')).toBeNull()

    // Selecting a filtered model sets the exact active model.
    await userEvent.click(within(menu).getByRole('menuitemradio', { name: /Demo Pro/ }))
    const state = useAppStore.getState()
    expect(state.activeProviderId).toBe('provider-demo-balanced')
    expect(state.activeModelId).toBe('demo-pro')
  })

  it('toggling the chip off clears the filter; search narrows to its advertisers', async () => {
    renderApp('/chat')
    const menu = await openPicker()

    const searchChip = within(menu).getByRole('button', { name: /^search$/ })
    await userEvent.click(searchChip)
    // Demo Standard, Demo Pro and Demo Chat S advertise search; Mini does not.
    expect(within(menu).queryByRole('menuitemradio', { name: /Demo Mini/ })).toBeNull()
    expect(within(menu).getByRole('menuitemradio', { name: /Demo Standard/ })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: /Demo Chat S/ })).toBeInTheDocument()

    // The same chip toggles the filter off — every model returns.
    await userEvent.click(within(menu).getByRole('button', { name: /^search$/ }))
    expect(within(menu).getByRole('menuitemradio', { name: /Demo Mini/ })).toBeInTheDocument()
    expect(within(menu).getByRole('menuitemradio', { name: /Demo Standard/ })).toBeInTheDocument()
  })

  it('only offers capabilities at least one model advertises', async () => {
    renderApp('/chat')
    // Remove every model except the chat-only Demo Mini: the filter row
    // now offers exactly "chat" — never a chip that matches nothing.
    const store = useAppStore.getState()
    const balanced = store.providers.find((provider) => provider.id === 'provider-demo-balanced')
    if (balanced) {
      store.updateProvider({ ...balanced, models: balanced.models.filter((model) => model.id === 'demo-mini') })
    }
    for (const provider of store.providers.filter((entry) => entry.id !== 'provider-demo-balanced')) {
      store.removeProvider(provider.id)
    }

    const menu = await openPicker()
    expect(within(menu).getByRole('button', { name: /^chat$/ })).toBeInTheDocument()
    expect(within(menu).queryByRole('button', { name: /^search$/ })).toBeNull()
    expect(within(menu).queryByRole('button', { name: /^images$/ })).toBeNull()
  })
})
