import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ChatSection } from '@/features/settings/ChatSection'
import { resetStoreForTests, useAppStore } from '@/state/store'

/** Chat preferences: the send key, the nickname, and the traits. */
describe('ChatSection', () => {
  afterEach(() => {
    cleanup()
    resetStoreForTests()
  })

  it('switching the send key updates the preference', async () => {
    const user = userEvent.setup()
    render(<ChatSection />)
    const group = screen.getByRole('radiogroup', { name: 'Send key behavior' })
    expect(group).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'Ctrl/Cmd+Enter sends' }))
    expect(useAppStore.getState().preferences.sendKey).toBe('ctrl-enter')
  })

  it('the nickname and traits persist through the preferences store', async () => {
    const user = userEvent.setup()
    render(<ChatSection />)
    await user.type(screen.getByLabelText('What should Uni call you?'), 'Ada')
    expect(useAppStore.getState().preferences.nickname).toBe('Ada')
    await user.type(screen.getByLabelText('What traits should Uni have?'), 'concise')
    expect(useAppStore.getState().preferences.traits).toBe('concise')
  })

  it('the personalization footer promises local-only storage', () => {
    render(<ChatSection />)
    expect(
      screen.getByText(/Stored only in this browser and passed to the chat adapter/i),
    ).toBeInTheDocument()
  })
})
