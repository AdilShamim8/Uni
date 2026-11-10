/**
 * The agent run engine — Uni's in-process equivalent of the abacusai-bot
 * session loop, on the existing runs-module execution skeleton:
 * resolve provider -> build model -> stream -> append events, with one
 * addition the plain runs module does not have: the tool loop.
 *
 * The model may call tools (the roster). Each call goes through the
 * permission gate FIRST; an `ask` suspends the run: the ask is persisted
 * (agent_pending_permission) and a permission_requested event is
 * published, and the engine awaits the user's decision before the tool
 * executes (or is refused). An approval with scope 'always' widens the
 * session's allowances (persisted in agent_allowance) exactly the way
 * upstream's rememberAllowance does.
 */
import { randomUUID } from 'node:crypto'
import { createHash } from 'node:crypto'
import { and, eq, isNull } from 'drizzle-orm'
import { streamText, tool as aiTool, type ToolSet } from 'ai'
import { z as zod } from 'zod'
import * as schema from '../../db/schema.js'
import {
  agentAllowances,
  agentPendingPermissions,
  agentRuns,
  agentSessions,
} from '../../db/schema.js'
import { appendAgentEvent } from './agentEvents.service.js'
import { findSessionRow, type AgentDatabase } from './agentSession.service.js'
import { sessionRootPath, defaultAgentRoot, ensureSessionRoot, UnsafeRootDirError } from './sessionStore.js'
import { gateToolCall, type MutableGateOptions } from './permission/gate.js'
import { executeTool, toolContextFor, isRosterTool } from './roster.js'
import { buildModelForRun, type ProviderForRun } from '../runs/modelClient.js'
import { decryptSecret, parseMasterKey } from '../../lib/secretBox.js'
import { allowsKeyless, type ProviderAuthMode } from '../../lib/providerUrls.js'
import { providerConnections } from '../../db/schema.js'
import { AppError } from '../../lib/errors.js'
import type {
  AgentEventPayload,
  AgentRunStatus,
  PermissionDecision,
  PermissionRequest,
  ToolRequest,
} from '@uni/contracts'
import type { Env } from '../../config/env.js'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

export interface RunEngineDeps {
  db: AgentDatabase
  env: Env
}

/** In-process registry of live runs (single-process by design, like runs). */
interface LiveRun {
  runId: string
  sessionId: string
  controller: AbortController
  done: Promise<void>
  /** Resolves when the user answers the pending permission ask. */
  permissionWaiters: Map<string, (decision: PermissionDecision) => void>
}

const liveRuns = new Map<string, LiveRun>()

export function liveRunCount(): number {
  return liveRuns.size
}

/* ------------------------------------------------------------------ */
/* Allowances                                                          */
/* ------------------------------------------------------------------ */

export interface SessionAllowances {
  allowedCommands: string[]
  allowedTools: string[]
  allowedOrigins: string[]
  allowedReadPaths: string[]
  allowedWritePaths: string[]
}

/** Load the persisted 'always' allowances as mutable arrays for the live gate. */
export async function loadAllowances(
  db: AgentDatabase,
  sessionId: string,
): Promise<SessionAllowances> {
  const rows = await db
    .select()
    .from(agentAllowances)
    .where(eq(agentAllowances.sessionId, sessionId))
  const result: SessionAllowances = {
    allowedCommands: [],
    allowedTools: [],
    allowedOrigins: [],
    allowedReadPaths: [],
    allowedWritePaths: [],
  }
  for (const row of rows) {
    switch (row.kind) {
      case 'command':
        result.allowedCommands.push(row.value)
        break
      case 'tool':
        result.allowedTools.push(row.value)
        break
      case 'origin':
        result.allowedOrigins.push(row.value)
        break
      case 'readPath':
        result.allowedReadPaths.push(row.value)
        break
      case 'writePath':
        result.allowedWritePaths.push(row.value)
        break
    }
  }
  return result
}

/**
 * What an approval's 'always' scope remembers, per ask kind — the
 * upstream allowance rules, narrowed to Uni's ask types.
 */
