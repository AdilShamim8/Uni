import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderApp, setupAppTest } from './helpers'
import { useServerSessionStore } from '@/state/serverSessionStore'
import { useKnowledgeStore } from '@/state/knowledgeStore'

/**
 * P10 — server knowledge on the Library page: text-file ingestion with
 * honest non-text refusal, the documents list with real char counts,
 * deletion, and lexical search showing real excerpts from the server.
 */

const USER = { id: 'u-1', email: 'a@b.test', name: 'Alice', createdAt: 1 }
const ME = { user: USER, workspace: { id: 'w-1', name: 'W', role: 'owner' } }

const DOCUMENT = {
  id: 'd-1',
  title: 'Q3 planning',
  fileName: 'q3-notes.md',
  sizeBytes: 54,
  extension: 'md',
  mimeType: 'text/plain',
  extraction: 'extracted',
  extractedText: 'Ship the routines UI.',
  extractionError: null,
  charCount: 22,
  createdAt: 1,
  updatedAt: 1,
}

function jsonResponse(status: number, body: unknown): Response {
  if (status === 204) return new Response(null, { status })
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function stubServer(options: { files?: unknown[]; searchHits?: unknown[] } = {}): void {
  const files = options.files ?? [DOCUMENT]
  const searchHits = options.searchHits ?? []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL, init?: RequestInit) => {
      const path = String(url)
      const method = init?.method ?? 'GET'
      if (path === '/api/auth/get-session') {
        return jsonResponse(200, { session: { token: 't' }, user: USER })
      }
      if (path === '/api/v1/me') return jsonResponse(200, ME)
      if (path === '/api/v1/files' && method === 'GET') {
        return jsonResponse(200, { items: files })
      }
      if (path === '/api/v1/files' && method === 'POST') {
        const body = JSON.parse(String(init?.body)) as { title: string; fileName: string }
        return jsonResponse(201, {
          ...DOCUMENT,
          id: 'd-new',
          title: body.title,
          fileName: body.fileName,
        })
      }
      if (path === '/api/v1/files/retrieve' && method === 'POST') {
        return jsonResponse(200, { hits: searchHits, query: 'anything' })
      }
      if (path.startsWith('/api/v1/files/') && method === 'DELETE') {
        return jsonResponse(204, null)
      }
      return jsonResponse(404, { code: 'not_found' })
    }),
  )
}

function mockFile(name: string, text: string): File {
  const file = new File([text], name, { type: 'text/plain' })
  return file
}

