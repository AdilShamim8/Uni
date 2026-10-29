import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { FastifyBaseLogger } from 'fastify'
import { streamText, type LanguageModel, type ModelMessage } from 'ai'
import type {
  CreateRunRequest,
  CreateRunResponse,
  RunDto,
  RunEvent,
  RunEventPayload,
  RunEventType,
  RunTerminalStatus,
  RunUsage,
} from '@uni/contracts'
import * as schema from '../../db/schema.js'
import {
  conversationNodes,
  conversations,
  providerConnections,
  runEvents,
  runs,
  type RunRow,
} from '../../db/schema.js'
import { badRequest, notFound, rateLimited } from '../../lib/errors.js'
import { decryptSecret, parseMasterKey } from '../../lib/secretBox.js'
import { RepetitionWatch } from '../../vendor/openclaw/repetition-guard.js'
import type { Env } from '../../config/env.js'
import { buildModelForRun } from './modelClient.js'
import { finishRun, getRunHandle, publishRunEvent, registerRun } from './runRegistry.js'
import { findEmployeeRow } from '../employees/employees.service.js'
import { buildMemoryBlock, buildRecall } from '../memory/memory.service.js'

export type RunsDatabase = NodePgDatabase<typeof schema>

/* ------------------------------------------------------------------ */
/* DTO mapping                                                         */
/* ------------------------------------------------------------------ */

function toMillis(value: Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

export function serializeRun(row: RunRow): RunDto {
  return {
    id: row.id,
    conversationId: row.conversationId,
    parentNodeId: row.parentNodeId,
    providerId: row.providerId,
    providerKind: row.providerKind as RunDto['providerKind'],
    providerEndpoint: row.providerEndpoint,
    modelId: row.modelId,
    status: row.status as RunDto['status'],
    outputText: row.outputText,
    usage: (row.usage as RunUsage | null) ?? null,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: toMillis(row.createdAt),
    updatedAt: toMillis(row.updatedAt),
    terminalAt: row.terminalAt ? toMillis(row.terminalAt) : null,
  }
}

function rowToEvent(row: typeof runEvents.$inferSelect): RunEvent {
  return {
    eventId: `${row.runId}:${row.sequence}`,
    runId: row.runId,
    sequence: row.sequence,
    type: row.type as RunEventType,
    timestamp: toMillis(row.createdAt),
    payload: row.payload as RunEventPayload,
  }
}

/* ------------------------------------------------------------------ */
/* Event append (single writer per run: the executing process)         */
/* ------------------------------------------------------------------ */

async function appendEvent(
  db: RunsDatabase,
  runId: string,
  type: RunEventType,
  payload: RunEventPayload,
): Promise<RunEvent> {
  const maxRows = await db
    .select({ max: sql<number | null>`max(${runEvents.sequence})` })
    .from(runEvents)
    .where(eq(runEvents.runId, runId))
  // Sequences start at 1 so the public cursor semantics stay simple:
  // "events with sequence strictly greater than N", where N=0 replays
  // everything.
  const sequence = (maxRows[0]?.max ?? 0) + 1
  const inserted = await db
    .insert(runEvents)
    .values({ runId, sequence, type, payload })
    .returning()
  const row = inserted[0]
  if (!row) throw new Error('Run event insert returned no row')
  const event = rowToEvent(row)
  publishRunEvent(runId, event)
  return event
}

/* ------------------------------------------------------------------ */
/* Run creation                                                        */
/* ------------------------------------------------------------------ */

interface ResolvedRunInputs {
  conversationId: string
  parentNodeId: string
  provider: {
    id: string
    kind: 'openai-compatible' | 'anthropic'
    endpointUrl: string
    modelId: string
    credentialEnvelope: string
  }
}

async function resolveRunInputs(
  db: RunsDatabase,
  workspaceId: string,
  conversationId: string,
  request: CreateRunRequest,
): Promise<ResolvedRunInputs | null> {
  const conversationRows = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.workspaceId, workspaceId)))
    .limit(1)
  if (!conversationRows[0]) return null

  // The answered node must be a user node in the same conversation.
  const nodeRows = await db
    .select({ id: conversationNodes.id, role: conversationNodes.role })
    .from(conversationNodes)
    .where(
      and(
        eq(conversationNodes.id, request.parentNodeId),
        eq(conversationNodes.conversationId, conversationId),
      ),
    )
    .limit(1)
  const node = nodeRows[0]
  if (!node || node.role !== 'user') return null

  const providerRows = await db
    .select()
    .from(providerConnections)
    .where(
      and(eq(providerConnections.id, request.providerId), eq(providerConnections.workspaceId, workspaceId)),
    )
    .limit(1)
  const provider = providerRows[0]
  if (!provider) return null
  if (!provider.credentialEnvelope) {
    throw badRequest('This provider has no saved credential.')
  }
  const modelId = request.modelId ?? provider.modelId ?? ''
  if (!modelId) {
    throw badRequest('No model selected and the provider has no default model.')
  }
  return {
    conversationId,
    parentNodeId: request.parentNodeId,
    provider: {
      id: provider.id,
      kind: provider.kind as 'openai-compatible' | 'anthropic',
      endpointUrl: provider.endpointUrl,
      modelId,
      credentialEnvelope: provider.credentialEnvelope,
    },
  }
}