export function allowanceFor(request: PermissionRequest): { kind: string; value: string } | null {
  switch (request.type) {
    case 'run_terminal':
      // The command PREFIX (first word), never the whole chain: the gate
      // re-checks chaining on every call.
      return { kind: 'command', value: commandPrefixOf(request.command) }
    case 'fetch_url':
      return { kind: 'origin', value: request.origin }
    case 'read_outside_directory':
      return { kind: 'readPath', value: request.deducedDirectory }
    case 'write_outside_directory':
    case 'edit_outside_directory':
      return { kind: 'writePath', value: request.deducedDirectory }
    case 'generic':
      return { kind: 'tool', value: request.toolName }
    default:
      // write_file/edit_file/exit_plan_mode: per-call approvals only — a
      // blanket file allowance would approve every future edit.
      return null
  }
}

function commandPrefixOf(command: string): string {
  const segment = command.trim().split(/&&|\|\||;|\s+/)[0] ?? ''
  return segment.trim()
}

async function rememberAllowance(
  db: AgentDatabase,
  workspaceId: string,
  sessionId: string,
  kind: string,
  value: string,
): Promise<void> {
  if (value.length === 0 || value.length > 500) return
  await db
    .insert(agentAllowances)
    .values({ id: randomUUID(), workspaceId, sessionId, kind, value })
    .onConflictDoNothing()
}

/* ------------------------------------------------------------------ */
/* Run creation                                                        */
/* ------------------------------------------------------------------ */

export function runRequestFingerprint(input: {
  sessionId: string
  text: string
  providerId: string | null
  modelId: string | null
}): string {
  const canonical = JSON.stringify([
    input.sessionId,
    input.text,
    input.providerId,
    input.modelId,
  ])
  return createHash('sha256').update(canonical).digest('hex')
}

export interface CreateAgentRunInput {
  workspaceId: string
  sessionId: string
  text: string
  idempotencyKey?: string
}

/**
 * Create (or replay) an agent run and start executing it in the
 * background. Returns the run id.
 */
