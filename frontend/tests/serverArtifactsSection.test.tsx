import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, setupAppTest } from './helpers'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerLibraryArtifact } from '@/services/api/serverLibrary'

/**
 * Phase C2 — the server artifacts section on the Library page:
 * signed-in only, lists canonical-save artifacts with honest
 * provenance labels and version counts, preview shows the content,
 * and the local notes/projects sections are untouched.
 */

const USER = { id: 'u-1', email: 'a@b.test', name: 'Alice', createdAt: 1 }
const ME = { user: USER, workspace: { id: 'w-1', name: 'W', role: 'owner' } }

const ARTIFACTS: ServerLibraryArtifact[] = [
  {
    id: 'a-1',
    title: 'Quarterly summary',
    kind: 'document',
    markdown: '# Quarterly summary\n\nGenerated from the Q3 data.',
    provenance: 'provider-generated',
    generatedBy: { providerId: 'p-1', modelId: 'llama-3.1-8b' },
    taskId: null,
    sourceConversationId: 'c-1',
    sourceMessageId: 'n-2',
    versionCount: 2,
    createdAt: 1,
    updatedAt: 2,
  },
]

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubServer(artifacts: ServerLibraryArtifact[], signedIn = true): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      const path = String(url)
      if (path === '/api/auth/get-session') {
        return jsonResponse(200, signedIn ? { session: { token: 't' }, user: USER } : null)
      }
      if (path === '/api/v1/me') return jsonResponse(200, ME)
      if (path === '/api/v1/library/artifacts') {
        return jsonResponse(200, { items: artifacts, page: { total: artifacts.length, limit: 50, offset: 0 } })
      }
      return jsonResponse(404, { code: 'not_found' })
    }),
  )
}

describe('Library page — server artifacts section', () => {
  beforeEach(() => {
    cleanup()
    setupAppTest()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stays hidden when signed out', async () => {
    stubServer(ARTIFACTS, false)
    renderApp('/library')
    await waitFor(() => {
      expect(useServerSessionStore.getState().status).toBe('signed-out')
    })
    expect(
      screen.queryByRole('region', { name: /server artifacts on this account/i }),
    ).not.toBeInTheDocument()
  })

  it('lists server artifacts with provenance and version counts when signed in', async () => {
    stubServer(ARTIFACTS)
    renderApp('/library')
    const section = await screen.findByRole('region', { name: /server artifacts on this account/i })
    expect(section.textContent).toContain('Quarterly summary')
    expect(section.textContent).toContain('provider-generated')
    expect(section.textContent).toContain('2 versions')
    expect(section.textContent).toContain('1 saved on the server')
  })

  it('opens a preview with the artifact content', async () => {
    const user = userEvent.setup()
    stubServer(ARTIFACTS)
    renderApp('/library')
    const row = await screen.findByRole('button', { name: /Quarterly summary/ })
    await user.click(row)

    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain('Quarterly summary')
    expect(dialog.textContent).toContain('Generated from the Q3 data.')
    expect(dialog.textContent).toContain('llama-3.1-8b')
  })

  it('shows the honest empty state when the account has none', async () => {
    stubServer([])
    renderApp('/library')
    expect(await screen.findByText(/Nothing saved on the server yet/i)).toBeInTheDocument()
  })
})