async function findRunByIdempotencyKey(
  db: RunsDatabase,
  workspaceId: string,
  idempotencyKey: string,
): Promise<RunRow | null> {
  const rows = await db
    .select()
    .from(runs)
    .where(and(eq(runs.workspaceId, workspaceId), eq(runs.idempotencyKey, idempotencyKey)))
    .limit(1)
  return rows[0] ?? null
}

async function countActiveRuns(db: RunsDatabase, workspaceId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(runs)
    .where(
      and(eq(runs.workspaceId, workspaceId), inArray(runs.status, ['running', 'cancelling'])),
    )
  return Number(rows[0]?.count ?? 0)
}

async function listRunEventsAfter(
  db: RunsDatabase,
  runId: string,
  after: number,
): Promise<RunEvent[]> {
  const rows = await db
    .select()
    .from(runEvents)
    .where(and(eq(runEvents.runId, runId), sql`${runEvents.sequence} > ${after}`))
    .orderBy(runEvents.sequence)
  return rows.map(rowToEvent)
}

/* ------------------------------------------------------------------ */
/* In-memory creation rate limit (single process)                      */
/* ------------------------------------------------------------------ */

const creationTimes = new Map<string, number[]>()

function checkCreationRate(workspaceId: string, limitPerMinute: number): void {
  const now = Date.now()
  const window = creationTimes.get(workspaceId) ?? []
  const recent = window.filter((time) => now - time < 60_000)
  if (recent.length >= limitPerMinute) {
    throw rateLimited('Too many runs started. Wait a moment and try again.')
  }
  recent.push(now)
  creationTimes.set(workspaceId, recent)
}

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

export async function createRun(
  db: RunsDatabase,
  env: Env,
  logger: FastifyBaseLogger,
  workspaceId: string,
  conversationId: string,
  request: CreateRunRequest,
): Promise<CreateRunResponse | null> {
  // Idempotent replay: the same client key returns the same run.
  if (request.idempotencyKey) {
    const existing = await findRunByIdempotencyKey(db, workspaceId, request.idempotencyKey)
    if (existing) {
      return {
        run: serializeRun(existing),
        events: await listRunEventsAfter(db, existing.id, 0),
        reused: true,
      }
    }
  }

  checkCreationRate(workspaceId, env.RUN_CREATE_RATE_PER_MINUTE)

  const inputs = await resolveRunInputs(db, workspaceId, conversationId, request)
  if (!inputs) return null

  if ((await countActiveRuns(db, workspaceId)) >= env.RUN_MAX_CONCURRENT_PER_WORKSPACE) {
    throw rateLimited('Too many concurrent runs in this workspace.')
  }

  const id = randomUUID()
  const inserted = await db
    .insert(runs)
    .values({
      id,
      workspaceId,
      conversationId,
      parentNodeId: inputs.parentNodeId,
      providerId: inputs.provider.id,
      providerKind: inputs.provider.kind,
      providerEndpoint: inputs.provider.endpointUrl,
      modelId: inputs.provider.modelId,
      status: 'running',
      outputText: '',
      idempotencyKey: request.idempotencyKey ?? null,
    })
    .returning()
  let row = inserted[0]
  if (!row) {
    // Lost an idempotency race — the winner's row is the answer.
    if (!request.idempotencyKey) throw new Error('Run insert returned no row')
    const winner = await findRunByIdempotencyKey(db, workspaceId, request.idempotencyKey)
    if (!winner) throw new Error('Run insert returned no row')
    return {
      run: serializeRun(winner),
      events: await listRunEventsAfter(db, winner.id, 0),
      reused: true,
    }
  }

  // Started event before the run can produce output.
  await appendEvent(db, id, 'started', { text: '' })

  const handle = registerRun(id)
  handle.done = executeRun(db, env, logger, row, inputs.provider.credentialEnvelope)

  row = (await db.select().from(runs).where(eq(runs.id, id)).limit(1))[0] ?? row
  return {
    run: serializeRun(row),
    events: await listRunEventsAfter(db, id, 0),
    reused: false,
  }
}

