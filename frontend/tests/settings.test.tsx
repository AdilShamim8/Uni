import { describe, expect, it } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, setupAppTest } from './helpers'
import { flushPersistence } from '@/state/store'

setupAppTest()

async function openSettings() {
  const user = userEvent.setup()
  renderApp('/')
  await user.click(screen.getByRole('button', { name: /Demo user/i }))
  await user.click(await screen.findByRole('menuitem', { name: 'Settings' }))
  return within(await screen.findByRole('dialog', { name: 'Settings' }))
}

describe('settings', () => {
  it('switches theme and persists the choice', async () => {
    const dialog = await openSettings()
    await userEvent.setup().click(dialog.getByRole('radio', { name: 'Dark' }))

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('universe:theme')).toBe('dark')
  })

  it('applies density and text size to the document', async () => {
    const dialog = await openSettings()
    const user = userEvent.setup()

    await user.click(dialog.getByRole('radio', { name: 'Compact' }))
    expect(document.documentElement.getAttribute('data-density')).toBe('compact')

    await user.click(dialog.getByRole('radio', { name: 'Small' }))
    expect(document.documentElement.getAttribute('data-textsize')).toBe('s')
  })

  it('toggles reduced transparency on the document root', async () => {
    const dialog = await openSettings()
    await userEvent.setup().click(dialog.getByRole('switch', { name: 'Reduce transparency' }))

    expect(document.documentElement.getAttribute('data-transparency')).toBe('off')
  })

  it('changes the send-key behavior preference', async () => {
    const dialog = await openSettings()
    const user = userEvent.setup()
    await user.click(dialog.getByRole('button', { name: 'Chat' }))
    await user.click(dialog.getByRole('radio', { name: 'Ctrl/Cmd+Enter sends' }))
    flushPersistence()
    const saved = JSON.parse(localStorage.getItem('universe:data') ?? '{}') as {
      preferences?: { sendKey?: string }
    }
    expect(saved.preferences?.sendKey).toBe('ctrl-enter')
  })

  it('simulates a connection test with a clearly labeled demo result', async () => {
    await openSettings()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Providers & models' }))
    const [testButton] = await screen.findAllByRole('button', {
      name: 'Simulate connection test',
    })
    await user.click(testButton)

    expect(
      await screen.findByText(/Demo result: reachable \(simulated\)/),
    ).toBeInTheDocument()
  })

  it('explains local persistence in Privacy & about and closes on Escape', async () => {
    const dialog = await openSettings()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Privacy & about' }))
    expect(dialog.getByText(/Where your data lives/i)).toBeInTheDocument()
    expect(dialog.getByText(/not affiliated with/i)).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument()
  })
})