describe('ServerKnowledgeSection on the Library page', () => {
  beforeEach(() => {
    cleanup()
    setupAppTest()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stays hidden when signed out', async () => {
    stubServer({ files: [] })
    useServerSessionStore.setState({ status: 'signed-out' })
    // Re-render with a session-less state: the fetch mock signs in, so
    // instead assert on a signed-out store before the app hydrates.
    renderApp('/library')
    await waitFor(() => {
      expect(useServerSessionStore.getState().status).toBe('signed-in')
    })
    // Signed in — the section IS shown; the signed-out case is covered
    // by asserting the section's absence when the account is cleared.
    useServerSessionStore.setState({ status: 'signed-out', account: null })
    await waitFor(() => {
      expect(
        screen.queryByRole('region', { name: /server knowledge/i }),
      ).not.toBeInTheDocument()
    })
  })

  it('lists indexed documents with honest char counts', async () => {
    stubServer()
    renderApp('/library')
    const section = await screen.findByRole('region', { name: /server knowledge/i })
    expect(section.textContent).toContain('Q3 planning')
    expect(section.textContent).toContain('22 chars')
    expect(section.textContent).toContain('indexed')
    expect(section.textContent).toContain('1 documents indexed')
  })

  it('ingests a dropped-in text file through the real path', async () => {
    const user = userEvent.setup()
    stubServer()
    renderApp('/library')
    // Two file inputs live on this page (local knowledge + server);
    // scope to the server section's by its accept list.
    const input = await waitFor(() => {
      const element = document.querySelector(
        'input[type="file"][accept*=".log"]',
      ) as HTMLInputElement | null
      expect(element).toBeTruthy()
      return element!
    })

    await user.upload(input, mockFile('notes.txt', 'Some planning text'))
    await waitFor(() => {
      expect(screen.getByText('notes')).toBeInTheDocument()
    })
  })

  it('refuses binary formats with the honest reason', async () => {
    stubServer()
    renderApp('/library')
    const input = await waitFor(() => {
      const element = document.querySelector(
        'input[type="file"][accept*=".log"]',
      ) as HTMLInputElement | null
      expect(element).toBeTruthy()
      return element!
    })

    // userEvent filters uploads by the input's accept list (like a
    // real file picker), so a mismatched file needs a raw change event
    // — the drag-drop path a real browser can still produce. jsdom has
    // no DataTransfer, so the files are assigned onto the input.
    const binary = new File([new Uint8Array([137, 80])], 'photo.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { value: [binary] })
    fireEvent.change(input)
    expect(await screen.findByRole('alert')).toHaveTextContent(/photo\.png.*not a plain-text format/)
  })

  it('searches the index and shows real excerpts', async () => {
    const user = userEvent.setup()
    stubServer({
      searchHits: [
        {
          documentId: 'd-1',
          title: 'Q3 planning',
          excerpt: 'Ship the routines UI and the files ingestion.',
          score: 3,
        },
      ],
    })
    renderApp('/library')
    await screen.findByRole('region', { name: /server knowledge/i })

    await user.type(screen.getByLabelText('Search server knowledge'), 'routines')
    await user.click(screen.getByRole('button', { name: 'Search' }))

    expect(await screen.findByText('1 match')).toBeInTheDocument()
    expect(screen.getByText(/Ship the routines UI and the files ingestion/)).toBeInTheDocument()
  })

  it('shows the honest no-matches state', async () => {
    const user = userEvent.setup()
    stubServer({ searchHits: [] })
    renderApp('/library')
    await screen.findByRole('region', { name: /server knowledge/i })

    await user.type(screen.getByLabelText('Search server knowledge'), 'nothing')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    expect(await screen.findByText('No matches')).toBeInTheDocument()
  })

  it('deletes a document through the server', async () => {
    const user = userEvent.setup()
    stubServer()
    renderApp('/library')
    await screen.findByRole('region', { name: /server knowledge/i })

    await user.click(screen.getByRole('button', { name: 'Delete Q3 planning' }))
    await waitFor(() => {
      expect(screen.queryByText('Q3 planning')).not.toBeInTheDocument()
    })
  })
})


/** RF-100 — the document filter narrows by title and file name. */
describe('knowledge document filter (RF-100)', () => {
  beforeEach(() => {
    cleanup()
    setupAppTest()
  })

  it('narrows the list live and says so when nothing matches', async () => {
    const docs: ReturnType<typeof useKnowledgeStore.getState>['documents'] = {}
    for (const n of [1, 2, 3, 4]) {
      docs[`d-${n}`] = {
        id: `d-${n}`,
        title: n % 2 === 0 ? `Release notes ${n}` : `Q${n} planning`,
        fileName: n % 2 === 0 ? `release-${n}.md` : `plan-${n}.md`,
        source: 'file',
        chunkCount: 2,
        charCount: 100,
        createdAt: n,
        updatedAt: n,
      }
    }
    useKnowledgeStore.setState({ documents: docs })
    renderApp('/library')

    await screen.findByText('Q1 planning')
    expect(screen.getAllByRole('listitem')).toHaveLength(4)

    await userEvent.type(screen.getByLabelText('Filter documents'), 'release')
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByText('Release notes 2')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText('Filter documents'))
    await userEvent.type(screen.getByLabelText('Filter documents'), 'zzz')
    expect(await screen.findByText('No documents match this filter.')).toBeInTheDocument()
  })
})
