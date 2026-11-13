import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { signUpUser, startTestApp, type TestApp } from './harness.js'
import { createDatabase } from '../src/db/client.js'
import { routines, routineRuns } from '../src/db/schema.js'

/**
 * B07 — workspace export over real HTTP + embedded PostgreSQL: the
 * endpoint returns a complete snapshot of the caller's own workspace
 * (employees, memory notes, routines, knowledge files with extracted
 * text), with counts derived from the same rows it serializes, and
 * never a byte of another workspace's data.
 */

describe('workspace export (B07)', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let bob: { cookie: string }

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Export' })
    bob = await signUpUser(testApp.app, { name: 'Bob Export' })
    await testApp.app.listen({ port: 0, host: '127.0.0.1' })
  }, 180_000)

  afterAll(async () => {
    await testApp?.app.close()
    await testApp?.stop()
  })

  it('exports the complete workspace with honest counts, isolated from others', async () => {
    // Seed Alice's workspace through the real APIs.
    const employee = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/employees',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: { name: 'Researcher', description: 'Finds things', instructions: 'Be terse.' },
    })
    expect(employee.statusCode).toBe(201)
    const employeeId = (employee.json() as { id: string }).id

    const note = await testApp.app.inject({
      method: 'POST',
      url: `/api/v1/employees/${employeeId}/memory`,
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: { text: 'Prefers bullet-point answers.' },
    })
    expect(note.statusCode).toBe(201)

    const routine = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/routines',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: {
        name: 'Morning brief',
        prompt: 'Summarize.',
        schedule: '30 9 * * 1-5',
        catchUpMinutes: 30,
      },
    })
    expect(routine.statusCode).toBe(201)

    const file = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/files',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      payload: {
        title: 'Q3 notes',
        fileName: 'q3.md',
        content: 'Ship the export endpoint.',
      },
    })
    expect(file.statusCode).toBe(201)

    // Bob has his own data that must never leak into Alice's export.
    const bobEmployee = await testApp.app.inject({
      method: 'POST',
      url: '/api/v1/employees',
      headers: { cookie: bob.cookie, origin: 'http://localhost:5173' },
      payload: { name: 'Bob Private' },
    })
    expect(bobEmployee.statusCode).toBe(201)

    // Alice's export: complete and honest.
    const exported = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/workspace/export',
      headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
    })
    expect(exported.statusCode).toBe(200)
    expect(exported.headers['content-disposition']).toContain('uni-workspace-export-')

    const body = exported.json() as {
      format: string
      employees: Array<{ id: string; name: string; instructions: string }>
      memoryNotes: Array<{ employeeId: string; text: string }>
      routines: Array<{ name: string; schedule: string }>
      files: Array<{ title: string; extractedText: string }>
      counts: { employees: number; memoryNotes: number; routines: number; files: number }
    }

    expect(body.format).toBe('uni.workspace.export/1')
    expect(body.employees.length).toBe(1)
    expect(body.employees[0]!.name).toBe('Researcher')
    expect(body.employees[0]!.instructions).toBe('Be terse.')
    expect(body.memoryNotes.length).toBe(1)
    expect(body.memoryNotes[0]!.text).toBe('Prefers bullet-point answers.')
    expect(body.routines.length).toBe(1)
    expect(body.routines[0]!.schedule).toBe('30 9 * * 1-5')
    expect(body.files.length).toBe(1)
    expect(body.files[0]!.extractedText).toBe('Ship the export endpoint.')

    // Counts are derived from the arrays — same rows, no drift.
    expect(body.counts).toEqual({
      employees: body.employees.length,
      memoryNotes: body.memoryNotes.length,
      memoryJournal: body.memoryJournal.length,
      routineRuns: body.routineRuns.length,
      routines: body.routines.length,
      files: body.files.length,
    })

    // None of Bob's data appears.
    expect(body.employees.some((entry) => entry.name === 'Bob Private')).toBe(false)

    // Bob's export contains only his own employee.
    const bobsExport = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/workspace/export',
      headers: { cookie: bob.cookie, origin: 'http://localhost:5173' },
    })
    expect(bobsExport.statusCode).toBe(200)
    const bobBody = bobsExport.json() as { employees: Array<{ name: string }> }
    expect(bobBody.employees.length).toBe(1)
    expect(bobBody.employees[0]!.name).toBe('Bob Private')
  })

  it('exports the memory journal with the notes it audits (RF-084)', async () => {
    const test = await startTestApp()
    try {
      const alice = await signUpUser(test.app, { name: 'Alice Journal' })
      const employee = await test.app.inject({
        method: 'POST',
        url: '/api/v1/employees',
        headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
        payload: { name: 'Audited one', description: 'journal export target' },
      })
      const employeeId = (employee.json() as { id: string }).id
      await test.app.inject({
        method: 'POST',
        url: `/api/v1/employees/${employeeId}/memory`,
        headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
        payload: { text: 'First fact' },
      })

      const exportResponse = await test.app.inject({
        method: 'GET',
        url: '/api/v1/workspace/export',
        headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      })
      expect(exportResponse.statusCode).toBe(200)
      const body = exportResponse.json() as {
        memoryJournal: Array<{
          employeeId: string
          kind: string
          actor: string
          diff: string
        }>
        counts: { memoryJournal: number }
      }
      // The add created exactly one journal entry, and it travelled.
      expect(body.counts.memoryJournal).toBe(1)
      expect(body.memoryJournal).toHaveLength(1)
      expect(body.memoryJournal[0]!.employeeId).toBe(employeeId)
      expect(body.memoryJournal[0]!.kind).toBe('created')
      expect(body.memoryJournal[0]!.diff).toContain('First fact')
    } finally {
      await test.stop()
    }
  }, 180_000)

  it('exports the latest routine runs with their outputs (RF-085)', async () => {
    const test = await startTestApp()
    try {
      const alice = await signUpUser(test.app, { name: 'Alice Runs' })
      const created = await test.app.inject({
        method: 'POST',
        url: '/api/v1/routines',
        headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
        payload: { name: 'Exported routine', prompt: 'Do work.', schedule: '0 9 * * *' },
      })
      expect(created.statusCode).toBe(201)
      const routineId = (created.json() as { id: string }).id

      // Seed one completed run row directly — the scheduler itself is
      // exercised elsewhere; the export contract is what is under test.
      const database = createDatabase(test.databaseUrl)
      try {
        const routineRow = (
          await database.db.select().from(routines).where(eq(routines.id, routineId))
        )[0]!
        await database.db.insert(routineRuns).values({
          id: 'run-export-1',
          workspaceId: routineRow.workspaceId,
          routineId,
          scheduledFor: new Date('2026-11-13T09:00:00Z'),
          status: 'complete',
          outputText: 'Fire output that must travel',
          terminalAt: new Date('2026-11-13T09:00:02Z'),
        })
      } finally {
        await database.pool.end()
      }

      const exportResponse = await test.app.inject({
        method: 'GET',
        url: '/api/v1/workspace/export',
        headers: { cookie: alice.cookie, origin: 'http://localhost:5173' },
      })
      expect(exportResponse.statusCode).toBe(200)
      const body = exportResponse.json() as {
        routineRuns: Array<{
          routineId: string
          status: string
          outputText: string
        }>
        counts: { routineRuns: number }
      }
      expect(body.counts.routineRuns).toBe(1)
      expect(body.routineRuns).toHaveLength(1)
      expect(body.routineRuns[0]!.routineId).toBe(routineId)
      expect(body.routineRuns[0]!.status).toBe('complete')
      expect(body.routineRuns[0]!.outputText).toContain('Fire output that must travel')
    } finally {
      await test.stop()
    }
  }, 180_000)

  it('requires a session (401 without one)', async () => {
    const unauthenticated = await testApp.app.inject({
      method: 'GET',
      url: '/api/v1/workspace/export',
    })
    expect(unauthenticated.statusCode).toBe(401)
  })
})