export async function createAgentRun(deps: RunEngineDeps, input: CreateAgentRunInput): Promise<{ runId: string; reused: boolean }> {
  const { db, env } = deps
  const session = await findSessionRow(db, input.workspaceId, input.sessionId)
  if (!session) throw new AppError('NOT_FOUND', 'Agent session not found.', 404)
  if (session.archived) throw new AppError('CONFLICT', 'Agent session is archived.', 409)

  // Idempotent replay: same workspace + key returns the same run.
  if (input.idempotencyKey) {
    const existing = await db
      .select()
      .from(agentRuns)
      .where(
        and(
          eq(agentRuns.workspaceId, input.workspaceId),
          eq(agentRuns.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1)
    const prior = existing[0]
    if (prior) {
      if (prior.sessionId !== input.sessionId) {
        throw new AppError('CONFLICT', 'Idempotency key already used for another session.', 409)
      }
      const fingerprint = runRequestFingerprint({
        sessionId: input.sessionId,
        text: input.text,
        providerId: session.providerId,
        modelId: session.modelId,
      })
      if (prior.requestFingerprint && prior.requestFingerprint !== fingerprint) {
        throw new AppError('CONFLICT', 'Idempotency key is bound to a different request.', 409)
      }
      return { runId: prior.id, reused: true }
    }
  }

  const runId = randomUUID()
  const fingerprint = runRequestFingerprint({
    sessionId: input.sessionId,
    text: input.text,
    providerId: session.providerId,
    modelId: session.modelId,
  })

  const inserted = await db
    .insert(agentRuns)
    .values({
      id: runId,
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      status: 'running',
      inputText: input.text,
      providerId: session.providerId,
      modelId: session.modelId,
      idempotencyKey: input.idempotencyKey ?? null,
      requestFingerprint: fingerprint,
    })
    .returning()
  if (!inserted[0]) throw new Error('Agent run insert returned no row')

  await appendAgentEvent(db, {
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    runId,
    type: 'run_started',
    payload: { inputText: input.text },
  })

  const controller = new AbortController()
  const live: LiveRun = {
    runId,
    sessionId: input.sessionId,
    controller,
    done: Promise.resolve(),
    permissionWaiters: new Map(),
  }
  liveRuns.set(runId, live)
  live.done = executeAgentRun(deps, live, session).finally(() => {
    liveRuns.delete(runId)
  })

  return { runId, reused: false }
}

/* ------------------------------------------------------------------ */
/* The run loop                                                        */
/* ------------------------------------------------------------------ */

const MAX_TOOL_ROUNDS = 12

async function executeAgentRun(
  deps: RunEngineDeps,
  live: LiveRun,
  session: typeof agentSessions.$inferSelect,
): Promise<void> {
  const { db, env } = deps

  const resolveTerminal = async (status: AgentRunStatus, payload: AgentEventPayload) => {
    await db
      .update(agentRuns)
      .set({
        status,
        outputText: payload.text ?? '',
        updatedAt: new Date(),
        terminalAt: new Date(),
        ...(payload.errorCode ? { errorCode: payload.errorCode } : {}),
        ...(payload.errorMessage ? { errorMessage: payload.errorMessage } : {}),
      })
      .where(eq(agentRuns.id, live.runId))
    await appendAgentEvent(db, {
      workspaceId: session.workspaceId,
      sessionId: live.sessionId,
      runId: live.runId,
      type: status === 'error' ? 'error' : 'run_finished',
      payload: { ...payload, status },
    })
  }

  let root: string
  try {
    root = sessionRootPath(defaultAgentRoot(), session.workspaceId, session.rootDir)
  } catch (error) {
    // A stored rootDir that cannot be a safe path fails the run honestly
    // before any tool touches the filesystem (F01).
    if (error instanceof UnsafeRootDirError) {
      await resolveTerminal('error', {
        errorCode: 'unsafe_session_root',
        errorMessage: 'The session root is not a safe path; contact support or recreate the session.',
      })
      return
    }
    throw error
  }
  await ensureSessionRoot(root)

  try {
    // Provider resolution: the session pin, else honest failure.
    if (!session.providerId) {
      await resolveTerminal('error', {
        errorCode: 'no_provider',
        errorMessage: 'The session has no provider pinned. Set one in the session settings.',
      })
      return
    }
    const providerRows = await db
      .select()
      .from(providerConnections)
      .where(
        and(
          eq(providerConnections.id, session.providerId),
          eq(providerConnections.workspaceId, session.workspaceId),
        ),
      )
      .limit(1)
    const provider = providerRows[0]
    if (!provider) {
      await resolveTerminal('error', {
        errorCode: 'provider_unavailable',
        errorMessage: 'The pinned provider no longer exists.',
      })
      return
    }
    const authMode = provider.authMode as ProviderAuthMode
    const modelId = session.modelId ?? provider.modelId ?? ''
    if (!modelId) {
      await resolveTerminal('error', {
        errorCode: 'no_model',
        errorMessage: 'No model resolved for this session.',
      })
      return
    }
    if (!provider.credentialEnvelope && authMode !== 'none') {
      await resolveTerminal('error', {
        errorCode: 'no_credential',
        errorMessage: 'The pinned provider has no saved credential.',
      })
      return
    }
    if (authMode === 'none' && !allowsKeyless(provider.kind as 'openai-compatible' | 'anthropic')) {
      await resolveTerminal('error', {
        errorCode: 'keyless_unsupported',
        errorMessage: 'The pinned provider protocol cannot run keyless.',
      })
      return
    }
    let apiKey: string | null = null
    if (provider.credentialEnvelope) {
      try {
        apiKey = decryptSecret(
          parseMasterKey(env.CREDENTIAL_MASTER_KEY),
          provider.credentialEnvelope,
          { workspaceId: session.workspaceId, providerId: provider.id },
        ).plaintext
      } catch {
        await resolveTerminal('error', {
          errorCode: 'credential_unreadable',
          errorMessage: 'The provider credential could not be decrypted.',
        })
        return
      }
    }

    const providerForRun: ProviderForRun = {
      id: provider.id,
      kind: provider.kind as ProviderForRun['kind'],
      endpointUrl: provider.endpointUrl,
      modelId,
      authMode,
      apiKey,
    }
    const { model } = await buildModelForRun(providerForRun, env)

    const allowances = await loadAllowances(db, live.sessionId)
    const toolCtx = toolContextFor(root, env)

    const gateOptions = (): MutableGateOptions => ({
      mode: session.mode as MutableGateOptions['mode'],
      root,
      allowedCommands: allowances.allowedCommands,
      allowedTools: allowances.allowedTools,
      allowedOrigins: allowances.allowedOrigins,
      allowedReadPaths: allowances.allowedReadPaths,
      allowedWritePaths: allowances.allowedWritePaths,
      unattended:
        session.mode === 'unattended'
          ? { policy: { files: true, sources: [] } }
          : undefined,
    })

    // The roster, as AI SDK tools the model may call. Input stays untyped
    // here (`any`): each executor validates through the contract schema
    // before any side effect, and the gate re-reads the raw input.
    const rosterTools: ToolSet = {}
    for (const name of sessionTools(session)) {
      if (!isRosterTool(name) || name === 'exit_plan_mode') continue
      rosterTools[name] = aiTool({
        description: rosterDescription(name),
        inputSchema: zod.any() as never,
        execute: async (input: unknown) => {
          return runToolCall(deps, live, session, toolCtx, name, input, gateOptions())
        },
      }) as never
    }

    let round = 0
    const history: Array<{ role: 'user' | 'assistant'; content: string }> = [
      { role: 'user', content: sessionRunPrompt(session) + '\n\n' + (await currentRunInput(db, live.runId)) },
    ]
    let finalText = ''

    while (round < MAX_TOOL_ROUNDS) {
      round += 1
      const result = streamText({
        model,
        messages: history,
        ...(Object.keys(rosterTools).length > 0 ? { tools: rosterTools } : {}),
        maxRetries: 0,
        abortSignal: live.controller.signal,
        maxOutputTokens: env.RUN_MAX_OUTPUT_TOKENS,
      })

      let roundText = ''
      for await (const delta of result.textStream) {
        roundText += delta
        await appendAgentEvent(db, {
          workspaceId: session.workspaceId,
          sessionId: live.sessionId,
          runId: live.runId,
          type: 'text_delta',
          payload: { text: delta },
        })
      }
      finalText = roundText.length > 0 ? roundText : finalText

      // Tool executions (and any permission asks they raised) happen
      // inside the stream's tool steps; wait for them to settle before
      // deciding whether the run is finished.
      await result.response
      const toolCalls = await result.toolCalls
      if (!toolCalls || toolCalls.length === 0) {
        await resolveTerminal('complete', { text: finalText })
        return
      }

      history.push({ role: 'assistant', content: roundText })
      // Tool outcomes (and permission denials) are already events; the
      // loop lets the model continue from them.
    }

    await resolveTerminal('complete', {
      text: finalText + '\n\n[stopped after the tool-round cap]',
    })
  } catch (error) {
    const aborted = live.controller.signal.aborted
    if (aborted) {
      await resolveTerminal('stopped', { text: '' })
      return
    }
    await resolveTerminal('error', {
      errorCode: 'execution_failed',
      errorMessage: error instanceof Error ? error.message : 'Agent run failed.',
    })
  }
}

function sessionTools(session: typeof agentSessions.$inferSelect): string[] {
  const tools = Array.isArray(session.tools) ? session.tools : []
  // An empty roster means the default set: reads + time + todo (never a
  // mutating tool by default).
  if (tools.length === 0) return ['read', 'list', 'grep', 'current_time', 'todo']
  return tools
}

function rosterDescription(name: string): string {
  const descriptions: Record<string, string> = {
    read: 'Read a text file inside the session root. Output is capped.',
    list: 'List a directory inside the session root.',
    grep: 'Search file contents inside the session root.',
    write: 'Create or overwrite a file inside the session root.',
    edit: 'Replace text in a file inside the session root.',
    bash: 'Run a shell command with the session root as cwd. Output is capped.',
    web_fetch: 'Fetch a URL through the guarded transport and return fenced text content.',
    current_time: 'The server clock, in UTC.',
    todo: 'Maintain a task list the user can see.',
  }
  return descriptions[name] ?? name
}

function sessionRunPrompt(session: typeof agentSessions.$inferSelect): string {
  const parts = [`You are Uni agent "${session.name}".`]
  if (session.description) parts.push(session.description)
  return parts.join('\n')
}

async function currentRunInput(db: AgentDatabase, runId: string): Promise<string> {
  const rows = await db.select().from(agentRuns).where(eq(agentRuns.id, runId)).limit(1)
  return rows[0]?.inputText ?? ''
}

/* ------------------------------------------------------------------ */
/* Tool call with the permission pause                                 */
/* ------------------------------------------------------------------ */

async function runToolCall(
  deps: RunEngineDeps,
  live: LiveRun,
  session: typeof agentSessions.$inferSelect,
  toolCtx: ReturnType<typeof toolContextFor>,
  name: string,
  input: unknown,
  gateOptions: MutableGateOptions,
): Promise<string> {
  const { db } = deps
  const toolCallId = randomUUID()
  const request: ToolRequest = { id: toolCallId, name, input: asRecord(input) }

  await appendAgentEvent(db, {
    workspaceId: session.workspaceId,
    sessionId: live.sessionId,
    runId: live.runId,
    type: 'tool_call_started',
    payload: { toolCallId, toolName: name, toolInput: asRecord(input) },
  })

  const gate = gateToolCall(request, gateOptions)

  if (gate.kind === 'refuse') {
    await appendAgentEvent(db, {
      workspaceId: session.workspaceId,
      sessionId: live.sessionId,
      runId: live.runId,
      type: 'tool_call_result',
      payload: { toolCallId, toolName: name, toolResultStatus: 'denied', toolOutput: gate.reason },
    })
    return `Permission refused: ${gate.reason}`
  }

  if (gate.kind === 'ask') {
    // One canonical id everywhere (F02): the persisted row's id IS the
    // request's requestId, so the id the client sees over SSE is the id
    // the respond endpoint accepts. The row is persisted BEFORE the
    // event is published, so an immediate response can never miss.
    const pendingId = gate.request.requestId
    const inserted = await db
      .insert(agentPendingPermissions)
      .values({
        id: pendingId,
        workspaceId: session.workspaceId,
        sessionId: live.sessionId,
        runId: live.runId,
        request: { ...gate.request, requestId: pendingId },
      })
      .returning({ id: agentPendingPermissions.id })
    if (!inserted[0]) throw new Error('Pending permission insert returned no row')
    await db
      .update(agentRuns)
      .set({ status: 'waiting-for-permission', updatedAt: new Date() })
      .where(eq(agentRuns.id, live.runId))
    // The waiter is registered BEFORE the event goes out: a response
    // arriving in the same tick as the SSE frame finds a live waiter.
    const decisionPromise = waitForDecision(live, pendingId)
    await appendAgentEvent(db, {
      workspaceId: session.workspaceId,
      sessionId: live.sessionId,
      runId: live.runId,
      type: 'permission_requested',
      payload: { permissionRequest: { ...gate.request, requestId: pendingId } },
    })

    const decision = await decisionPromise

    await db
      .update(agentPendingPermissions)
      .set({
        resolvedAt: new Date(),
        resolution: decision.decision === 'approve' ? `approve:${decision.scope}` : 'deny',
      })
      .where(eq(agentPendingPermissions.id, pendingId))
    await appendAgentEvent(db, {
      workspaceId: session.workspaceId,
      sessionId: live.sessionId,
      runId: live.runId,
      type: 'permission_resolved',
      payload: { decision },
    })
    await db
      .update(agentRuns)
      .set({ status: 'running', updatedAt: new Date() })
      .where(eq(agentRuns.id, live.runId))

    if (decision.decision === 'deny') {
      await appendAgentEvent(db, {
        workspaceId: session.workspaceId,
        sessionId: live.sessionId,
        runId: live.runId,
        type: 'tool_call_result',
        payload: {
          toolCallId,
          toolName: name,
          toolResultStatus: 'denied',
          toolOutput: 'The user denied this tool call.',
        },
      })
      return 'The user denied this tool call. Continue without it and say what you could not do.'
    }

    if (decision.scope === 'always') {
      const remember = allowanceFor(gate.request)
      if (remember) {
        await rememberAllowance(
          db,
          session.workspaceId,
          live.sessionId,
          remember.kind,
          remember.value,
        )
        // The live gate options read the arrays; refresh them in place.
        if (remember.kind === 'command') gateOptions.allowedCommands.push(remember.value)
        if (remember.kind === 'tool') gateOptions.allowedTools.push(remember.value)
        if (remember.kind === 'origin') gateOptions.allowedOrigins.push(remember.value)
        if (remember.kind === 'readPath') gateOptions.allowedReadPaths.push(remember.value)
        if (remember.kind === 'writePath') gateOptions.allowedWritePaths.push(remember.value)
      }
    }
  }

  const outcome = await executeTool(name, toolCtx, request.input, live.controller.signal)
  await appendAgentEvent(db, {
    workspaceId: session.workspaceId,
    sessionId: live.sessionId,
    runId: live.runId,
    type: 'tool_call_result',
    payload: {
      toolCallId,
      toolName: name,
      toolResultStatus: outcome.ok ? 'ok' : 'error',
      toolOutput: outcome.output,
    },
  })
  return outcome.output
}

function asRecord(input: unknown): Record<string, unknown> {
  return input != null && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>)
    : {}
}

function waitForDecision(live: LiveRun, pendingId: string): Promise<PermissionDecision> {
  return new Promise<PermissionDecision>((resolve, reject) => {
    const timer = setTimeout(() => {
      live.permissionWaiters.delete(pendingId)
      reject(new AppError('TIMEOUT', 'Permission request expired.', 408))
    }, 10 * 60_000)
    live.permissionWaiters.set(pendingId, (decision) => {
      clearTimeout(timer)
      resolve(decision)
    })
    live.controller.signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        live.permissionWaiters.delete(pendingId)
        reject(new AppError('CANCELLED', 'The run was cancelled.', 409))
      },
      { once: true },
    )
  })
}

