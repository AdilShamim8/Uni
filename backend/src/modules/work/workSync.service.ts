import { and, asc, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { workTasks, workRuns, agentEvents } from '../../db/schema.js'
import { workRunReceiptsSchema, type WorkRunReceipts } from '@uni/contracts'

/**
 * T020 — sync agent-run outcomes into the Work rows, with receipts.
 *
 * When an agent run that a Work task delegated to reaches a terminal
 * state, the task's status and the work_run row must follow honestly:
 * complete → complete (the report is the run's output text); stopped →
 * cancelled; error → error. Receipts are assembled from the run's OWN
 * persisted events (what actually happened), never from guesses: tool
 * outcomes from tool_call_result rows, sources from the tool inputs
 * that referenced them (file paths, urls), and provenance from the
 * session's provider pin (a pinned provider means provider-generated).
 *
 * The sync is idempotent: a work_run row whose status is already
 * terminal is left alone, so a late replay cannot flip an outcome.
 */

export type WorkSyncDatabase = NodePgDatabase<typeof schema>

/** Map an agent-run terminal status to the Work task/run states. */
function mapOutcome(status: string): { run: 'complete' | 'stopped' | 'error'; task: 'complete' | 'cancelled' | 'error'; label: string } {
  if (status === 'complete') {
    return { run: 'complete', task: 'complete', label: 'Complete' }
  }
  if (status === 'stopped') {
    return { run: 'stopped', task: 'cancelled', label: 'Stopped' }
  }
  return { run: 'error', task: 'error', label: 'Failed' }
}

/**
 * Receipts from the run's persisted events — bounded and secret-free by
 * construction (the events themselves are already bounded and
 * user-safe; we only re-shape them).
 */
async function receiptsForRun(
  db: WorkSyncDatabase,
  workspaceId: string,
  runId: string,
): Promise<WorkRunReceipts> {
  const events = await db
    .select()
    .from(agentEvents)
    .where(and(eq(agentEvents.workspaceId, workspaceId), eq(agentEvents.runId, runId)))
    .orderBy(asc(agentEvents.sequence))
    .limit(1_000)

  const tools: WorkRunReceipts['tools'] = []
  const sources: WorkRunReceipts['sources'] = []
  const seenTools = new Set<string>()
  const seenSources = new Set<string>()

  for (const event of events) {
    if (event.type === 'tool_call_result') {
      const payload = event.payload as {
        toolName?: string
        toolResultStatus?: 'ok' | 'error' | 'denied'
        toolOutput?: string
      }
      if (!payload.toolName) continue
      const key = `${event.sequence}`
      if (!seenTools.has(key)) {
        seenTools.add(key)
        tools.push({
          tool: payload.toolName.slice(0, 100),
          outcome: payload.toolResultStatus ?? 'ok',
          detail: (payload.toolOutput ?? '').slice(0, 2_000),
          at: event.createdAt ? event.createdAt.getTime() : 0,
        })
      }
      continue
    }
    if (event.type === 'tool_call_started') {
      // Source ids the run actually read: file paths from read/grep/list,
      // urls from web_fetch. Only what the model asked for, verbatim.
      const payload = event.payload as { toolName?: string; toolInput?: Record<string, unknown> }
      if (!payload.toolName || !payload.toolInput) continue
      if (payload.toolName === 'web_fetch' && typeof payload.toolInput.url === 'string') {
        const url = payload.toolInput.url.slice(0, 300)
        const key = `url:${url}`
        if (!seenSources.has(key)) {
          seenSources.add(key)
          sources.push({ kind: 'url', id: url })
        }
      } else if (
        (payload.toolName === 'read' || payload.toolName === 'grep' || payload.toolName === 'list') &&
        typeof payload.toolInput.path === 'string'
      ) {
        const p = payload.toolInput.path.slice(0, 300)
        const key = `file:${p}`
        if (!seenSources.has(key)) {
          seenSources.add(key)
          sources.push({ kind: 'file', id: p })
        }
      }
    }
  }

  return workRunReceiptsSchema.parse({
    sources: sources.slice(0, 200),
    tools: tools.slice(0, 500),
    // The session's provider pin decides provenance; a run without a
    // provider is the honest demo path.
    provenance: 'demo-simulation',
  })
}

/**
 * Sync one agent run's terminal state into its Work task. No-op when
 * the run is not work-bound or already synced. Errors are swallowed by
 * the caller's choice — the agent run's own terminal is already truth.
 */
export async function syncWorkRunOutcome(
  db: WorkSyncDatabase,
  workspaceId: string,
  agentRunId: string,
  terminalStatus: string,
  outputText: string,
  providerWasPinned: boolean,
): Promise<boolean> {
  const rows = await db
    .select()
    .from(workRuns)
    .where(and(eq(workRuns.workspaceId, workspaceId), eq(workRuns.agentRunId, agentRunId)))
    .limit(1)
  const run = rows[0]
  if (!run) return false // not work-bound
  if (run.status !== 'running') return false // idempotent

  const mapped = mapOutcome(terminalStatus)
  const receipts = await receiptsForRun(db, workspaceId, agentRunId)
  if (providerWasPinned) receipts.provenance = 'provider-generated'

  await db
    .update(workRuns)
    .set({
      status: mapped.run,
      outcome:
        terminalStatus === 'error'
          ? 'The run failed before producing the deliverable.'
          : terminalStatus === 'stopped'
            ? 'Stopped by the user; partial output kept.'
            : (outputText.slice(0, 300) || 'Completed.'),
      receipts,
      finishedAt: new Date(),
    })
    .where(eq(workRuns.id, run.id))

  await db
    .update(workTasks)
    .set({
      status: mapped.task,
      statusLabel: mapped.label,
      activeRunId: null,
      updatedAt: new Date(),
    })
    .where(and(eq(workTasks.id, run.taskId), eq(workTasks.workspaceId, workspaceId)))

  return true
}
