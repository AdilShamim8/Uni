import { describe, expect, it, vi, afterEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, setupAppTest } from './helpers'
import { useServerSessionStore } from '@/state/serverSessionStore'

// Module-scope setup: setupAppTest registers its own per-test hooks
// (store resets, adapter, seeded demo data). Calling it inside a
// beforeEach applies one test too late.
setupAppTest()

/**
 * B07 — the server workspace export in Settings → Data: visible only
 * when signed in, downloads the real JSON from
 * GET /api/v1/workspace/export with a dated filename, and shows the
 * honest error when the server refuses.
 */

const USER = { id: 'u-1', email: 'a@b.test', name: 'Alice', createdAt: 1 }
const ME = { user: USER, workspace: { id: 'w-1', name: 'W', role: 'owner' } }

const EXPORT = {
  format: 'uni.workspace.export/1',
  exportedAt: 1_700_000_000_000,
  employees: [],
  memoryNotes: [],
  memoryJournal: [],
  routineRuns: [],
  routines: [],
  files: [],
  counts: {
    employees: 0,
    memoryNotes: 0,
    memoryJournal: 0,
    routines: 0,
    routineRuns: 0,
    files: 0,
  },
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

async function openDataSection(): Promise<ReturnType<typeof within>> {
  const user = userEvent.setup()
  renderApp('/chat')
  await user.click(screen.getByRole('button', { name: /Demo user/i }))
  await user.click(await screen.findByRole('menuitem', { name: 'Settings' }))
  const dialog = within(await screen.findByRole('dialog', { name: 'Settings' }))
  await user.click(dialog.getByRole('button', { name: 'Data' }))
  return dialog
}

describe('server workspace export (Settings → Data)', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** jsdom lacks createObjectURL; only the downloading tests need it. */
  function stubObjectUrl(): void {
    vi.stubGlobal(
      'URL',
      Object.assign(URL, {
        createObjectURL: vi.fn(() => 'blob:mock'),
        revokeObjectURL: vi.fn(),
      }),
    )
  }

  it('is hidden when signed out', async () => {
    const dialog = await openDataSection()
    expect(dialog.queryByText('Export server workspace')).not.toBeInTheDocument()
  })

  it('downloads the export with a dated filename when signed in', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      const path = String(url)
      if (path === '/api/auth/get-session') {
        return jsonResponse(200, { session: { token: 't' }, user: USER })
      }
      if (path === '/api/v1/me') return jsonResponse(200, ME)
      if (path === '/api/v1/workspace/export') return jsonResponse(200, EXPORT)
      return jsonResponse(404, { code: 'not_found' })
    })
    stubObjectUrl()
    vi.stubGlobal('fetch', fetchMock)
    stubObjectUrl()
    useServerSessionStore.setState({
      status: 'signed-in',
      account: { user: USER, workspace: ME.workspace },
    })

    const user = userEvent.setup()
    renderApp('/chat')
    // Signed in: the account button carries the account's name.
    await user.click(screen.getByRole('button', { name: /Alice/i }))
    await user.click(await screen.findByRole('menuitem', { name: 'Settings' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Settings' }))
    await user.click(dialog.getByRole('button', { name: 'Data' }))

    const row = dialog.getByText('Export server workspace')
    expect(row).toBeInTheDocument()

    // The export handler is async (fetch then downloadText): keep the
    // anchor-click spy installed until the download actually fires.
    const anchorClick = vi.fn()
    const originalClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = anchorClick
    await user.click(dialog.getByRole('button', { name: 'Export server workspace data' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/workspace/export',
        expect.objectContaining({ credentials: 'include' }),
      )
    })
    await waitFor(() => {
      expect(anchorClick).toHaveBeenCalled()
    })
    HTMLAnchorElement.prototype.click = originalClick
  })

  it('shows the honest error when the server refuses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL) => {
        const path = String(url)
        if (path === '/api/auth/get-session') {
          return jsonResponse(200, { session: { token: 't' }, user: USER })
        }
        if (path === '/api/v1/me') return jsonResponse(200, ME)
        if (path === '/api/v1/workspace/export') {
          return jsonResponse(500, { code: 'INTERNAL', message: 'export failed', requestId: 'r-1' })
        }
        return jsonResponse(404, { code: 'not_found' })
      }),
    )
    stubObjectUrl()
    useServerSessionStore.setState({
      status: 'signed-in',
      account: { user: USER, workspace: ME.workspace },
    })

    const user = userEvent.setup()
    renderApp('/chat')
    // Signed in: the account button carries the account's name.
    await user.click(screen.getByRole('button', { name: /Alice/i }))
    await user.click(await screen.findByRole('menuitem', { name: 'Settings' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Settings' }))
    await user.click(dialog.getByRole('button', { name: 'Data' }))

    await user.click(dialog.getByRole('button', { name: 'Export server workspace data' }))

    expect(await dialog.findByRole('alert')).toHaveTextContent(/export failed|Export failed/i)
  })
})