/* ------------------------------------------------------------------ */
/* Permission response + cancel                                        */
/* ------------------------------------------------------------------ */

/**
 * Resolve a pending permission request. The decision is claimed
 * ATOMICALLY (conditional update on resolvedAt IS NULL), bound to the
 * exact workspace + session + run + request identity from the URL — a
 * wrong run in the same session cannot resolve another run's ask, and
 * two concurrent answers resolve at most once (the loser sees 404).
 */
export async function respondToPermission(
  deps: RunEngineDeps,
  workspaceId: string,
  sessionId: string,
  runId: string,
  requestId: string,
  decision: PermissionDecision,
): Promise<boolean> {
  const { db } = deps
  const claimed = await db
    .update(agentPendingPermissions)
    .set({
      resolvedAt: new Date(),
      resolution: decision.decision === 'approve' ? `approve:${decision.scope}` : 'deny',
    })
    .where(
      and(
        eq(agentPendingPermissions.id, requestId),
        eq(agentPendingPermissions.workspaceId, workspaceId),
        eq(agentPendingPermissions.sessionId, sessionId),
        eq(agentPendingPermissions.runId, runId),
        isNull(agentPendingPermissions.resolvedAt),
      ),
    )
    .returning()
  const row = claimed[0]
  if (!row) return false

  // The live waiter (same process) is resolved by the claimed row's id.
  const live = [...liveRuns.values()].find((candidate) => candidate.runId === runId)
  const waiter = live?.permissionWaiters.get(requestId)
  if (waiter) {
    live!.permissionWaiters.delete(requestId)
    waiter(decision)
  }
  return true
}

