import { create } from 'zustand'
import type {
  PluginCapability,
  PluginRunReceipt,
} from '@/domain/pluginTypes'
import { MAX_PLUGIN_RECEIPTS } from '@/domain/pluginTypes'
import { findPlugin } from '@/features/plugins/registry'
import { cancelRunsForAgent, cancelRunsForPlugin } from '@/services/plugins/dispatcher'

/**
 * Plugins store — enabled set, per-agent allow lists, per-thread grants,
 * and the bounded receipt history. Persisted under its own
 * `universe:plugins:v1` slice: no tokens, no keys, no message text —
 * grants and receipts only. Disabling a plugin cancels its in-flight
 * runs through the dispatcher so late results are rejected, not shown.
 */

const STORAGE_KEY = 'universe:plugins:v1'

interface PersistedPlugins {
  version: 1
  savedAt: number
  payload: {
    enabled: string[]
    agentAllowed: Record<string, string[]>
    threadGrants: Record<string, string[]>
    receipts: PluginRunReceipt[]
  }
}

function isReceipt(value: unknown): value is PluginRunReceipt {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.id === 'string' && typeof record.pluginId === 'string'
}

function loadPersisted(): PersistedPlugins | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      (parsed as { version?: number }).version === 1
    ) {
      const payload = (parsed as { payload: unknown }).payload
      if (typeof payload === 'object' && payload !== null) {
        const data = payload as Record<string, unknown>
        if (
          Array.isArray(data.enabled) &&
          data.enabled.every((id) => typeof id === 'string') &&
          Array.isArray(data.receipts) &&
          data.receipts.every(isReceipt)
        ) {
          return parsed as PersistedPlugins
        }
      }
    }
  } catch {
    /* unreadable or quota-blocked — start fresh, quarantine nothing */
  }
  return null
}

