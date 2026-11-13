import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, setupAppTest } from './helpers'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerEmployee } from '@/services/api/serverEmployees'
import { resetAgentsStoreForTests, useAgentsStore } from '@/state/agentsStore'

/**
 * Phase C1 — the server employee roster on the Agents page: appears
 * only for signed-in sessions, lists the account's employees with an
 * Open-thread link for profiles linked locally (T016), an honest
 * not-linked state otherwise, and never touches the local directory.
 */

const USER = { id: 'u-1', email: 'a@b.test', name: 'Alice', createdAt: 1 }
const ME = { user: USER, workspace: { id: 'w-1', name: 'W', role: 'owner' } }

const EMPLOYEES: ServerEmployee[] = [
  {
    id: 'e-1',
    name: 'Research Librarian',
    description: 'Finds and cites sources',
    instructions: '',
    category: 'specialist',
    providerId: null,
    modelId: null,
    tools: [],
    starters: [],
    archived: false,
    createdAt: 1,
    updatedAt: 1,
  },
  {
    id: 'e-2',
    name: 'Archived one',
    description: 'hidden',
    instructions: '',
    category: 'personal',
    providerId: null,
    modelId: null,
    tools: [],
    starters: [],
    archived: true,
    createdAt: 1,
    updatedAt: 1,
  },
]

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubServer(employees: ServerEmployee[], signedIn = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      const path = String(url)
      if (path === '/api/auth/get-session') {
        return jsonResponse(200, signedIn ? { session: { token: 't' }, user: USER } : null)
      }
      if (path === '/api/v1/me') return jsonResponse(200, ME)
      if (path === '/api/v1/employees') {
        return jsonResponse(200, { items: employees, page: { total: employees.length, limit: 50, offset: 0 } })
      }
      return jsonResponse(404, { code: 'not_found' })
    }),
  )
}

describe('Agents page — server employees section', () => {
  beforeEach(() => {
    cleanup()
    setupAppTest()
    resetAgentsStoreForTests()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opens the edit dialog from a row and saves through the store (RF-075)', async () => {
    stubServer(EMPLOYEES)
    const update = vi.fn(async () => true)
    useServerSessionStore.setState({ updateServerEmployee: update })
    renderApp('/agents')

    const user = userEvent.setup()
    await screen.findByText('Research Librarian')
    await user.click(screen.getByRole('button', { name: /Edit employee Research Librarian/i }))
    const dialog = await screen.findByRole('dialog')
    expect((within(dialog).getByLabelText('Name') as HTMLInputElement).value).toBe(
      'Research Librarian',
    )

    await user.clear(within(dialog).getByLabelText('Name'))
    await user.type(within(dialog).getByLabelText('Name'), 'Writer')
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(update).toHaveBeenCalledWith('e-1', { name: 'Writer' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })

  it('stays hidden when signed out', async () => {
    stubServer(EMPLOYEES, false)
    renderApp('/agents')
    await waitFor(() => {
      expect(useServerSessionStore.getState().status).toBe('signed-out')
    })
    expect(
      screen.queryByRole('region', { name: /server employees on this account/i }),
    ).not.toBeInTheDocument()
  })

  it('lists active server employees when signed in', async () => {
    stubServer(EMPLOYEES)
    renderApp('/agents')
    await waitFor(() => {
      expect(useServerSessionStore.getState().status).toBe('signed-in')
    })

    const section = await screen.findByRole('region', { name: /server employees on this account/i })
    expect(withinText(section, 'Research Librarian')).toBe(true)
    expect(withinText(section, '1 on the server')).toBe(true)
    // Archived employees never render.
    expect(withinText(section, 'Archived one')).toBe(false)
  })

  it('shows the honest empty state when the account has none', async () => {
    stubServer([])
    renderApp('/agents')
    await waitFor(() => {
      expect(useServerSessionStore.getState().status).toBe('signed-in')
    })
    expect(await screen.findByText(/No server employees yet/i)).toBeInTheDocument()
  })

  it('links to the local profile for linked employees; honest note otherwise', async () => {
    stubServer(EMPLOYEES)
    renderApp('/agents')
    await waitFor(() => {
      expect(useServerSessionStore.getState().status).toBe('signed-in')
    })
    // Link a local agent to e-1 (the T016 identity link) AFTER mount:
    // the App's store hydration must not wipe it, and the section
    // re-renders reactively from the agents store.
    useAgentsStore.getState().saveAgent({
      id: 'agent-local-1',
      name: 'Research Librarian',
      description: 'Local mirror',
      instructions: '',
      category: 'specialist',
      providerId: null,
      modelId: null,
      tools: [],
      projectIds: [],
      starters: [],
      archived: false,
      builtin: false,
      createdAt: 1,
      updatedAt: 1,
      serverEmployeeId: 'e-1',
    })
    const link = await screen.findByRole('link', { name: /Open thread/i })
    expect(link).toHaveAttribute('href', '/agents/agent-local-1')

    // e-1's roster row is linked; the not-linked state shows for others.
    expect(screen.queryByText('Not linked to a local profile')).not.toBeInTheDocument()
  })

  it('shows the not-linked state when no local profile matches', async () => {
    stubServer(EMPLOYEES)
    renderApp('/agents')
    await waitFor(() => {
      expect(useServerSessionStore.getState().status).toBe('signed-in')
    })
    expect(await screen.findByText(/Not linked to a local profile/i)).toBeInTheDocument()
  })
})

function withinText(container: HTMLElement, text: string): boolean {
  return container.textContent?.includes(text) ?? false
}
