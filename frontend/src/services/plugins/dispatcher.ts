import type {
  PluginCapability,
  PluginRunReceipt,
  PluginThreadRef,
} from '@/domain/pluginTypes'
import { findPlugin } from '@/features/plugins/registry'
import { usePluginsStore } from '@/state/pluginsStore'

/**
 * Plugin dispatcher (milestone 06) — the single execution boundary.
 *
 * Invariants:
 * - Capability and access are validated BEFORE any adapter runs: the
 *   plugin must exist, be a local built-in, be enabled, be allowed for
 *   the employee (when one is in scope), and be granted for the thread
 *   (when one is in scope). Hiding a button is never the enforcement.
 * - Every run has a unique id and an AbortController; disabling a plugin
 *   or revoking a thread grant cancels its in-flight runs.
 * - A late result from a cancelled/revoked run is rejected — the receipt
 *   keeps its honest cancelled/revoked status and is never upgraded to
 *   success afterwards.
 * - Failures and rejections are recorded as receipts; nothing is ever
 *   presented as successful execution when it did not happen.
 *
 * The adapter registry is the boundary for future external/MCP tools;
 * this milestone registers local built-ins only. No remote code runs.
 */

export interface AdapterContext {
  runId: string
  signal: AbortSignal
  thread: PluginThreadRef | null
}

export interface AdapterResult {
  summary: string
  detail?: string
  artifactId?: string | null
}

export type PluginAdapter<Input = unknown> = (
  input: Input,
  context: AdapterContext,
) => Promise<AdapterResult>

const adapters = new Map<PluginCapability, PluginAdapter<never>>()

/** Register a local adapter for a capability (typed boundary). */
export function registerAdapter<Input>(
  capability: PluginCapability,
  adapter: PluginAdapter<Input>,
): void {
  adapters.set(capability, adapter as PluginAdapter<never>)
}

export function adapterCount(): number {
  return adapters.size
}

/** Test seam: clear the registry between suites. */
export function resetAdaptersForTests(): void {
  adapters.clear()
}

/* ------------------------------------------------------------------ */
/* Active runs                                                         */
/* ------------------------------------------------------------------ */

interface ActiveRun {
  runId: string
  pluginId: string
  capability: PluginCapability
  abort: AbortController
}

const activeRuns = new Map<string, ActiveRun>()

export function activeRunCount(): number {
  return activeRuns.size
}

/**
 * Cancel every in-flight run for a plugin (disable/revoke path). Receipts
 * were already recorded as running; the rejection below finalizes them.
 */
export function cancelRunsForPlugin(pluginId: string): void {
  for (const run of activeRuns.values()) {
    if (run.pluginId === pluginId) run.abort.abort()
  }
}

/** Test seam: abort everything. */
export function abortAllPluginRunsForTests(): void {
  for (const run of activeRuns.values()) run.abort.abort()
  activeRuns.clear()
}

/* ------------------------------------------------------------------ */
/* Dispatch                                                            */
/* ------------------------------------------------------------------ */

export type DispatchFailureCode =
  | 'unknown-plugin'
  | 'integration-required'
  | 'not-enabled'
  | 'not-allowed-for-agent'
  | 'not-granted-for-thread'
  | 'capability-not-implemented'
  | 'capability-not-offered'
  | 'aborted'
  | 'adapter-error'

export type DispatchOutcome =
  | { ok: true; runId: string }
  | { ok: false; code: DispatchFailureCode; message: string }

export interface DispatchRequest {
  pluginId: string
  capability: PluginCapability
  actionLabel: string
  thread?: PluginThreadRef | null
  agentId?: string | null
}

function threadKeyOf(thread: PluginThreadRef | null | undefined): string | null {
  if (!thread) return null
  return thread.kind === 'work' ? `work:${thread.taskId}` : `agent:${thread.conversationId}`
}

/**
 * Validate access without executing — used for previews and tests.
 * Mirrors exactly what dispatch() enforces.
 */
export function checkAccess(request: DispatchRequest): DispatchOutcome {
  const plugin = findPlugin(request.pluginId)
  if (!plugin) {
    return {
      ok: false,
      code: 'unknown-plugin',
      message: 'That plugin is not in the catalogue.',
    }
  }
  if (plugin.execution === 'integration-required') {
    return {
      ok: false,
      code: 'integration-required',
      message: `${plugin.name} needs a real integration that Uni does not have yet — nothing connected, nothing run.`,
    }
  }
  if (!plugin.capabilities.includes(request.capability)) {
    return {
      ok: false,
      code: 'capability-not-offered',
      message: `${plugin.name} does not offer that action.`,
    }
  }
  const access = usePluginsStore.getState().effectiveAccess({
    pluginId: request.pluginId,
    capability: request.capability,
    agentId: request.agentId ?? null,
    threadKey: threadKeyOf(request.thread),
  })
  if (!access.enabled) {
    return {
      ok: false,
      code: 'not-enabled',
      message: `${plugin.name} is not enabled. Enable it in Plugins first.`,
    }
  }
  if (request.agentId && !access.allowedForAgent) {
    return {
      ok: false,
      code: 'not-allowed-for-agent',
      message: `${plugin.name} is not allowed for this employee. Allow it from the employee’s plugin settings.`,
    }
  }
  if (request.thread && !access.grantedForThread) {
    return {
      ok: false,
      code: 'not-granted-for-thread',
      message: `${plugin.name} is not granted to this thread. Grant it from the composer’s plugin picker.`,
    }
  }
  if (!adapters.has(request.capability)) {
    return {
      ok: false,
      code: 'capability-not-implemented',
      message: 'That action has no local implementation yet.',
    }
  }
  return { ok: true, runId: '' }
}

