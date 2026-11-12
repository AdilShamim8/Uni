import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { signUpUser, startTestApp, type TestApp } from './harness.js'
import { runSchedulerTick, type RoutineFire } from '../src/modules/routines/routines.scheduler.js'
import type { RoutinesDatabase } from '../src/modules/routines/routines.service.js'
import type { AgentDatabase } from '../src/modules/agent/agentSession.service.js'

/**
 * T031 — the scheduler tick over real PostgreSQL: claims due fires
 * with slot semantics (one pending/running fire per routine), respects
 * the paused/archived flags, ignores already-claimed minutes through
 * the unique index, and updates lastFireAt on claim.
 */

async function createRoutine(
  app: TestApp['app'],
  cookie: string,
  schedule: string,
): Promise<string> {
  const created = await app.inject({
    method: 'POST',
    url: '/api/v1/routines',
    headers: { cookie, origin: 'http://localhost:5173' },
    payload: {
      name: 'Tick test routine',
      prompt: 'Summarize.',
      schedule,
    },
  })
  expect(created.statusCode).toBe(201)
  return (created.json() as { id: string; sessionId: string }).id
}

describe('routine scheduler tick (T031)', () => {
  let testApp: TestApp
  let alice: { cookie: string }
  let db: RoutinesDatabase & AgentDatabase
  const fires: RoutineFire[] = []

  beforeAll(async () => {
    testApp = await startTestApp()
    alice = await signUpUser(testApp.app, { name: 'Alice Scheduler' })
    db = (testApp.app as unknown as { database: { db: RoutinesDatabase } }).database.db
    await testApp.app.listen({ port: 0, host: '127.0.0.1' })
  }, 180_000)

  afterAll(async () => {
    await testApp?.app.close()
    await testApp?.stop()
  })

  it('claims a due fire and hands it to the executor', async () => {
    await createRoutine(testApp.app, alice.cookie, '* * * * *')
    const now = new Date()
    const result = await runSchedulerTick(db, async (fire) => {
      fires.push(fire)
    }, now)

    expect(result.considered).toBe(1)
    expect(result.claimed).toBe(1)
    expect(fires).toHaveLength(1)
    expect(fires[0]!.prompt).toBe('Summarize.')
    expect(fires[0]!.sessionId).toBeTruthy()

    // The claimed minute is the current minute, truncated.
    const currentMinute = Math.floor(now.getTime() / 60_000) * 60_000
    expect(fires[0]!.scheduledFor.getTime()).toBe(currentMinute)
  })

  it('holds the slot: a second tick while pending claims nothing', async () => {
    const result = await runSchedulerTick(db, async () => {
      /* nothing */
    }, new Date(fires[0]!.scheduledFor.getTime() + 30_000))
    expect(result.claimed).toBe(0)
    expect(result.skippedBusy).toBe(1)
  })

  it('re-claims after the previous fire reaches a terminal status', async () => {
    // Simulate the executor finishing the first fire.
    await db.execute(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (await import('drizzle-orm')).sql`UPDATE routine_run SET status = 'complete', output_text = 'done', terminal_at = now() WHERE id = ${fires[0]!.runId}`,
    )
    const result = await runSchedulerTick(db, async () => {
      /* executor */
    }, new Date(fires[0]!.scheduledFor.getTime() + 90_000))
    expect(result.claimed).toBe(1)
  })

  it('never fires a paused or archived routine', async () => {
    const routineId = await createRoutine(testApp.app, alice.cookie, '* * * * *')
    const { eq } = await import('drizzle-orm')
    const { routines } = await import('../src/db/schema.js')

    // Baseline while the routine is ACTIVE: it is considered.
    const active = await runSchedulerTick(db, async () => {}, new Date())
    expect(active.considered).toBeGreaterThanOrEqual(2)

    // Paused: filtered out at the query level.
    await db.update(routines).set({ paused: true }).where(eq(routines.id, routineId))
    const paused = await runSchedulerTick(db, async () => {}, new Date())
    expect(paused.considered).toBe(active.considered - 1)

    // Archived (unpaused): also filtered out.
    await db.update(routines).set({ paused: false, archived: true }).where(eq(routines.id, routineId))
    const archived = await runSchedulerTick(db, async () => {}, new Date())
    expect(archived.considered).toBe(active.considered - 1)
  })

  it('ignores an already-claimed minute through the unique index', async () => {
    // A routine whose last claimed minute is the current one (e.g. by a
    // concurrent process): the onConflictDoNothing insert claims nothing.
    const routineId = await createRoutine(testApp.app, alice.cookie, '* * * * *')
    const now = new Date()
    // First claim succeeds.
    const first = await runSchedulerTick(db, async () => {}, now)
    expect(first.claimed).toBeGreaterThanOrEqual(1)
    // Complete everything so slots are free again.
    const { sql } = await import('drizzle-orm')
    await db.execute(sql`UPDATE routine_run SET status = 'complete', terminal_at = now()`)
    // Same minute again → the unique index blocks a second fire for it.
    const second = await runSchedulerTick(db, async () => {}, now)
    const routineClaims = second.claimed
    expect(routineClaims).toBeLessThan(first.claimed + 1)
    // And specifically the pre-claimed routine contributed no new fire.
    const fires = await db.execute(
      sql`SELECT COUNT(*)::int AS count FROM routine_run WHERE routine_id = ${routineId}`,
    )
    const count = (fires.rows[0] as { count: number }).count
    expect(count).toBeLessThanOrEqual(1)
  })
})
