import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerRoutine } from '@/services/api/serverRoutines'

/**
 * T033 — the routines slice of the server session store: load/create/
 * pause/remove go through the API client, generation-guarded so a
 * signed-out transition never repopulates state, with honest errors.
 */

const ROUTINE: ServerRoutine = {
  id: 'r-1',
  sessionId: 's-1',
  employeeId: null,
  employeeName: null,
  name: 'Morning brief',
  prompt: 'Summarize.',
  schedule: '30 9 * * 1-5',
  catchUpMinutes: 30,
  paused: false,
  archived: false,
  lastFireAt: null,
  nextFireAt: null,
  createdAt: 1,
  updatedAt: 1,
}

function jsonResponse(status: number, body: unknown): Response {
  // Null-body statuses (204/205/304) must not carry a body — the
  // Response constructor throws otherwise.
  if (status === 204 || status === 205 || status === 304) {
    return new Response(null, { status })
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('serverSessionStore — routines slice', () => {
  beforeEach(() => {
    useServerSessionStore.setState({
      status: 'signed-in',
      sessionGeneration: 1,
      serverRoutines: [],
      serverRoutinesLoading: false,
      serverRoutinesError: null,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads routines into the slice', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { items: [ROUTINE] })),
    )
    await useServerSessionStore.getState().loadServerRoutines()
    expect(useServerSessionStore.getState().serverRoutines).toEqual([ROUTINE])
    expect(useServerSessionStore.getState().serverRoutinesError).toBeNull()
  })

  it('records the honest error when the load fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(500, { code: 'INTERNAL', message: 'boom' })),
    )
    await useServerSessionStore.getState().loadServerRoutines()
    expect(useServerSessionStore.getState().serverRoutines).toEqual([])
    expect(useServerSessionStore.getState().serverRoutinesError).toBeTruthy()
  })

  it('creates a routine and prepends it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(201, ROUTINE)))
    const ok = await useServerSessionStore.getState().createServerRoutineFor({
      name: 'Morning brief',
      prompt: 'Summarize.',
      schedule: '30 9 * * 1-5',
    })
    expect(ok).toBe(true)
    expect(useServerSessionStore.getState().serverRoutines[0]?.id).toBe('r-1')
  })

  it('pause/resume replaces the row in place', async () => {
    useServerSessionStore.setState({ serverRoutines: [ROUTINE] })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(200, { ...ROUTINE, paused: true })),
    )
    const ok = await useServerSessionStore
      .getState()
      .setServerRoutinePausedFor('r-1', true)
    expect(ok).toBe(true)
    expect(useServerSessionStore.getState().serverRoutines[0]?.paused).toBe(true)
  })

  it('removes a routine from the slice after the server deletes it', async () => {
    useServerSessionStore.setState({ serverRoutines: [ROUTINE] })
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(204, null)))
    const ok = await useServerSessionStore.getState().removeServerRoutineFor('r-1')
    expect(ok).toBe(true)
    expect(useServerSessionStore.getState().serverRoutines).toEqual([])
  })

  it('discards stale results after a sign-out (generation guard)', async () => {
    // A gate object dodges control-flow narrowing of a closure-assigned
    // local (which TS would keep typed null at the call site).
    const gate: { release: () => void } = { release: () => {} }
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            gate.release = () => resolve(jsonResponse(200, { items: [ROUTINE] }))
          }),
      ),
    )
    const pending = useServerSessionStore.getState().loadServerRoutines()
    // Sign out while the request is in flight: the generation bumps and
    // the late response must be discarded.
    useServerSessionStore.setState((state) => ({
      status: 'signed-out',
      sessionGeneration: state.sessionGeneration + 1,
      serverRoutines: [],
    }))
    gate.release()
    await pending
    expect(useServerSessionStore.getState().serverRoutines).toEqual([])
  })
})