const ACCESS_REJECTION_CODES: readonly DispatchFailureCode[] = [
  'not-enabled',
  'not-allowed-for-agent',
  'not-granted-for-thread',
]

/**
 * Execute a plugin action through the validated boundary. The promise
 * resolves when the run settles (or is rejected before starting); it
 * never throws — outcomes are values.
 *
 * Access rejections are recorded as bounded receipts (status 'error',
 * never 'success') so a blocked attempt stays part of the thread's honest
 * history — the visible rejection contract every caller shares.
 */
export async function dispatch(
  request: DispatchRequest,
  input: unknown,
  externalSignal?: AbortSignal,
): Promise<DispatchOutcome> {
  const precheck = checkAccess(request)
  if (!precheck.ok) {
    if (ACCESS_REJECTION_CODES.includes(precheck.code)) {
      usePluginsStore.getState().recordReceipt({
        id: `plugrej-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        pluginId: request.pluginId,
        capability: request.capability,
        actionLabel: request.actionLabel,
        status: 'error',
        at: Date.now(),
        finishedAt: Date.now(),
        thread: request.thread ?? null,
        error: `Not executed — ${precheck.message}`,
      })
    }
    return precheck
  }

  const runId = `plugrun-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const abort = new AbortController()
  const run: ActiveRun = {
    runId,
    pluginId: request.pluginId,
    capability: request.capability,
    abort,
  }
  activeRuns.set(runId, run)
  if (externalSignal) {
    if (externalSignal.aborted) abort.abort()
    else externalSignal.addEventListener('abort', () => abort.abort(), { once: true })
  }

  const store = usePluginsStore.getState()
  const receipt: PluginRunReceipt = {
    id: runId,
    pluginId: request.pluginId,
    capability: request.capability,
    actionLabel: request.actionLabel,
    status: 'running',
    at: Date.now(),
    finishedAt: null,
    thread: request.thread ?? null,
  }
  store.recordReceipt(receipt)

  // Finalize honestly at abort time: the moment a run is cancelled
  // (disable, revoke, or an external signal) its receipt stops claiming
  // to run — so a late adapter resolution can never upgrade it to success.
  abort.signal.addEventListener('abort', () => {
    const current = usePluginsStore
      .getState()
      .receipts.find((entry) => entry.id === runId)
    if (current?.status === 'running') {
      usePluginsStore.getState().updateReceipt(runId, {
        status: 'cancelled',
        finishedAt: Date.now(),
        error: 'The run was cancelled before it finished.',
      })
    }
  }, { once: true })

  const adapter = adapters.get(request.capability)
  if (!adapter) {
    activeRuns.delete(runId)
    usePluginsStore.getState().updateReceipt(runId, {
      status: 'error',
      finishedAt: Date.now(),
      error: 'No local implementation for that action.',
    })
    return {
      ok: false,
      code: 'capability-not-implemented',
      message: 'That action has no local implementation yet.',
    }
  }

  try {
    const result = await (adapter as PluginAdapter<unknown>)(input, {
      runId,
      signal: abort.signal,
      thread: request.thread ?? null,
    })
    // Late-result rejection: if the run was cancelled or revoked while the
    // adapter worked, its receipt no longer says running — never upgrade
    // it to success.
    const current = usePluginsStore
      .getState()
      .receipts.find((entry) => entry.id === runId)
    if (!current || current.status !== 'running') {
      return { ok: false, code: 'aborted', message: 'The run was cancelled before it finished.' }
    }
    usePluginsStore.getState().updateReceipt(runId, {
      status: 'success',
      finishedAt: Date.now(),
      summary: result.summary,
      detail: result.detail,
      artifactId: result.artifactId ?? null,
    })
    return { ok: true, runId }
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === 'AbortError'
        ? 'The run was cancelled.'
        : error instanceof Error
          ? error.message
          : 'The plugin action failed.'
    const current = usePluginsStore
      .getState()
      .receipts.find((entry) => entry.id === runId)
    if (current && current.status === 'running') {
      usePluginsStore.getState().updateReceipt(runId, {
        status: abort.signal.aborted ? 'cancelled' : 'error',
        finishedAt: Date.now(),
        error: message,
      })
    }
    return { ok: false, code: abort.signal.aborted ? 'aborted' : 'adapter-error', message }
  } finally {
    if (activeRuns.get(runId) === run) activeRuns.delete(runId)
  }
}

/**
 * Revoke a plugin from a thread: future calls fail the access check and
 * in-flight runs for that thread are aborted with an honest receipt.
 */
export function revokeAndCancelThreadRuns(thread: PluginThreadRef, pluginId: string): void {
  const key = threadKeyOf(thread)
  if (key) usePluginsStore.getState().revokeThread(key, pluginId)
  for (const run of activeRuns.values()) {
    if (run.pluginId !== pluginId) continue
    // Abort; the dispatcher marks receipts cancelled, and if the plugin
    // was disabled outright the disable path handles the rest.
    run.abort.abort()
  }
  // Mark any still-open receipts for this thread+plugin as revoked (a
  // receipt the abort listener already moved to cancelled is upgraded to
  // the more specific revoked state; finalized successes/errors stay).
  const store = usePluginsStore.getState()
  for (const receipt of store.receipts) {
    if (
      receipt.pluginId === pluginId &&
      (receipt.status === 'running' || receipt.status === 'cancelled') &&
      receipt.thread &&
      threadKeyOf(receipt.thread) === key
    ) {
      store.updateReceipt(receipt.id, {
        status: 'revoked',
        finishedAt: Date.now(),
        error: 'Access was revoked — the action did not complete.',
      })
    }
  }
}
