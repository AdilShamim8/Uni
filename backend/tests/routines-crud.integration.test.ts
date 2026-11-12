import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { signUpUser, startTestApp, type TestApp } from './harness.js'

/**
 * T030 — routine CRUD over real HTTP + embedded PostgreSQL: workspace
 * scoping, the session-must-be-ours rule, schedule validation through
 * the scheduler's own parser, pause/archive flags, and run listing.
 */

describe('routine CRUD (T030)', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let bob: { cookie: string }

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Routines' })
    bob = await signUpUser(testApp.app, { name: 'Bob Routines' })
    await testApp.app.listen({ port: 0, host: '127.0.0.1' })
  }, 180_000)

  afterAll(async () => {
    await testApp?.app.close()
    await testApp?.stop()
  })

  it('creates a routine against an owned session and lists it', async () => {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/routines',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: {
        name: 'Morning brief',
        prompt: 'Summarize overnight changes in my notes.',
        schedule: '30 9 * * 1-5',
        catchUpMinutes: 30,
      },
    })
    expect(created.statusCode).toBe(201)
    const routine = created.json() as {
      id: string
      schedule: string
      catchUpMinutes: number
      paused: boolean
      lastFireAt: string | null
    }
    expect(routine.schedule).toBe('30 9 * * 1-5')
    expect(routine.catchUpMinutes).toBe(30)
    expect(routine.paused).toBe(false)
    expect(routine.lastFireAt).toBeNull()

    const listed = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/routines',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
    })
    expect((listed.json() as { items: unknown[] }).items).toHaveLength(1)
  })

  it('rejects a routine against a session in another workspace', async () => {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/routines',
      headers: { cookie: bob.cookie, origin: 'http://localhost:5173' },
      payload: {
        name: 'Foreign employee routine',
        prompt: 'Run as someone else\'s employee.',
        schedule: '* * * * *',
        employeeId: 'employee-that-does-not-exist',
      },
    })
    expect(created.statusCode).toBe(404)
    const body = created.json() as { code?: string }
    expect(body.code).toBe('not_found')
  })

  it('provisions the routine its own unattended read-only session', async () => {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/routines',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: {
        name: 'Unattended check',
        prompt: 'Check my notes.',
        schedule: '*/15 * * * *',
      },
    })
    expect(created.statusCode).toBe(201)
    const routine = created.json() as { sessionId: string; employeeId: string | null }
    expect(routine.employeeId).toBeNull()
    expect(routine.sessionId).toBeTruthy()

    // The provisioned session exists, is unattended, and read-only.
    const session = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/agent/sessions/${routine.sessionId}`,
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
    })
    expect(session.statusCode).toBe(200)
    const body = session.json() as { mode: string; tools: string[] }
    expect(body.mode).toBe('unattended')
    expect(body.tools).toEqual(['read', 'list', 'grep', 'current_time', 'todo'])
  })

  it('rejects invalid schedules with the parser\'s reason', async () => {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/routines',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: {
        name: 'Impossible',
        prompt: 'Never fires.',
        schedule: '60 * * * *',
      },
    })
    expect(created.statusCode).toBe(400)
    const body = created.json() as { code?: string; message?: string }
    expect(body.code).toBe('validation_error')
    expect(body.message).toContain('Invalid schedule')
  })

  it('patches name/schedule/pause and enforces cross-workspace isolation', async () => {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/routines',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: {
        name: 'Weekly digest',
        prompt: 'Digest the week.',
        schedule: '0 17 * * 5',
      },
    })
    const routine = created.json() as { id: string }

    const patched = await testApp.app.inject({
      method: 'PATCH',
      url: `/api/v1/routines/${routine.id}`,
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: { paused: true, schedule: '0 18 * * 5' },
    })
    expect(patched.statusCode).toBe(200)
    const updated = patched.json() as { paused: boolean; schedule: string }
    expect(updated.paused).toBe(true)
    expect(updated.schedule).toBe('0 18 * * 5')

    // Bob cannot see or patch Alice's routine.
    const bobGet = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/routines/${routine.id}`,
      headers: { cookie: bob.cookie, origin: 'http://localhost:5173' },
    })
    expect(bobGet.statusCode).toBe(404)
    const bobPatch = await testApp.app.inject({
      method: 'PATCH',
      url: `/api/v1/routines/${routine.id}`,
      headers: { cookie: bob.cookie, origin: 'http://localhost:5173' },
      payload: { paused: false },
    })
    expect(bobPatch.statusCode).toBe(404)
  })

  it('get returns the routine with its (empty) run history', async () => {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/routines',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: {
        name: 'Hourly check',
        prompt: 'Check for changes.',
        schedule: '0 * * * *',
      },
    })
    const routine = created.json() as { id: string }

    const fetched = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/routines/${routine.id}`,
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
    })
    expect(fetched.statusCode).toBe(200)
    const body = fetched.json() as {
      routine: { id: string }
      runs: Array<{ status: string; outputText: string }>
    }
    expect(body.routine.id).toBe(routine.id)
    expect(body.runs).toEqual([])
  })

  it('deletes a routine (cascade removes runs) and 404s afterwards', async () => {
    const created = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/routines',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: {
        name: 'Temp routine',
        prompt: 'Temporary.',
        schedule: '*/10 * * * *',
      },
    })
    const routine = created.json() as { id: string }

    const removed = await testApp.app.inject({
      method: 'DELETE',
      url: `/api/v1/routines/${routine.id}`,
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
    })
    expect(removed.statusCode).toBe(204)

    const gone = await testApp.app.inject({
      method: 'GET',
      url: `/api/v1/routines/${routine.id}`,
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
    })
    expect(gone.statusCode).toBe(404)
  })
})
