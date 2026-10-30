import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, setupAppTest } from './helpers'
import { FREE_ROUTES } from '@/features/settings/freeModels'

setupAppTest()

async function openProvidersSection() {
  const user = userEvent.setup()
  renderApp('/')
  await user.click(screen.getByRole('button', { name: /Connect a supported provider/i }))
  const dialog = within(await screen.findByRole('dialog', { name: 'Settings' }))
  await user.click(dialog.getByRole('button', { name: 'Providers & models' }))
  return { user, dialog }
}

describe('free models hub', () => {
  it('shows the hub with the curated routes and honest limits', async () => {
    const { dialog } = await openProvidersSection()
    const hub = dialog.getByRole('region', { name: 'Free routes' })

    expect(hub).toBeInTheDocument()
    expect(hub.textContent).toContain('Start at $0')
    // Collapsed by default: first routes visible, the rest behind the toggle.
    expect(within(hub).getByText('Groq')).toBeInTheDocument()
    expect(within(hub).getByText(/daily request limits/i)).toBeInTheDocument()
    expect(within(hub).getAllByRole('list').length).toBeGreaterThan(0)
  })

  it('expands to reveal every free route', async () => {
    const { user, dialog } = await openProvidersSection()
    const hub = dialog.getByRole('region', { name: 'Free routes' })

    const toggle = within(hub).getByRole('button', { name: /more free routes/i })
    await user.click(toggle)

    for (const route of FREE_ROUTES) {
      expect(within(hub).getAllByText(route.label).length).toBeGreaterThan(0)
    }
    expect(within(hub).getByRole('button', { name: 'Show fewer routes' })).toBeInTheDocument()
  })

  it('one tap on a route opens the form fully pre-filled', async () => {
    const { user, dialog } = await openProvidersSection()
    const hub = dialog.getByRole('region', { name: 'Free routes' })

    await user.click(within(hub).getByRole('button', { name: 'Use the Groq route' }))

    // The form is open with the route's label and endpoint pre-filled.
    expect(dialog.getByLabelText('Profile label')).toHaveValue('Groq')
    expect(dialog.getByLabelText('Endpoint base URL')).toHaveValue(
      'https://api.groq.com/openai/v1',
    )
    // The route's starter models are already added as editable models.
    expect(dialog.getByDisplayValue('gpt-oss-120b')).toBeInTheDocument()
    expect(dialog.getByDisplayValue('GPT-OSS 120B')).toBeInTheDocument()
    // Everything needed is present, so the profile can be saved at once.
    expect(dialog.getByRole('button', { name: 'Add profile' })).toBeEnabled()

    await user.click(dialog.getByRole('button', { name: 'Add profile' }))
    expect(await dialog.findByRole('heading', { name: 'Groq' })).toBeInTheDocument()
  })

  it('hides the hub while the create form is open, and brings it back on cancel', async () => {
    const { user, dialog } = await openProvidersSection()

    await user.click(dialog.getByRole('button', { name: 'Add provider profile' }))
    expect(dialog.queryByRole('region', { name: 'Free routes' })).not.toBeInTheDocument()

    await user.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(dialog.getByRole('region', { name: 'Free routes' })).toBeInTheDocument()
  })

  it('local routes say no key is needed', async () => {
    const { user, dialog } = await openProvidersSection()
    const hub = dialog.getByRole('region', { name: 'Free routes' })

    await user.click(within(hub).getByRole('button', { name: /more free routes/i }))
    const ollamaCard = within(hub)
      .getAllByRole('listitem')
      .find((item) => item.textContent?.includes('Ollama (local)'))
    expect(ollamaCard).toBeDefined()
    expect(ollamaCard!.textContent).toContain('No key, no account')
    expect(ollamaCard!.textContent).toContain('local')
  })
})
