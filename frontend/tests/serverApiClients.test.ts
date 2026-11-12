import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  listServerEmployees,
  createServerEmployee,
  patchServerEmployee,
  deleteServerEmployee,
  listServerMemoryNotes,
  addServerMemoryNote,
  deleteServerMemoryNote,
  listServerMemoryJournal,
} from '@/services/api/serverEmployees'
import {
  listServerArtifacts,
  getServerArtifact,
  listServerArtifactVersions,
  createServerArtifact,
  patchServerArtifact,
  deleteServerArtifact,
  serverCanonicalSave,
} from '@/services/api/serverLibrary'
import {
  listServerRoutines,
  getServerRoutine,
  createServerRoutine,
  patchServerRoutine,
  deleteServerRoutine,
} from '@/services/api/serverRoutines'
import {
  listServerAgentTools,
  listServerAgentSessions,
  createServerAgentSession,
  patchServerAgentSession,
  deleteServerAgentSession,
  startServerAgentRun,
  getServerAgentRun,
  cancelServerAgentRun,
  respondServerAgentPermission,
  serverAgentEventsUrl,
} from '@/services/api/serverAgents'
import { ApiError } from '@/services/api/client'

/**
 * T014 — the server API clients hit the exact backend routes with the
 * exact payload shapes (mocked fetch; route + method + body asserted),
 * surface typed results, and turn non-2xx into ApiError.
 */

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const ENVELOPE = { code: 'NOT_FOUND', message: 'gone', requestId: 'req-1' }

describe('server employees + memory client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists employees through GET /api/v1/employees', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        items: [
          {
            id: 'e-1', name: 'Researcher', description: '', instructions: 'Be terse',
            category: 'specialist', providerId: null, modelId: null, tools: [], starters: [],
            archived: false, createdAt: 1, updatedAt: 2,
          },
        ],
      }),
    )
    const items = await listServerEmployees()
    expect(items).toHaveLength(1)
    expect(items[0]!.name).toBe('Researcher')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/api/v1/employees')
    expect(init.method).toBeUndefined() // GET default
  })

  it('creates and patches employees with JSON bodies', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, {
        id: 'e-2', name: 'Writer', description: '', instructions: '', category: 'personal',
        providerId: null, modelId: null, tools: [], starters: [], archived: false,
        createdAt: 1, updatedAt: 1,
      }),
    )
    await createServerEmployee({ name: 'Writer', instructions: 'Draft clearly' })
    let [url, init] = fetchMock.mock.calls.at(-1)!
    expect(String(url)).toContain('/api/v1/employees')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ name: 'Writer', instructions: 'Draft clearly' })

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        id: 'e-2', name: 'Writer 2', description: '', instructions: '', category: 'personal',
        providerId: null, modelId: null, tools: [], starters: [], archived: true,
        createdAt: 1, updatedAt: 3,
      }),
    )
    await patchServerEmployee('e-2', { archived: true })
    ;[url, init] = fetchMock.mock.calls.at(-1)!
    expect(String(url)).toContain('/api/v1/employees/e-2')
    expect(init.method).toBe('PATCH')
  })

  it('memory notes and journal hit their nested routes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [{ id: 'n-1', text: 'prefers brevity', createdAt: 1 }] }))
    await listServerMemoryNotes('e-1')
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/employees/e-1/memory')

    fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 'n-2', text: 'new note', createdAt: 2 }))
    await addServerMemoryNote('e-1', 'new note')
    const [, init] = fetchMock.mock.calls.at(-1)!
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ text: 'new note' })

    fetchMock.mockResolvedValueOnce(jsonResponse(204))
    await deleteServerMemoryNote('e-1', 'n-2')
    expect(String(fetchMock.mock.calls.at(-1)![0])).toContain('/employees/e-1/memory/n-2')

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { items: [{ id: 'j-1', action: 'create', summary: 'note created', createdAt: 3 }] }),
    )
    await listServerMemoryJournal('e-1')
    expect(String(fetchMock.mock.calls.at(-1)![0])).toContain('/employees/e-1/memory/journal')
  })

  it('non-2xx surfaces as ApiError with the envelope', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, ENVELOPE))
    await expect(deleteServerEmployee('e-x')).rejects.toBeInstanceOf(ApiError)
  })
})

