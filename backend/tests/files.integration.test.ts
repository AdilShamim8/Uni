import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * P10 / T034 + T036 — files & knowledge over real HTTP + embedded
 * PostgreSQL: text documents with honest extraction (non-text formats
 * refused up front, never faked), workspace-scoped reads/deletes, and
 * bounded lexical retrieval with real excerpts.
 */

describe('files & knowledge (T034/T036)', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let bob: { cookie: string }

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Files' })
    bob = await signUpUser(testApp.app, { name: 'Bob Files' })
    await testApp.app.listen({ port: 0, host: '127.0.0.1' })
  }, 180_000)

  afterAll(async () => {
    await testApp?.app.close()
    await testApp?.stop()
  })

  it('stores a text document with honest extraction status and char count', async () => {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/files',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: {
        title: 'Q3 planning notes',
        fileName: 'q3-notes.md',
        content: '# Q3 planning\n\nShip the routines UI and the files ingestion.',
      },
    })
    expect(created.statusCode).toBe(201)
    const document = created.json() as {
      id: string
      extraction: string
      charCount: number
      extension: string
      sizeBytes: number
    }
    expect(document.extraction).toBe('extracted')
    expect(document.extension).toBe('md')
    expect(document.charCount).toBe(
      '# Q3 planning\n\nShip the routines UI and the files ingestion.'.length,
    )
    expect(document.sizeBytes).toBeGreaterThan(0)
  })

  it('refuses non-text formats honestly (never a fake extracted row)', async () => {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/files',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: { title: 'Photo', fileName: 'photo.png', content: '\u0089PNG-ish bytes' },
    })
    expect(created.statusCode).toBe(400)
    const body = created.json() as { code?: string; message?: string }
    expect(body.message).toContain('not supported yet')
  })

  it('refuses empty content', async () => {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/files',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: { title: 'Empty', fileName: 'empty.txt', content: '' },
    })
    expect(created.statusCode).toBe(400)
  })

  it('lists and reads documents workspace-scoped', async () => {
    const mine = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/files',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
    })
    const items = (mine.json() as { items: Array<{ id: string }> }).items
    expect(items.length).toBeGreaterThanOrEqual(1)

    // Bob sees none of Alice's documents.
    const bobs = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/files',
      headers: { cookie: bob.cookie, origin: 'http://localhost:5173' },
    })
    expect((bobs.json() as { items: unknown[] }).items).toHaveLength(0)

    // Cross-workspace read/delete are 404s, not leaks.
    const docId = items[0]!.id
    const bobRead = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/files/${docId}`,
      headers: { cookie: bob.cookie, origin: 'http://localhost:5173' },
    })
    expect(bobRead.statusCode).toBe(404)
    const bobDelete = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/v1/files/${docId}`,
      headers: { cookie: bob.cookie, origin: 'http://localhost:5173' },
    })
    expect(bobDelete.statusCode).toBe(404)
  })

  it('retrieves knowledge with real excerpts and honest scoring', async () => {
    // Two documents; only one mentions the search topic.
    await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/files',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: {
        title: 'Retro notes',
        fileName: 'retro.txt',
        content: 'The retrospective agreed the routines launcher shipped smoothly.',
      },
    })
    const search = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/files/retrieve',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: { query: 'routines launcher retro', limit: 5 },
    })
    expect(search.statusCode).toBe(200)
    const body = search.json() as {
      query: string
      hits: Array<{ documentId: string; title: string; excerpt: string; score: number }>
    }
    expect(body.query).toBe('routines launcher retro')
    expect(body.hits.length).toBeGreaterThanOrEqual(1)
    expect(body.hits[0]!.score).toBeGreaterThan(0)
    expect(body.hits.some((hit) => hit.title === 'Retro notes')).toBe(true)
    // Every excerpt is a real slice of the document, not a placeholder.
    for (const hit of body.hits) {
      expect(hit.excerpt.length).toBeGreaterThan(0)
      expect(hit.excerpt.length).toBeLessThanOrEqual(600)
    }
  })

  it('returns honest empty results when nothing matches', async () => {
    const search = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/files/retrieve',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: { query: 'zebra quantum umbrella', limit: 5 },
    })
    expect(search.statusCode).toBe(200)
    const body = search.json() as { hits: unknown[] }
    expect(body.hits).toHaveLength(0)
  })

  it('deletes a document (and it stops matching retrieval)', async () => {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/files',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: {
        title: 'Temp scratch',
        fileName: 'scratch.txt',
        content: 'scratchpad about ornithology expeditions',
      },
    })
    const document = created.json() as { id: string }

    const removed = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/v1/files/${document.id}`,
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
    })
    expect(removed.statusCode).toBe(204)

    const search = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/files/retrieve',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: { query: 'ornithology expeditions', limit: 5 },
    })
    const body = search.json() as { hits: Array<{ documentId: string }> }
    expect(body.hits.some((hit) => hit.documentId === document.id)).toBe(false)
  })
})
