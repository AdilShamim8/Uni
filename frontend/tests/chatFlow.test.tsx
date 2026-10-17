import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, reloadForTests, setupAppTest } from './helpers'
import { flushPersistence } from '@/state/store'
import { createMockAdapter } from '@/services/mock/mockChatAdapter'
import { setChatAdapter } from '@/state/store'

setupAppTest()

describe('chat flow', () => {
  it('sends a message and streams a deterministic response', async () => {
    const user = userEvent.setup()
    renderApp('/')
    const composer = screen.getByLabelText('Message Universe')
    await user.type(composer, 'Help me brainstorm ideas for a weekend plan')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    expect(await screen.findByText(/Start with the smallest useful slice/)).toBeInTheDocument()
    // The user's message is visible in the transcript (also appears as the
    // derived conversation title in the sidebar and top bar)
    expect(
      screen.getAllByText('Help me brainstorm ideas for a weekend plan').length,
    ).toBeGreaterThan(0)
  })

  it('disables sending for empty input', () => {
    renderApp('/')
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })

  it('stops generation and marks the message as stopped', async () => {
    setChatAdapter(createMockAdapter({ chunkDelay: 90, firstTokenDelay: 0 }))
    const user = userEvent.setup()
    renderApp('/')
    await user.type(screen.getByLabelText('Message Universe'), 'Give me ideas for a plan')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    const stop = await screen.findByRole('button', { name: 'Stop generating' })
    await user.click(stop)

    expect(await screen.findByText('Generation stopped.')).toBeInTheDocument()
    // Composer returns to send mode; it is disabled because the input was
    // cleared after sending — typing re-enables it
    const send = screen.getByRole('button', { name: 'Send message' })
    expect(send).toBeInTheDocument()
    expect(send).toBeDisabled()
    await user.type(screen.getByLabelText('Message Universe'), 'more ideas')
    expect(screen.getByRole('button', { name: 'Send message' })).toBeEnabled()
  })

  it('simulates an error with /fail and offers retry', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.type(screen.getByLabelText('Message Universe'), '/fail this one please')
    await user.click(screen.getByRole('button', { name: 'Send message' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Generation failed')
    expect(alert).toHaveTextContent('/fail')
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()
  })

  it('edits an earlier message into a branch and preserves the original', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.type(screen.getByLabelText('Message Universe'), 'First topic: brainstorm ideas')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText(/Start with the smallest useful slice/)

    await user.click(screen.getByRole('button', { name: 'Edit message' }))
    const editor = screen.getByLabelText('Edit message')
    await user.clear(editor)
    await user.type(editor, 'Edited topic: compare options in a table')
    await user.click(screen.getByRole('button', { name: 'Save and resend' }))

    // New branch answers the edited prompt
    expect(await screen.findByText(/compact comparison/i)).toBeInTheDocument()

    // Switching back to the original variant restores it — nothing was lost
    await user.click(screen.getByRole('button', { name: 'Previous variant' }))
    expect(
      (await screen.findAllByText('First topic: brainstorm ideas')).length,
    ).toBeGreaterThan(0)
    expect(screen.getByText(/Start with the smallest useful slice/)).toBeInTheDocument()
  })

  it('regenerates a response and switches between variants', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.type(screen.getByLabelText('Message Universe'), 'Give me ideas for a plan')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText(/Start with the smallest useful slice/)

    await user.click(screen.getByRole('button', { name: 'Regenerate response' }))
    // The new variant becomes active (second of two)
    expect(await screen.findByText('2/2')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous variant' }))
    expect(await screen.findByText('1/2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next variant' }))
    expect(await screen.findByText('2/2')).toBeInTheDocument()
  })

  it('persists conversations locally and restores them after reload', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.type(screen.getByLabelText('Message Universe'), 'remember this hippopotamus')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText(/Here is a take on/i)

    flushPersistence()
    const saved = JSON.parse(localStorage.getItem('universe:data') ?? '{}') as {
      conversations: { title: string }[]
    }
    expect(
      saved.conversations.some((conversation) =>
        conversation.title.includes('remember this hippopotamus'),
      ),
    ).toBe(true)

    reloadForTests()
    renderApp('/')
    const item = await screen.findByText(/remember this hippopotamus/i)
    await user.click(item)
    expect(await screen.findByText(/Here is a take on/i)).toBeInTheDocument()
  })

  it('keeps temporary chats out of local storage and reloads', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('button', { name: 'New temporary chat' }))
    expect(await screen.findByText('Temporary')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Message Universe'), 'ephemeral brainstorm ideas')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText(/Start with the smallest useful slice/)

    flushPersistence()
    const saved = JSON.parse(localStorage.getItem('universe:data') ?? '{}') as {
      conversations: { temporary?: boolean; title?: string }[]
    }
    expect(JSON.stringify(saved.conversations)).not.toContain('ephemeral brainstorm ideas')
    expect(
      saved.conversations.every((conversation) => conversation.temporary !== true),
    ).toBe(true)

    reloadForTests()
    renderApp('/')
    await screen.findByText('Welcome to Universe')
    expect(screen.queryByText(/ephemeral brainstorm ideas/)).not.toBeInTheDocument()
  })
})
