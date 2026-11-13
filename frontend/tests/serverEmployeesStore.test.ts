import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerEmployee } from '@/services/api/serverEmployees'

/**
 * RF-076 — the employees slice of the server session store:
 * updateServerEmployee patches through the API client, replaces the
 * row in place, and reports failure honestly. The action existed for
 * the ensure/bind flow; this is its first direct coverage.
 */

const EMPLOYEE: ServerEmployee = {
  id: 'e-1',
  name: 'Research Librarian',
  description: 'Finds and cites sources',
  instructions: 'Be concise.',
  category: 'specialist',
  providerId: null,
  modelId: null,
  tools: [],
  starters: [],
  archived: false,
  createdAt: 1,
  updatedAt: 1,
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('serverSessionStore — employees slice', () => {
  beforeEach(() => {
    useServerSessionStore.setState({
      status: 'signed-in',
      sessionGeneration: 1,
      serverEmployees: [EMPLOYEE],
      runError: null,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('updates an employee and replaces the row in place', async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toContain('/employees/e-1')
      expect(init?.method).toBe('PATCH')
      return jsonResponse(200, { ...EMPLOYEE, name: 'Writer', updatedAt: 2 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const ok = await useServerSessionStore
      .getState()
      .updateServerEmployee('e-1', { name: 'Writer' })

    expect(ok).toBe(true)
    const row = useServerSessionStore.getState().serverEmployees[0]!
    expect(row.name).toBe('Writer')
    expect(row.updatedAt).toBe(2)
    // The patch carried only the changed field.
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ name: 'Writer' })
  })

  it('flows the archived flag through the patch (archive/unarchive path)', async () => {
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).toContain('/employees/e-1')
      expect(init?.method).toBe('PATCH')
      return jsonResponse(200, { ...EMPLOYEE, archived: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    const ok = await useServerSessionStore
      .getState()
      .updateServerEmployee('e-1', { archived: true })

    expect(ok).toBe(true)
    expect(useServerSessionStore.getState().serverEmployees[0]!.archived).toBe(true)
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string)
    expect(body).toEqual({ archived: true })
  })

  it('loads with the archived flag when asked (RF-079)', async () => {
    const fetchMock = vi.fn(async (url: string | URL) => {
      if (String(url).includes('/employees')) {
        expect(String(url)).toContain('archived=true')
      }
      return jsonResponse(200, { items: [{ ...EMPLOYEE, archived: true }] })
    })
    vi.stubGlobal('fetch', fetchMock)
    await useServerSessionStore.getState().loadServerEmployees(true)
    expect(useServerSessionStore.getState().serverEmployees[0]!.archived).toBe(true)
  })

  it('records the honest error when the server rejects an update', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(409, { message: 'Name already used.' })),
    )

    const ok = await useServerSessionStore
      .getState()
      .updateServerEmployee('e-1', { name: 'Writer' })

    expect(ok).toBe(false)
    expect(useServerSessionStore.getState().runError).toBeTruthy()
    // The local row is untouched — no optimistic lie.
    expect(useServerSessionStore.getState().serverEmployees[0]!.name).toBe('Research Librarian')
  })
})