describe('server library client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const ARTIFACT = {
    id: 'a-1', title: 'Weekly report', kind: 'report', markdown: '# Report',
    provenance: 'provider-generated', generatedBy: { providerId: 'p-1', modelId: 'm-1' },
    taskId: null, sourceConversationId: null, sourceMessageId: null, versionCount: 2,
    createdAt: 1, updatedAt: 2,
  }

  it('lists artifacts and versions', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [ARTIFACT] }))
    const items = await listServerArtifacts()
    expect(items[0]!.versionCount).toBe(2)

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { items: [{ version: 1, title: 'Weekly report', markdown: '# v1', createdAt: 1 }] }),
    )
    await listServerArtifactVersions('a-1')
    expect(String(fetchMock.mock.calls.at(-1)![0])).toContain('/library/artifacts/a-1/versions')
  })

  it('canonical-save posts the full linked-artifact shape', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { artifactId: 'a-1', created: false, recreated: false, title: 'Weekly report', version: 3 }),
    )
    const result = await serverCanonicalSave({
      title: 'Weekly report',
      kind: 'report',
      markdown: '# v3',
      provenance: 'provider-generated',
      generatedBy: { providerId: 'p-1', modelId: 'm-1' },
      taskId: null,
      sourceConversationId: 'c-1',
      sourceMessageId: null,
      linkedArtifactId: 'a-1',
    })
    expect(result.version).toBe(3)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/api/v1/library/canonical-save')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toMatchObject({ linkedArtifactId: 'a-1' })
  })

  it('delete sends DELETE and returns void', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(204))
    await expect(deleteServerArtifact('a-1')).resolves.toBeUndefined()
    const [, init] = fetchMock.mock.calls.at(-1)!
    expect(init.method).toBe('DELETE')
  })

  it('get artifact by id; create and patch post their bodies', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, ARTIFACT))
    const artifact = await getServerArtifact('a-1')
    expect(artifact.id).toBe('a-1')

    fetchMock.mockResolvedValueOnce(jsonResponse(201, ARTIFACT))
    await createServerArtifact({ title: 'New', kind: 'document', markdown: '# x' })
    let init = fetchMock.mock.calls.at(-1)![1]!
    expect(JSON.parse(init.body as string)).toEqual({ title: 'New', kind: 'document', markdown: '# x' })

    fetchMock.mockResolvedValueOnce(jsonResponse(200, ARTIFACT))
    await patchServerArtifact('a-1', { title: 'Renamed' })
    init = fetchMock.mock.calls.at(-1)![1]!
    expect(init.method).toBe('PATCH')
  })
})