export async function cancelAgentRun(
  deps: RunEngineDeps,
  workspaceId: string,
  runId: string,
): Promise<'cancelled' | 'not_found' | 'already_terminal'> {
  const { db } = deps
  const rows = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.workspaceId, workspaceId)))
    .limit(1)
  const run = rows[0]
  if (!run) return 'not_found'
  if (run.terminalAt) return 'already_terminal'

  await db
    .update(agentRuns)
    .set({ status: 'cancelling', updatedAt: new Date() })
    .where(eq(agentRuns.id, runId))

  const live = liveRuns.get(runId)
  if (live) live.controller.abort()
  else await reconcileStuckAgentRun(deps, workspaceId, runId)
  return 'cancelled'
}

/**
 * A run whose process is gone (restart, crash) reconciles to an honest
 * interrupted error — never silently completed.
 */
export async function reconcileStuckAgentRun(
  deps: RunEngineDeps,
  workspaceId: string,
  runId: string,
): Promise<void> {
  const { db } = deps
  const rows = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.workspaceId, workspaceId)))
    .limit(1)
  const run = rows[0]
  if (!run || run.terminalAt) return
  await db
    .update(agentRuns)
    .set({
      status: 'error',
      errorCode: 'interrupted',
      errorMessage: 'The run was interrupted before completion.',
      updatedAt: new Date(),
      terminalAt: new Date(),
    })
    .where(eq(agentRuns.id, runId))
  await appendAgentEvent(db, {
    workspaceId,
    sessionId: run.sessionId,
    runId,
    type: 'error',
    payload: { status: 'error', errorCode: 'interrupted', errorMessage: 'The run was interrupted before completion.' },
  })
}

export type { NodePgDatabase, schema }
