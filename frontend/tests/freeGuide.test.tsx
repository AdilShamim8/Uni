import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, setupAppTest } from './helpers'

setupAppTest()

async function openCreateForm() {
  const user = userEvent.setup()
  renderApp('/')
  await user.click(screen.getByRole('button', { name: /Connect a supported provider/i }))
  const dialog = within(await screen.findByRole('dialog', { name: 'Settings' }))
  await user.click(dialog.getByRole('button', { name: 'Providers & models' }))
  await user.click(dialog.getByRole('button', { name: 'Add provider profile' }))
  return { user, dialog }
}

describe('free setup guide', () => {
  it('appears for a free route with numbered steps and the console link', async () => {
    const { user, dialog } = await openCreateForm()

    await user.click(dialog.getByRole('button', { name: /Google AI Studio/ }))

    // The guide header names the console the key comes from.
    expect(dialog.getByText('Free key from aistudio.google.com')).toBeInTheDocument()
    // Beginner steps are numbered and complete.
    const steps = dialog.getAllByRole('listitem').filter((item) =>
      within(item).queryByText(/Open aistudio\.google\.com|Click Create API key|Paste the key/),
    )
    expect(steps.length).toBe(3)
    // The signup link opens the provider's own page, safely.
    const link = dialog.getByRole('link', { name: /Open aistudio\.google\.com/i })
    expect(link).toHaveAttribute('href', 'https://aistudio.google.com/apikey')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    // The honest limits note is right there.
    expect(dialog.getByText(/per-minute rate limits/i)).toBeInTheDocument()
  })

  it('local routes explain no key is needed and link nowhere', async () => {
    const { user, dialog } = await openCreateForm()

    await user.click(dialog.getByRole('button', { name: /^Ollama \(local\)/ }))

    expect(dialog.getByText('No key to get — it runs on your machine')).toBeInTheDocument()
    expect(
      dialog.getByText(/type any word as the key below \(it is ignored\)/i),
    ).toBeInTheDocument()
    // A local route has no signup link at all.
    expect(dialog.queryByRole('link', { name: /Open /i })).not.toBeInTheDocument()
  })

  it('disappears when the endpoint no longer matches a free route', async () => {
    const { user, dialog } = await openCreateForm()

    await user.click(dialog.getByRole('button', { name: /Groq/ }))
    expect(dialog.getByText('Free key from console.groq.com')).toBeInTheDocument()

    // Edit the endpoint away from the route — the guide must not linger.
    const endpoint = dialog.getByLabelText('Endpoint base URL')
    await user.clear(endpoint)
    await user.type(endpoint, 'https://custom-gateway.example/v1')

    expect(dialog.queryByText(/Free key from/i)).not.toBeInTheDocument()
    expect(dialog.queryByText('No key to get — it runs on your machine')).not.toBeInTheDocument()
  })

  it('shows the guide when picking a route from the free hub too', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('button', { name: /Connect a supported provider/i }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Settings' }))
    await user.click(dialog.getByRole('button', { name: 'Providers & models' }))

    // One tap on the hub route: the form opens with its guide ready.
    const hub = dialog.getByRole('region', { name: 'Free routes' })
    await user.click(within(hub).getByRole('button', { name: 'Use the Groq route' }))

    expect(dialog.getByText('Free key from console.groq.com')).toBeInTheDocument()
    expect(dialog.getByText(/gsk-/)).toBeInTheDocument()
  })
})