describe('server agents client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists tools with the availability flag (F07)', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        tools: [
          { name: 'read', description: 'Read', mutating: false, gated: false, available: true },
          { name: 'bash', description: 'Shell', mutating: true, gated: true, available: false },
        ],
      }),
    )
    const tools = await listServerAgentTools()
    expect(tools.find((t) => t.name === 'bash')!.available).toBe(false)
  })

  it('starts a run with an idempotency key', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { runId: 'r-1', reused: false }))
    const result = await startServerAgentRun('s-1', { text: 'hello', idempotencyKey: 'k-1' })
    expect(result.reused).toBe(false)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/agent/sessions/s-1/runs')
    expect(JSON.parse(init.body as string)).toEqual({ text: 'hello', idempotencyKey: 'k-1' })
  })

  it('responds to a permission with the emitted requestId (F02)', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(202, { accepted: true }))
    await respondServerAgentPermission('r-1', 'perm-9', 'approve', 'always')
    const [url, init] = fetchMock.mock.calls[0]!
    expect(String(url)).toContain('/agent/runs/r-1/permissions/perm-9')
    expect(JSON.parse(init.body as string)).toEqual({
      decision: { requestId: 'perm-9', decision: 'approve', scope: 'always' },
    })
  })

  it('events URL encodes the F05 cursor contract', () => {
    expect(serverAgentEventsUrl('s-1', -1)).toBe('/api/v1/agent/sessions/s-1/events?after=-1')
    expect(serverAgentEventsUrl('s-1', 4, 'r-2')).toBe(
      '/api/v1/agent/sessions/s-1/events?after=4&runId=r-2',
    )
  })

  it('agent sessions CRUD hits session routes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [] }))
    await listServerAgentSessions()
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/agent/sessions')

    fetchMock.mockResolvedValueOnce(
      jsonResponse(201, {
        id: 's-1', name: 'Research', description: '', mode: 'default', status: 'idle',
        providerId: null, modelId: null, rootDir: 'sessions/s-1', tools: [], archived: false,
        createdAt: 1, updatedAt: 1,
      }),
    )
    await createServerAgentSession({ name: 'Research' })
    expect(fetchMock.mock.calls.at(-1)![1]!.method).toBe('POST')

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        id: 's-1', name: 'Research 2', description: '', mode: 'plan', status: 'idle',
        providerId: null, modelId: null, rootDir: 'sessions/s-1', tools: [], archived: false,
        createdAt: 1, updatedAt: 2,
      }),
    )
    await patchServerAgentSession('s-1', { mode: 'plan' })
    expect(String(fetchMock.mock.calls.at(-1)![0])).toContain('/agent/sessions/s-1')

    fetchMock.mockResolvedValueOnce(jsonResponse(204))
    await deleteServerAgentSession('s-1')
    const deleteInit = fetchMock.mock.calls.at(-1)![1]!
    expect(deleteInit.method).toBe('DELETE')
  })

  it('cancel and get hit their routes', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 'r-1', sessionId: 's-1', status: 'complete', inputText: '', outputText: 'ok', providerId: null, modelId: null, errorCode: null, errorMessage: null, createdAt: 1, finishedAt: 2 }))
    await getServerAgentRun('r-1')
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/agent/runs/r-1')

    fetchMock.mockResolvedValueOnce(jsonResponse(202, { outcome: 'cancelled' }))
    await cancelServerAgentRun('r-1')
    const [, init] = fetchMock.mock.calls.at(-1)!
    expect(init.method).toBe('POST')
  })
})

describe('server routines client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lists routines at the exact route', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(200, { items: [{ id: 'r-1' }] }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const items = await listServerRoutines()
    expect(items).toEqual([{ id: 'r-1' }])
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/routines',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('fetches a routine with its run history', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse(200, { routine: { id: 'r-1' }, runs: [{ id: 'rr-1' }] }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const detail = await getServerRoutine('r-1')
    expect(detail.routine.id).toBe('r-1')
    expect(detail.runs[0]!.id).toBe('rr-1')
    const url = fetchMock.mock.calls[0]?.[0]
    expect(String(url)).toBe('/api/v1/routines/r-1')
  })

  it('creates with the exact payload shape', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(201, { id: 'r-2' }))
    vi.stubGlobal('fetch', fetchMock)
    await createServerRoutine({
      name: 'Morning brief',
      prompt: 'Summarize.',
      schedule: '30 9 * * 1-5',
      catchUpMinutes: 30,
    })
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/v1/routines')
    expect(init.method).toBe('POST')
    expect(JSON.parse(String(init.body))).toEqual({
      name: 'Morning brief',
      prompt: 'Summarize.',
      schedule: '30 9 * * 1-5',
      catchUpMinutes: 30,
    })
  })

  it('patches and deletes at the id-scoped routes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(200, { id: 'r-1', paused: true }))
      .mockResolvedValueOnce(jsonResponse(204))
    vi.stubGlobal('fetch', fetchMock)
    const patched = await patchServerRoutine('r-1', { paused: true })
    expect(patched.paused).toBe(true)
    const [patchUrl, patchInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(patchUrl).toBe('/api/v1/routines/r-1')
    expect(patchInit.method).toBe('PATCH')

    await deleteServerRoutine('r-1')
    const [deleteUrl, deleteInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit]
    expect(deleteUrl).toBe('/api/v1/routines/r-1')
    expect(deleteInit.method).toBe('DELETE')
  })

  it('turns a validation error into a typed ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(400, ENVELOPE)))
    await expect(createServerRoutine({ name: '', prompt: '', schedule: 'nope' })).rejects.toBeInstanceOf(ApiError)
  })
})
