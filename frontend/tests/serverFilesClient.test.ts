import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  createServerFile,
  deleteServerFile,
  listServerFiles,
  retrieveServerKnowledge,
} from '@/services/api/serverFiles'

/** Server files client (P10): documents in, honest retrieval out. */
function jsonResponse(status: number, body?: unknown): Response {
  if (status === 204) return new Response(null, { status })
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('serverFiles client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists documents and tolerates an empty items array', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [{ id: 'doc_1' }] }))
    const files = await listServerFiles()
    expect(files).toHaveLength(1)
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}))
    expect(await listServerFiles()).toEqual([])
  })

  it('creates a document by POST with title, fileName, and content', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 'doc_2' }))
    await createServerFile({ title: 'Notes', fileName: 'notes.txt', content: 'hello' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/files')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({
      title: 'Notes',
      fileName: 'notes.txt',
      content: 'hello',
    })
  })

  it('deletes a document by id-encoded DELETE', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(204))
    await deleteServerFile('doc/1')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/files/doc%2F1')
    expect(init.method).toBe('DELETE')
  })

  it('retrieves knowledge with the default limit of 8', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { hits: [{ documentId: 'doc_1' }] }))
    const hits = await retrieveServerKnowledge('launch plan')
    expect(hits).toHaveLength(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/files/retrieve')
    expect(JSON.parse(init.body as string)).toEqual({ query: 'launch plan', limit: 8 })
  })
})
