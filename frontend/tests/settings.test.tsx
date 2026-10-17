import { describe, expect, it, vi } from 'vitest'
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

  it('connects any provider with an API key and discovers its models', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'gpt-test' }] }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await openSettings()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Providers & models' }))
    const [firstProvider] = screen.getAllByRole('article')
    const providerCard = within(firstProvider)

    await user.type(providerCard.getByLabelText('API key'), 'test-key-1234')
    await user.click(providerCard.getByRole('button', { name: 'Connect' }))

    // Honest success line with latency and the discovered model count.
    expect(await providerCard.findByText(/Connected in \d+ms — 1 model available\./)).toBeInTheDocument()
    expect(providerCard.getByText('Connected')).toBeInTheDocument()
    expect(providerCard.getByText(/•••• 1234/)).toBeInTheDocument()
    // The endpoint's model list replaced the demo chips.
    expect(providerCard.getByRole('button', { name: /gpt-test/ })).toBeInTheDocument()

    // The key traveled only to the configured endpoint, as a bearer token.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://your-endpoint.example/v1/models')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key-1234')

    // The key lives in the private credentials store, never in app data.
    flushPersistence()
    const exported = JSON.parse(localStorage.getItem('universe:data') ?? '{}') as {
      credentials?: unknown
    }
    expect(exported.credentials).toBeUndefined()
    const credentials = JSON.parse(
      localStorage.getItem('universe:credentials:v1') ?? '{}',
    ) as Record<string, { apiKey?: string; status?: string }>
    expect(Object.values(credentials)[0]?.apiKey).toBe('test-key-1234')
    expect(Object.values(credentials)[0]?.status).toBe('connected')
    vi.unstubAllGlobals()
  })

  it('shows an honest error and keeps the key out of storage when auth fails', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad key', { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)
    await openSettings()
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: 'Providers & models' }))
    const [firstProvider] = screen.getAllByRole('article')
    const providerCard = within(firstProvider)

    await user.type(providerCard.getByLabelText('API key'), 'wrong-key')
    await user.click(providerCard.getByRole('button', { name: 'Connect' }))

    expect(await providerCard.findByText(/401 Unauthorized — check the API key/)).toBeInTheDocument()
    // A key that did not authenticate is never saved.
    expect(localStorage.getItem('universe:credentials:v1')).toBeNull()
    vi.unstubAllGlobals()
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
