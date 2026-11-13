import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, setupAppTest } from './helpers'
import { useServerSessionStore } from '@/state/serverSessionStore'

/**
 * P08 — the connector catalog section on the Plugins surface:
 * signed-in only, honest "Not connected" badges on every card, setup
 * steps behind a disclosure, and the docs link. Nothing ever claims a
 * live connection.
 */

const USER = { id: 'u-1', email: 'a@b.test', name: 'Alice', createdAt: 1 }
const ME = { user: USER, workspace: { id: 'w-1', name: 'W', role: 'owner' } }

const CONNECTORS = [
  {
    id: 'github',
    name: 'GitHub',
    description: 'Read repositories and issues.',
    kind: 'platform',
    category: 'development',
    docsUrl: 'https://docs.github.com/rest',
    routes: ['List my open pull requests'],
    setup: [
      'Create a fine-grained personal access token with read-only repository access',
      'Store the token as a server credential (encrypted at rest)',
    ],
    status: 'unavailable',
  },
]

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubServer(signedIn = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      const path = String(url)
      if (path === '/api/auth/get-session') {
        return jsonResponse(200, signedIn ? { session: { token: 't' }, user: USER } : null)
      }
      if (path === '/api/v1/me') return jsonResponse(200, ME)
      if (path === '/api/v1/connectors') {
        return jsonResponse(200, { items: CONNECTORS })
      }
      return jsonResponse(404, { code: 'not_found' })
    }),
  )
}

describe('ConnectorsSection on the Plugins page', () => {
  beforeEach(() => {
    cleanup()
    setupAppTest()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stays hidden when signed out', async () => {
    stubServer(false)
    renderApp('/plugins')
    await waitFor(() => {
      expect(useServerSessionStore.getState().status).toBe('signed-out')
    })
    expect(screen.queryByRole('region', { name: /connector catalog/i })).not.toBeInTheDocument()
  })

  it('lists connectors with honest not-connected badges when signed in', async () => {
    stubServer()
    renderApp('/plugins')
    await waitFor(() => {
      expect(useServerSessionStore.getState().status).toBe('signed-in')
    })

    const section = await screen.findByRole('region', { name: /connector catalog/i })
    expect(section.textContent).toContain('GitHub')
    expect(screen.getAllByText('Not connected').length).toBeGreaterThan(0)
    // Never a live-connection claim.
    expect(section.textContent).not.toContain('Connected')
  })

  it('discloses the real setup steps on demand', async () => {
    const user = userEvent.setup()
    stubServer()
    renderApp('/plugins')
    await waitFor(() => {
      expect(useServerSessionStore.getState().status).toBe('signed-in')
    })

    expect(screen.queryByText(/Store the token as a server credential/)).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /What it needs/ }))
    expect(
      await screen.findByText(/Store the token as a server credential/),
    ).toBeInTheDocument()
    // The model-facing route example appears with the steps.
    expect(screen.getByText(/List my open pull requests/)).toBeInTheDocument()
  })

  it('links to the connector docs', async () => {
    stubServer()
    renderApp('/plugins')
    await waitFor(() => {
      expect(useServerSessionStore.getState().status).toBe('signed-in')
    })
    const docsLink = await screen.findByRole('link', { name: /Docs/ })
    expect(docsLink).toHaveAttribute('href', 'https://docs.github.com/rest')
  })

  it('shows the honest empty state when the catalog fails to load', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const path = String(url)
        if (path === '/api/auth/get-session') {
          return jsonResponse(200, { session: { token: 't' }, user: USER })
        }
        if (path === '/api/v1/me') return jsonResponse(200, ME)
        if (path === '/api/v1/connectors') return jsonResponse(500, { code: 'INTERNAL' })
        return jsonResponse(404, { code: 'not_found' })
      }),
    )
    renderApp('/plugins')
    await waitFor(() => {
      expect(useServerSessionStore.getState().status).toBe('signed-in')
    })
    const section = await screen.findByRole('region', { name: /connector catalog/i })
    await waitFor(() => {
      expect(section.textContent).toContain('0 available to connect')
    })
  })
})