/* ------------------------------------------------------------------ */
/* Execution                                                           */
/* ------------------------------------------------------------------ */

/**
 * Server-side history: walk the parent chain from the answered node to
 * the root, cap by character budget from the newest end (the newest
 * user node always survives), and map to model messages. Assistant
 * nodes with empty content (failed turns) are skipped.
 */
async function buildHistory(
  db: RunsDatabase,
  conversationId: string,
  parentNodeId: string,
  maxChars: number,
): Promise<ModelMessage[]> {
  const nodes = await db
    .select({
      id: conversationNodes.id,
      parentId: conversationNodes.parentId,
      role: conversationNodes.role,
      content: conversationNodes.content,
    })
    .from(conversationNodes)
    .where(eq(conversationNodes.conversationId, conversationId))
    .orderBy(conversationNodes.createdAt)

  const byId = new Map(nodes.map((node) => [node.id, node]))
  const chain: Array<{ role: string; content: string }> = []
  let cursor: string | null = parentNodeId
  while (cursor) {
    const node = byId.get(cursor)
    if (!node) break
    if (node.role === 'user' || (node.role === 'assistant' && node.content.length > 0)) {
      chain.push({ role: node.role, content: node.content })
    }
    cursor = node.parentId
  }
  chain.reverse()

  // Budget from the newest end; the newest turn is always included.
  const kept: Array<{ role: string; content: string }> = []
  let total = 0
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const turn = chain[index]
    if (!turn) break
    if (kept.length > 0 && total + turn.content.length > maxChars) break
    kept.unshift(turn)
    total += turn.content.length
  }
  return kept.map((turn) => ({
    role: turn.role === 'user' ? 'user' : 'assistant',
    content: turn.content,
  })) as ModelMessage[]
}

interface FinalizeInput {
  status: RunTerminalStatus
  errorCode?: string
  errorMessage?: string
  usage?: RunUsage
}

