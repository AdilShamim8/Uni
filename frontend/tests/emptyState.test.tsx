import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProviderHint, StarterRow, WelcomeHeading } from '@/features/chat/EmptyState'
import { resetStoreForTests } from '@/state/store'

/** The empty-chat welcome composition: greeting, starters, provider hint. */
describe('WelcomeHeading', () => {
  afterEach(() => cleanup())

  it('greets with the headline and the accent word', () => {
    render(<WelcomeHeading />)
    expect(
      screen.getByRole('heading', { name: /what would you like to create/i }),
    ).toBeInTheDocument()
  })

  it('the supporting sentence sets honest expectations', () => {
    render(<WelcomeHeading />)
    expect(
      screen.getByText('Ask anything, draft something new, or pick up where you left off.'),
    ).toBeInTheDocument()
  })
})

describe('StarterRow', () => {
  afterEach(() => cleanup())

  it('offers the four suggested starting points', () => {
    render(<StarterRow onSuggestion={() => undefined} />)
    const row = screen.getByLabelText('Suggested starting points')
    for (const title of ['Explain something', 'Draft an email', 'Brainstorm names', 'Plan a weekend']) {
      expect(withinText(row, title)).toBe(true)
    }
  })

  it('a starter hands its full prompt to the composer callback', async () => {
    const user = userEvent.setup()
    const onSuggestion = vi.fn()
    render(<StarterRow onSuggestion={onSuggestion} />)
    await user.click(screen.getByRole('button', { name: /Draft an email/ }))
    expect(onSuggestion).toHaveBeenCalledWith('Draft a short, friendly email')
  })
})

describe('ProviderHint', () => {
  afterEach(() => {
    cleanup()
    resetStoreForTests()
  })

  it('appears while no provider is connected, with the honest local-demo wording', () => {
    render(<ProviderHint />)
    expect(screen.getByText(/You're on the local demo/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Connect a supported provider/ })).toBeInTheDocument()
  })

  it('names the actually supported protocols — never “any provider”', () => {
    render(<ProviderHint />)
    const text = screen.getByText(/local demo/i).closest('p')?.textContent ?? ''
    expect(text).toContain('OpenAI')
    expect(text).toContain('Anthropic')
    expect(text).toContain('OpenRouter')
    expect(text).toContain('local runtime')
  })
})

function withinText(container: HTMLElement, text: string): boolean {
  return container.textContent?.includes(text) ?? false
}
