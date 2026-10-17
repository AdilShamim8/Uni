import { describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, setupAppTest } from './helpers'

setupAppTest()

describe('conversation search', () => {
  it('opens with Ctrl+K', async () => {
    renderApp('/')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(await screen.findByRole('dialog', { name: 'Search conversations' })).toBeInTheDocument()
  })

  it('focuses the search input when opened so typing works immediately', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Search conversations' }))

    const input = await screen.findByPlaceholderText(/Search titles and message content/)
    expect(input).toHaveFocus()

    // Typing without clicking the input first still filters results.
    await user.keyboard('rainy')
    expect(await screen.findByRole('option', { name: /Relaxed weekend ideas/ })).toBeInTheDocument()
  })

  it('filters real local message content and opens the result by keyboard', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Search conversations' }))

    const input = await screen.findByPlaceholderText(/Search titles and message content/)
    await user.type(input, 'rainy')

    const option = await screen.findByRole('option', { name: /Relaxed weekend ideas/ })
    expect(option).toBeInTheDocument()
    // Matched text is highlighted
    expect(option.querySelector('mark')).not.toBeNull()

    await user.keyboard('{Enter}')
    expect(await screen.findByText('Rainy version:')).toBeInTheDocument()
  })

  it('shows a useful empty state when nothing matches', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Search conversations' }))
    const input = await screen.findByPlaceholderText(/Search titles and message content/)
    await user.type(input, 'zzzz-nothing-matches-this')

    expect(await screen.findByText(/No conversations match/i)).toBeInTheDocument()
  })
})
