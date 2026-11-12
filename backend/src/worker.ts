import 'dotenv/config'
import { loadEnv } from './config/env.js'
import { createLogger } from './lib/logger.js'
import { createDatabase } from './db/client.js'
import { runMigrations } from './db/migrate.js'
import PgBoss from 'pg-boss'
import { AGENT_RUN_QUEUE, dispatchOutbox, pruneOutbox, type JobPayload } from './modules/jobs/outbox.service.js'
import { resumeAgentRun, reconcileStuckAgentRuns } from './modules/agent/agentRun.service.js'
import { runSchedulerTick } from './modules/routines/routines.scheduler.js'
import { executeRoutineFire } from './modules/routines/routines.executor.js'

/**
 * The durable worker (T013). Runs the agent-run execution loop off a
 * pg-boss queue so execution survives API-process restarts:
 *
 * - Ownership: pg-boss's job state machine (created → active →
 *   complete/failed) means TWO workers cannot hold the same job:
 *   claiming is an atomic UPDATE ... WHERE state='created', so the
 *   second worker sees nothing to claim.
 * - Leases: an active job past its expiry returns to created and is
 *   re-claimed after a restart — reconcileStuckAgentRuns first turns
 *   any run rows left 'running' by a dead worker into honest
 *   interrupted errors, so a re-delivered attempt never resumes a
 *   zombie.
 * - Restart recovery: on boot, stuck runs are reconciled BEFORE the
 *   queue is drained.
 * - Credentials: the payload carries identifiers only; the worker
 *   resolves the encrypted credential from the database at execution
 *   time (never through the queue).
 * - Uncertain side effects: run execution is resumable only when its
 *   persisted state says it never started streaming (no terminal, no
 *   provider call evidence); anything else reconciles to an honest
 *   error instead of replaying a possibly-performed provider call.
 */

async function main(): Promise<void> {
  const env = loadEnv()
  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for the worker.')
  }
  const logger = createLogger(env).child({ component: 'worker' })
  await runMigrations(env.DATABASE_URL)

  const { pool, db } = createDatabase(env.DATABASE_URL)
  const boss = new PgBoss({
    connectionString: env.DATABASE_URL,
    // Supervisor polls at this cadence; job claiming itself is atomic.
    pollingIntervalSeconds: 1,
  })
  boss.on('error', (error: unknown) => {
    logger.error({ err: error instanceof Error ? error.message : String(error) }, 'pg-boss error')
  })

  await boss.start()
  logger.info('pg-boss started; reconciling stuck runs before draining the queue')

  // Restart recovery: honest terminals for runs orphaned by a dead
  // worker, BEFORE any queued attempt for them executes.
  await reconcileStuckAgentRuns({ db, env })

  await boss.work<JobPayload>(AGENT_RUN_QUEUE, { batchSize: 1 }, async (jobs) => {
    for (const job of jobs) {
      const payload = job.data
      try {
        await resumeAgentRun({ db, env }, payload)
      } catch (error) {
        // Handler errors fail the job (pg-boss retry policy applies);
        // resumeAgentRun itself already wrote an honest terminal for
        // execution failures, so this is bookkeeping, not silence.
        logger.error(
          { runId: payload.runId, err: error instanceof Error ? error.message : String(error) },
          'agent-run job failed',
        )
        throw error
      }
    }
  })

  // Outbox dispatcher: the transactional enqueue side closes the
  // run-row/queue gap; this loop moves committed rows into the queue.
  const dispatchTimer = setInterval(() => {
    void dispatchOutbox(db, boss, logger).catch(() => {
      /* logged inside */
    })
  }, 500)
  const pruneTimer = setInterval(() => {
    void pruneOutbox(db).catch(() => {
      /* retention pruning is best-effort */
    })
  }, 60 * 60 * 1000)

  // Routine scheduler (P09 / T031): a minute-cadence tick that claims
  // due fires and executes them through the same engine + worker deps
  // (idempotent claims; slot semantics per routine). Runs on the worker
  // process only — the API process never fires routines.
  const routineTimer = setInterval(() => {
    void runSchedulerTick(db, (fire) => executeRoutineFire({ db, env }, fire))
      .then((result) => {
        if (result.claimed > 0) {
          logger.info(
            { claimed: result.claimed, considered: result.considered },
            'routine tick fired',
          )
        }
      })
      .catch((error: unknown) => {
        logger.error(
          { err: error instanceof Error ? error.message : String(error) },
          'routine tick failed',
        )
      })
  }, 60_000)
  // Fire once shortly after boot so a restart does not skip a due minute
  // (the claim is idempotent; nothing double-fires).
  setTimeout(() => {
    void runSchedulerTick(db, (fire) => executeRoutineFire({ db, env }, fire)).catch(() => {
      /* logged by the interval path on the next tick */
    })
  }, 5_000)

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'worker shutting down')
    clearInterval(dispatchTimer)
    clearInterval(pruneTimer)
    clearInterval(routineTimer)
    await boss.stop({ graceful: true, timeout: 10_000 }).catch(() => undefined)
    await pool.end().catch(() => undefined)
    process.exit(0)
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  logger.info('worker draining the agent-run queue')
}

main().catch((error) => {
  console.error('worker failed to start:', error)
  process.exit(1)
})