async function executeRun(
  db: RunsDatabase,
  env: Env,
  logger: FastifyBaseLogger,
  row: RunRow,
  credentialEnvelope: string,
): Promise<void> {
  const runId = row.id
  let finalized = false
  let output = ''
  let usage: RunUsage | undefined
  let buffer = ''
  let flushChain = Promise.resolve()

  const flushBuffer = () => {
    flushChain = flushChain.then(async () => {
      if (buffer.length === 0) return
      const text = buffer
      buffer = ''
      await appendEvent(db, runId, 'delta', { text })
    })
    // Keep the chain alive even if a single flush fails; the runner's
    // own error path still finalizes the run.
    flushChain = flushChain.catch(() => undefined)
  }

  /** Write the one terminal outcome + assistant node; exactly once. */
  const finalize = async (outcome: FinalizeInput) => {
    if (finalized) return
    finalized = true
    try {
      // Enqueue any still-buffered text so the durable stream carries the
      // full partial output BEFORE the terminal event.
      flushBuffer()
      await flushChain
      usage = outcome.usage ?? usage

      const terminalEvent = await appendEvent(db, runId, 'terminal', {
        status: outcome.status,
        errorCode: outcome.errorCode,
        errorMessage: outcome.errorMessage,
      })

      const terminalAt = new Date()
      // The terminal status and the transcript node commit atomically:
      // there must never be a window where a client can observe a terminal
      // run whose assistant node is not yet durable. Pollers sync on run
      // status and immediately reload the conversation — a two-phase write
      // let that reload race the node insert on slower machines.
      const nodeId = randomUUID()
      let lostStatusRace = false
      await db.transaction(async (tx) => {
        const updated = await tx
          .update(runs)
          .set({
            status: outcome.status,
            outputText: output,
            usage: usage ?? null,
            errorCode: outcome.errorCode ?? null,
            errorMessage: outcome.errorMessage ?? null,
            terminalAt,
            updatedAt: terminalAt,
          })
          .where(and(eq(runs.id, runId), inArray(runs.status, ['running', 'cancelling'])))
          .returning()
        lostStatusRace = updated.length === 0

        // Truthful transcript node for reload (mapped status; error detail
        // on the node, never on a fake 'complete').
        const nodeStatus =
          outcome.status === 'complete' ? 'complete' : outcome.status === 'error' ? 'error' : 'stopped'
        await tx.insert(conversationNodes).values({
          id: nodeId,
          conversationId: row.conversationId,
          parentId: row.parentNodeId,
          role: 'assistant',
          status: nodeStatus,
          content: output,
          error: outcome.status === 'error' ? (outcome.errorMessage ?? 'The run failed.') : null,
          statusPrefix:
            outcome.status === 'repetition_stopped'
              ? 'Stopped — repetitive output'
              : outcome.status === 'stopped'
                ? 'Stopped'
                : null,
          clientId: `run:${runId}`,
        })
        // Only advance the active leaf when the user has not branched
        // elsewhere while this run executed.
        await tx
          .update(conversations)
          .set({ activeLeafId: nodeId, updatedAt: new Date() })
          .where(
            and(eq(conversations.id, row.conversationId), eq(conversations.activeLeafId, row.parentNodeId)),
          )
      })

      if (lostStatusRace) {
        logger.warn({ runId }, 'run finalize lost its status race; terminal event still recorded')
      }
      void terminalEvent
    } catch (error) {
      logger.error({ runId, err: error }, 'run finalization failed')
    } finally {
      finishRun(runId)
    }
  }

  try {
    // Decrypt the credential (write-only at the API boundary; used only
    // for the outbound provider request). Scope-bound to this workspace +
    // provider, so a copied envelope is undecryptable elsewhere.
    const masterKey = parseMasterKey(env.CREDENTIAL_MASTER_KEY)
    const { plaintext: apiKey } = decryptSecret(masterKey, credentialEnvelope, {
      workspaceId: row.workspaceId,
      providerId: row.providerId ?? '',
    })

    const { model } = await buildModelForRun(
      {
        id: row.providerId,
        kind: row.providerKind as 'openai-compatible' | 'anthropic',
        endpointUrl: row.providerEndpoint,
        modelId: row.modelId,
        apiKey,
      },
      env,
    )

    const history = await buildHistory(db, row.conversationId, row.parentNodeId, env.RUN_HISTORY_MAX_CHARS)

    // Employee persona + memory (B04). The conversation may reference a
    // server-side employee; when it does not (or the row was deleted),
    // everything degrades honestly to the base prompt. Frontend parity
    // (m07): non-empty employee instructions REPLACE the base prompt,
    // then the bounded memory block joins with a --- separator.
    let system = 'You are Uni, a helpful assistant.'
    let messages = history
    const conversationRow = (
      await db
        .select({ agentId: conversations.agentId })
        .from(conversations)
        .where(eq(conversations.id, row.conversationId))
        .limit(1)
    )[0]
    const agentId = conversationRow?.agentId ?? null
    if (agentId) {
      const employee = await findEmployeeRow(db, row.workspaceId, agentId)
      if (employee && employee.instructions.trim()) {
        system = employee.instructions.trim()
      }
      const block = await buildMemoryBlock(db, row.workspaceId, agentId)
      if (block.block) {
        system = `${system}\n\n---\n\n${block.block}`
      }
      // Recall rides in front of the turn's message, never the system
      // prompt (upstream design): passages from this employee's own
      // notes that share words with the message below.
      const newest = messages[messages.length - 1]
      if (newest && newest.role === 'user' && typeof newest.content === 'string') {
        const recall = await buildRecall(db, row.workspaceId, agentId, newest.content)
        if (recall) {
          messages = [
            ...messages.slice(0, -1),
            { role: 'user' as const, content: `${recall}\n\n${newest.content}` },
          ]
        }
      }
    }

    const handle = registerRun(runId)
    let timeoutAborted = false
    const timeout = setTimeout(() => {
      timeoutAborted = true
      handle.controller.abort()
    }, env.RUN_TIMEOUT_MS)

    const watch = new RepetitionWatch()
    let repetitionStopped = false

    const flushTimer = setInterval(flushBuffer, 250)
    if (typeof flushTimer.unref === 'function') flushTimer.unref()

    try {
      const result = streamText({
        model: model as LanguageModel,
        system,
        messages,
        abortSignal: handle.controller.signal,
        maxOutputTokens: env.RUN_MAX_OUTPUT_TOKENS,
        // No automatic retries: a failed request may have reached the
        // provider, and repeating a billable call automatically is worse
        // than surfacing the failure. Users retry deliberately.
        maxRetries: 0,
      })

      try {
        for await (const delta of result.textStream) {
          output += delta
          buffer += delta
          if (watch.feed(delta)) {
            repetitionStopped = true
            handle.controller.abort()
            break
          }
        }
      } catch {
        /* classified below */
      }

      if (repetitionStopped) {
        await finalize({ status: 'repetition_stopped' })
        return
      }
      if (handle.controller.signal.aborted) {
        if (timeoutAborted) {
          await finalize({ status: 'error', errorCode: 'timeout', errorMessage: 'The run exceeded its time limit.' })
        } else {
          await finalize({ status: 'stopped' })
        }
        return
      }

      const resolvedUsage = await Promise.resolve(result.usage).catch(() => undefined)
      if (
        resolvedUsage &&
        (resolvedUsage.inputTokens !== undefined || resolvedUsage.outputTokens !== undefined)
      ) {
        const runUsage: RunUsage = {
          inputTokens: resolvedUsage.inputTokens,
          outputTokens: resolvedUsage.outputTokens,
        }
        usage = runUsage
        await appendEvent(db, runId, 'usage', { usage: runUsage })
      }

      const finishReason = await Promise.resolve(result.finishReason).catch(() => 'error')
      if (finishReason === 'error') {
        await finalize({
          status: 'error',
          errorCode: 'provider_error',
          errorMessage: 'The provider reported an error while streaming.',
        })
      } else {
        await finalize({ status: 'complete', usage })
      }
    } finally {
      clearInterval(flushTimer)
      clearTimeout(timeout)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    if (/not allowed/i.test(message)) {
      await finalize({
        status: 'error',
        errorCode: 'endpoint_not_allowed',
        errorMessage: 'The provider endpoint is not allowed by server policy.',
      })
      return
    }
    logger.warn({ runId, err: message }, 'run execution failed')
    await finalize({
      status: 'error',
      errorCode: 'provider_error',
      errorMessage: 'The provider request failed.',
    })
  }
}

/* ------------------------------------------------------------------ */
/* Read / cancel / reconcile                                           */
/* ------------------------------------------------------------------ */

export async function getRun(db: RunsDatabase, workspaceId: string, runId: string): Promise<RunDto | null> {
  const rows = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.workspaceId, workspaceId)))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  await reconcileStuckRun(db, row)
  const fresh = (await db.select().from(runs).where(eq(runs.id, runId)).limit(1))[0] ?? row
  return serializeRun(fresh)
}

