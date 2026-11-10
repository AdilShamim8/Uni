import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { saveTaskReportToLibrary } from '@/services/work/canonicalSave'
import { useLibraryStore } from '@/state/libraryStore'
import { useWorkStore } from '@/state/workStore'
import { useServerSessionStore } from '@/state/serverSessionStore'
import { useAppStore } from '@/state/store'

/**
 * T017 — canonical saves mirror to the server Library in server mode:
 * the first save records the server twin on the local artifact, the
 * second save passes it as linkedArtifactId (immutable versions, no
 * twins), and local mode never calls the network.
 */

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('canonical save server mirror (T017)', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    useLibraryStore.setState({ hydrated: true, artifacts: {}, projects: {} })
  })
  afterEach(() => {
    useServerSessionStore.getState().resetForTests()
    useAppStore.getState().dismissToast()
  })

  function makeReportedTask(markdown = '# Report body'): string {
    const taskId = useWorkStore.getState().createTask({
      title: 'Server mirror task',
      goal: 'Produce a report',
      deliverable: 'research-report',
    })
    const task = useWorkStore.getState().tasks[taskId]!
    useWorkStore.setState({
      tasks: {
        ...useWorkStore.getState().tasks,
        [taskId]: {
          ...task,
          report: {
            ...task.report,
            markdown,
            template: 'research',
            provenance: 'demo-simulation',
            generatedBy: null,
          },
        },
      },
    } as Partial<ReturnType<typeof useWorkStore.getState>>)
    return taskId
  }

  it('local mode saves locally without any network call', async () => {
    useServerSessionStore.setState({ status: 'signed-out', account: null })
    const taskId = makeReportedTask()

    const result = await saveTaskReportToLibrary(taskId)
    expect(result.created).toBe(true)
    expect(fetchMock).not.toHaveBeenCalled()
    const artifact = useLibraryStore.getState().artifacts[result.artifactId]!
    expect(artifact.serverArtifactId ?? null).toBeNull()
  })

  it('server mode mirrors through canonical-save and links the twin', async () => {
    useServerSessionStore.setState({ status: 'signed-in', account: null })
    const taskId = makeReportedTask()

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { artifactId: 'srv-1', created: true, recreated: false, title: 'Server mirror task', version: 1 }),
    )
    const result = await saveTaskReportToLibrary(taskId)
    expect(result.created).toBe(true)

    const mirrorCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes('/api/v1/library/canonical-save'),
    )
    expect(mirrorCall).toBeDefined()
    const body = JSON.parse(mirrorCall![1]!.body as string)
    expect(body).toMatchObject({ title: 'Server mirror task', kind: 'report', linkedArtifactId: null })

    const artifact = useLibraryStore.getState().artifacts[result.artifactId]!
    expect(artifact.serverArtifactId).toBe('srv-1')
  })

  it('a second save passes the linked server id (no server twin)', async () => {
    useServerSessionStore.setState({ status: 'signed-in', account: null })
    const taskId = makeReportedTask('# First version')

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { artifactId: 'srv-1', created: true, recreated: false, title: 'Server mirror task', version: 1 }),
    )
    const first = await saveTaskReportToLibrary(taskId)
    expect(useLibraryStore.getState().artifacts[first.artifactId]!.serverArtifactId).toBe('srv-1')

    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { artifactId: 'srv-1', created: false, recreated: false, title: 'Server mirror task', version: 2 }),
    )
    const second = await saveTaskReportToLibrary(taskId)
    expect(second.created).toBe(false)
    expect(second.artifactId).toBe(first.artifactId)

    const bodies = fetchMock.mock.calls
      .filter((call) => String(call[0]).includes('/library/canonical-save'))
      .map((call) => JSON.parse(call[1]!.body as string))
    expect(bodies).toHaveLength(2)
    expect(bodies[1]!.linkedArtifactId).toBe('srv-1')
  })

  it('a server failure never blocks the local save', async () => {
    useServerSessionStore.setState({ status: 'signed-in', account: null })
    const taskId = makeReportedTask()

    fetchMock.mockRejectedValueOnce(new Error('network down'))
    const result = await saveTaskReportToLibrary(taskId)
    expect(result.created).toBe(true)
    expect(useLibraryStore.getState().artifacts[result.artifactId]!.serverArtifactId ?? null).toBeNull()
  })
})
