import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  answerServerWorkTask,
  cancelServerWorkTask,
  createServerWorkTask,
  getServerWorkTask,
  listServerWorkTasks,
  startServerWorkTask,
} from '@/services/api/serverWork'

/**
 * Server Work API client (T019): list/detail/create plus the three
 * actions — every call goes through the typed apiFetch adapter.
 */
function jsonResponse(status: number, body?: unknown): Response {
  if (status === 204) return new Response(null, { status })
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('serverWork client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('lists tasks without the cancelled flag by default', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [] }))
    await listServerWorkTasks()
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/work/tasks')
  })

  it('lists tasks including cancelled ones when asked', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { items: [] }))
    await listServerWorkTasks(true)
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/work/tasks?includeCancelled=true')
  })

  it('fetches a task with its runs', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { task: { id: 'task_1' }, runs: [] }))
    const detail = await getServerWorkTask('task_1')
    expect(detail.task).toMatchObject({ id: 'task_1' })
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/work/tasks/task_1')
  })

  it('creates a task by POST with the typed body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { id: 'task_2', status: 'draft' }))
    const task = await createServerWorkTask({ title: 'Research competitors' })
    expect(task).toMatchObject({ id: 'task_2' })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/work/tasks')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ title: 'Research competitors' })
  })

  it('start sends the start action and returns the run', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { task: { id: 'task_1' }, run: { id: 'run_1', status: 'running' } }),
    )
    const started = await startServerWorkTask('task_1')
    expect(started.run).toMatchObject({ status: 'running' })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ action: 'start' })
  })

  it('cancel sends the cancel action', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { cancelled: true }))
    await cancelServerWorkTask('task_1')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ action: 'cancel' })
  })

  it('answer carries the answer text', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { task: { id: 'task_1' }, run: { id: 'run_2', status: 'running' } }),
    )
    await answerServerWorkTask('task_1', 'Use source A.')
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).toEqual({ action: 'answer', answer: 'Use source A.' })
  })
})