export async function getRunEvents(
  db: RunsDatabase,
  workspaceId: string,
  runId: string,
  after: number,
): Promise<{ run: RunDto; events: RunEvent[] } | null> {
  const rows = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.workspaceId, workspaceId)))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  await reconcileStuckRun(db, row)
  const events = await listRunEventsAfter(db, runId, after)
  const fresh = (await db.select().from(runs).where(eq(runs.id, runId)).limit(1))[0] ?? row
  return { run: serializeRun(fresh), events }
}

/**
 * Runs left non-terminal by a process restart (no live handle in this
 * process) reconcile honestly: the run did not complete, and its
 * outcome is unknown — recorded as an interrupted error, never as a
 * success, and never silently deleted.
 */
async function reconcileStuckRun(db: RunsDatabase, row: RunRow): Promise<void> {
  if (row.status !== 'running' && row.status !== 'cancelling') return
  if (getRunHandle(row.id)) return
  const terminalAt = new Date()
  const updated = await db
    .update(runs)
    .set({
      status: 'error',
      errorCode: 'interrupted',
      errorMessage: 'The server stopped before this run finished; its outcome is unknown.',
      terminalAt,
      updatedAt: terminalAt,
    })
    .where(and(eq(runs.id, row.id), inArray(runs.status, ['running', 'cancelling'])))
    .returning()
  if (updated.length > 0) {
    await appendEvent(db, row.id, 'terminal', {
      status: 'error',
      errorCode: 'interrupted',
      errorMessage: 'The server stopped before this run finished; its outcome is unknown.',
    })
  }
}

