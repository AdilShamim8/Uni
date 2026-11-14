import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { exportServerWorkspace } from '@/services/api/serverWorkspace'

/** Server workspace client (B07): the export download. */
describe('serverWorkspace client', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('downloads the workspace export from the versioned route', async () => {
    const exportBody = {
      format: 'uni.workspace.export/1',
      exportedAt: 1,
      employees: [],
      memoryNotes: [],
      memoryJournal: [],
      routines: [],
      routineRuns: [],
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
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(exportBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const downloaded = await exportServerWorkspace()
    expect(downloaded.format).toBe('uni.workspace.export/1')
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('/api/v1/workspace/export')
    expect(init?.method).toBeUndefined()
  })
})