function persist(state: PluginsStore): boolean {
  try {
    // Ordinary-chat grants are session-only by design (m07/F09): a chat
    // thread's grants live and die with the browsing session. Temporary
    // chats are stricter still — their receipts are never persisted, so
    // no temporary conversation reference or content survives a reload.
    const threadGrants: Record<string, string[]> = {}
    for (const [key, grants] of Object.entries(state.threadGrants)) {
      if (key.startsWith('chat:')) continue
      threadGrants[key] = grants
    }
    const receipts = state.receipts.filter(
      (receipt) => !(receipt.thread?.kind === 'chat' && receipt.thread.temporary),
    )
    const payload: PersistedPlugins = {
      version: 1,
      savedAt: Date.now(),
      payload: {
        enabled: Object.keys(state.enabled),
        agentAllowed: state.agentAllowed,
        threadGrants,
        receipts,
      },
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

export interface PluginsStore {
  hydrated: boolean
  enabled: Record<string, true>
  agentAllowed: Record<string, string[]>
  threadGrants: Record<string, string[]>
  receipts: PluginRunReceipt[]
  storageWarningShown: boolean

  initialize: () => void

  enablePlugin: (pluginId: string) => void
  disablePlugin: (pluginId: string) => void

  setAgentAllowed: (agentId: string, pluginIds: string[]) => void
  isAgentAllowed: (agentId: string, pluginId: string) => boolean

  grantThread: (threadKey: string, pluginId: string) => void
  revokeThread: (threadKey: string, pluginId: string) => void
  isThreadGranted: (threadKey: string, pluginId: string) => boolean

  recordReceipt: (receipt: PluginRunReceipt) => void
  updateReceipt: (runId: string, patch: Partial<PluginRunReceipt>) => void
  receiptsForThread: (thread: PluginRunReceipt['thread']) => PluginRunReceipt[]

  /** Effective access — the intersection the dispatcher enforces. */
  effectiveAccess: (options: {
    pluginId: string
    capability?: PluginCapability
    agentId?: string | null
    threadKey?: string | null
  }) => {
    exists: boolean
    enabled: boolean
    allowedForAgent: boolean
    grantedForThread: boolean
    integrationRequired: boolean
  }
}

export const usePluginsStore = create<PluginsStore>()((set, get) => ({
  hydrated: false,
  enabled: {},
  agentAllowed: {},
  threadGrants: {},
  receipts: [],
  storageWarningShown: false,

  initialize: () => {
    if (get().hydrated) return
    const persisted = loadPersisted()
    if (persisted) {
      const enabled: Record<string, true> = {}
      for (const id of persisted.payload.enabled) {
        // Unknown ids (removed catalogue entries) are dropped, not faked.
        if (findPlugin(id)) enabled[id] = true
      }
      set({
        hydrated: true,
        enabled,
        agentAllowed: persisted.payload.agentAllowed ?? {},
        threadGrants: persisted.payload.threadGrants ?? {},
        receipts: persisted.payload.receipts.slice(0, MAX_PLUGIN_RECEIPTS),
      })
    } else {
      set({ hydrated: true })
    }
  },

  enablePlugin: (pluginId) => {
    const plugin = findPlugin(pluginId)
    if (!plugin || plugin.execution !== 'local-built-in') return
    set((state) => ({ enabled: { ...state.enabled, [pluginId]: true } }))
  },

  disablePlugin: (pluginId) => {
    // Cancel in-flight runs first; late results are rejected by the
    // dispatcher and the receipts keep their honest cancelled state.
    cancelRunsForPlugin(pluginId)
    set((state) => {
      if (!(pluginId in state.enabled)) return state
      const enabled = { ...state.enabled }
      delete enabled[pluginId]
      return { enabled }
    })
  },

  setAgentAllowed: (agentId, pluginIds) => {
    // Cancelling in-flight runs whose access is being removed (F06):
    // only THIS employee's runs of the removed plugins stop.
    const previous = get().agentAllowed[agentId] ?? []
    for (const removed of previous) {
      if (!pluginIds.includes(removed)) cancelRunsForAgent(removed, agentId)
    }
    set((state) => ({
      agentAllowed: { ...state.agentAllowed, [agentId]: pluginIds },
    }))
  },

  isAgentAllowed: (agentId, pluginId) => {
    return (get().agentAllowed[agentId] ?? []).includes(pluginId)
  },

  grantThread: (threadKey, pluginId) => {
    set((state) => {
      const current = state.threadGrants[threadKey] ?? []
      if (current.includes(pluginId)) return state
      return {
        threadGrants: { ...state.threadGrants, [threadKey]: [...current, pluginId] },
      }
    })
  },

  revokeThread: (threadKey, pluginId) => {
    set((state) => {
      const current = state.threadGrants[threadKey] ?? []
      if (!current.includes(pluginId)) return state
      return {
        threadGrants: {
          ...state.threadGrants,
          [threadKey]: current.filter((id) => id !== pluginId),
        },
      }
    })
  },

  isThreadGranted: (threadKey, pluginId) => {
    return (get().threadGrants[threadKey] ?? []).includes(pluginId)
  },

  recordReceipt: (receipt) => {
    set((state) => ({
      receipts: [receipt, ...state.receipts].slice(0, MAX_PLUGIN_RECEIPTS),
    }))
  },

  updateReceipt: (runId, patch) => {
    set((state) => ({
      receipts: state.receipts.map((receipt) =>
        receipt.id === runId ? { ...receipt, ...patch } : receipt,
      ),
    }))
  },

  receiptsForThread: (thread) => {
    return get()
      .receipts.filter((receipt) => {
        if (!receipt.thread || !thread) return false
        if (receipt.thread.kind !== thread.kind) return false
        if (receipt.thread.kind === 'work' && thread.kind === 'work') {
          return receipt.thread.taskId === thread.taskId
        }
        if (receipt.thread.kind === 'agent' && thread.kind === 'agent') {
          return receipt.thread.conversationId === thread.conversationId
        }
        if (receipt.thread.kind === 'chat' && thread.kind === 'chat') {
          return receipt.thread.conversationId === thread.conversationId
        }
        return false
      })
      .sort((a, b) => b.at - a.at)
  },

  effectiveAccess: ({ pluginId, agentId, threadKey }) => {
    const plugin = findPlugin(pluginId)
    const state = get()
    return {
      exists: !!plugin,
      enabled: !!state.enabled[pluginId],
      allowedForAgent: agentId ? state.isAgentAllowed(agentId, pluginId) : true,
      grantedForThread: threadKey ? state.isThreadGranted(threadKey, pluginId) : true,
      integrationRequired: plugin?.execution === 'integration-required',
    }
  },
}))

/* ------------------------------------------------------------------ */
/* Persistence wiring                                                  */
/* ------------------------------------------------------------------ */

let saveTimer: ReturnType<typeof setTimeout> | undefined

let storageWarned = false

export function flushPluginsPersistence(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  const state = usePluginsStore.getState()
  if (!state.hydrated) return
  const saved = persist(state)
  if (!saved && !storageWarned) {
    storageWarned = true
    import('@/state/store').then(({ useAppStore }) => {
      useAppStore.getState().showToast(
        'Local storage is full or blocked — plugin settings may not survive a reload.',
      )
    })
  }
}

usePluginsStore.subscribe(() => {
  const state = usePluginsStore.getState()
  if (!state.hydrated) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushPluginsPersistence, 400)
})

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPluginsPersistence)
}

/** Test-only: wipe plugins state (and optionally storage). */
export function resetPluginsStoreForTests(options: { keepStorage?: boolean } = {}): void {
  try {
    if (!options.keepStorage) localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  usePluginsStore.setState({
    hydrated: false,
    enabled: {},
    agentAllowed: {},
    threadGrants: {},
    receipts: [],
    storageWarningShown: false,
  })
}