export async function cancelRun(db: RunsDatabase, workspaceId: string, runId: string): Promise<RunDto | null> {
  const rows = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.workspaceId, workspaceId)))
    .limit(1)
  const row = rows[0]
  if (!row) return null
  if (row.status !== 'running' && row.status !== 'cancelling') {
    return serializeRun(row) // idempotent: cancelling a terminal run is a no-op
  }

  // Durable intent first: even if the abort is lost to a crash, the row
  // says the user asked to stop.
  const marking = await db
    .update(runs)
    .set({ status: 'cancelling', updatedAt: new Date() })
    .where(and(eq(runs.id, runId), inArray(runs.status, ['running'])))
    .returning()

  const handle = getRunHandle(runId)
  if (handle) {
    handle.controller.abort()
    // The runner finalizes 'stopped' with partial output.
  } else if (marking.length > 0 || row.status === 'cancelling') {
    // Stuck run (process restarted): honor the user's stop directly.
    await finalizeCancelledStuckRun(db, row)
  }

  const fresh = (await db.select().from(runs).where(eq(runs.id, runId)).limit(1))[0] ?? row
  return serializeRun(fresh)
}

async function finalizeCancelledStuckRun(db: RunsDatabase, row: RunRow): Promise<void> {
  const terminalAt = new Date()
  const updated = await db
    .update(runs)
    .set({ status: 'stopped', terminalAt, updatedAt: terminalAt })
    .where(and(eq(runs.id, row.id), inArray(runs.status, ['running', 'cancelling'])))
    .returning()
  if (updated.length === 0) return

  // Partial output (persisted deltas) still belongs in the transcript.
  const events = await listRunEventsAfter(db, row.id, 0)
  const partial = events
    .filter((event) => event.type === 'delta')
    .map((event) => event.payload.text ?? '')
    .join('')

  await appendEvent(db, row.id, 'terminal', { status: 'stopped' })

  const nodeId = randomUUID()
  await db.transaction(async (tx) => {
    await tx.insert(conversationNodes).values({
      id: nodeId,
      conversationId: row.conversationId,
      parentId: row.parentNodeId,
      role: 'assistant',
      status: 'stopped',
      content: partial,
      statusPrefix: 'Stopped',
      clientId: `run:${row.id}`,
    })
    await tx
      .update(conversations)
      .set({ activeLeafId: nodeId, updatedAt: new Date() })
      .where(
        and(eq(conversations.id, row.conversationId), eq(conversations.activeLeafId, row.parentNodeId)),
      )
  })
  await txUpdateRunOutput(db, row.id, partial)
}

async function txUpdateRunOutput(db: RunsDatabase, runId: string, outputText: string): Promise<void> {
  await db.update(runs).set({ outputText }).where(eq(runs.id, runId))
}

/** Runs for a conversation, newest first (used by tests and future UI). */
export async function listRunsForConversation(
  db: RunsDatabase,
  workspaceId: string,
  conversationId: string,
): Promise<RunDto[]> {
  const conversationRows = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.workspaceId, workspaceId)))
    .limit(1)
  if (!conversationRows[0]) return null as unknown as RunDto[]
  const rows = await db
    .select()
    .from(runs)
    .where(eq(runs.conversationId, conversationId))
    .orderBy(desc(runs.createdAt))
    .limit(50)
  return rows.map(serializeRun)
}
