import { create } from 'zustand'
import { makeId } from '@/domain/ids'
import type { ChatStreamHandlers } from '@/domain/chatAdapter'
import { createLiveAdapter } from '@/services/live/liveChatAdapter'

/**
 * Side-by-side model comparison.
 *
 * Isolation rules (all enforced here, not by the UI):
 * - Each slot has its own AbortController in this module's own registry —
 *   comparison is NEVER routed through the active-chat controller, so
 *   stopping one side can never cancel a conversation, and vice versa.
 * - One slot's failure or stop never erases the other slot's result.
 * - Runs are stored WITHOUT credentials; only provider/model ids, labels,
 *   the prompt, the context flag, and results.
 * - Nothing auto-runs: a run starts only from an explicit user action.
 */

export interface CompareSlot {
  providerId: string
  modelId: string
  modelLabel: string
  providerLabel: string
}

export type CompareResultStatus = 'idle' | 'running' | 'complete' | 'stopped' | 'error'

export interface CompareResult {
  status: CompareResultStatus
  content: string
  error: string | null
  startedAt: number | null
  endedAt: number | null
}

export interface CompareRun {
  id: string
  prompt: string
  /** Whether the conversation's context block was included. */
  contextIncluded: boolean
  mode: 'demo' | 'live'
  slots: [CompareSlot, CompareSlot]
  results: [CompareResult, CompareResult]
  createdAt: number
}

export interface CompareHistoryEntry {
  id: string
  prompt: string
  mode: 'demo' | 'live'
  slots: [CompareSlot, CompareSlot]
  results: [CompareResult, CompareResult]
  createdAt: number
}

const HISTORY_KEY = 'universe:compare:v1'
const MAX_HISTORY = 12

const IDLE: CompareResult = {
  status: 'idle',
  content: '',
  error: null,
  startedAt: null,
  endedAt: null,
}

/* ------------------------------------------------------------------ */
/* Per-slot controller registry (module scope, never persisted)        */
/* ------------------------------------------------------------------ */

const slotControllers = new Map<string, AbortController>()

function controllerKey(runId: string, slotIndex: number): string {
  return `${runId}:${slotIndex}`
}

/* ------------------------------------------------------------------ */
/* Demo responses — clearly labeled fixtures, no provider involved     */
/* ------------------------------------------------------------------ */

const DEMO_RESPONSES = [
  `**Demo response A** (fixture, no provider contacted)

This is a locally generated example so you can see how a comparison works before connecting a provider.

- It streams like a real reply would.
- It is clearly labeled and never presented as a model's actual output.
- Connect an API key in Settings to run a real comparison.`,
  `**Demo response B** (fixture, no provider contacted)

This second fixture differs on purpose — comparing two identical texts would tell you nothing.

- Both columns stream independently.
- Stopping one side leaves the other running.
- No scores, costs, or latencies are invented; only what is measured.`,
]

function streamDemoResponse(
  slotIndex: number,
  handlers: ChatStreamHandlers,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve) => {
    const text = DEMO_RESPONSES[slotIndex] ?? DEMO_RESPONSES[0]
    const chunks = text.match(/\S+\s*/g) ?? [text]
    let index = 0
    const timer = setInterval(() => {
      if (signal.aborted) {
        clearInterval(timer)
        handlers.onDone('stopped')
        resolve()
        return
      }
      if (index >= chunks.length) {
        clearInterval(timer)
        handlers.onDone('complete')
        resolve()
        return
      }
      handlers.onDelta(chunks[index])
      index += 1
    }, 24)
  })
}

/**
 * Test seam: replaces the demo streamer so automated checks can control
 * completion and failure without any provider or key.
 */
export let demoStreamOverride: ((
  slotIndex: number,
  handlers: ChatStreamHandlers,
  signal: AbortSignal,
) => Promise<void>) | null = null

export function setDemoStreamForTests(
  override:
    | ((slotIndex: number, handlers: ChatStreamHandlers, signal: AbortSignal) => Promise<void>)
    | null,
): void {
  demoStreamOverride = override
}

/* ------------------------------------------------------------------ */
/* Adapter resolution per slot (mirrors the chat path, per-slot)       */
/* ------------------------------------------------------------------ */

interface ProviderSnapshot {
  providerId: string
  modelId: string
  apiKey: string | null
  endpoint: string
  kind: string
}

function resolveSlotAdapter(
  slot: CompareSlot,
  snapshot: ProviderSnapshot,
): { adapter: import('@/domain/chatAdapter').ChatAdapter | null; mode: 'demo' | 'live' } {
  if (snapshot.apiKey) {
    return {
      adapter: createLiveAdapter(
        {
          id: slot.providerId,
          label: slot.providerLabel,
          kind: snapshot.kind as never,
          endpointUrl: snapshot.endpoint,
          models: [],
          demo: false,
        },
        snapshot.apiKey,
        slot.modelId,
      ),
      mode: 'live',
    }
  }
  return { adapter: null, mode: 'demo' }
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export interface CompareStore {
  hydrated: boolean
  current: CompareRun | null
  history: CompareHistoryEntry[]

  initialize: () => void
  startComparison: (input: {
    prompt: string
    slots: [CompareSlot, CompareSlot]
    contextBlock: string
    history: { role: 'user' | 'assistant'; content: string }[]
  }) => void
  stopSlot: (slotIndex: number) => void
  stopAll: () => void
  clearCurrent: () => void
}

type StartInput = {
  prompt: string
  slots: [CompareSlot, CompareSlot]
  contextBlock: string
  history: { role: 'user' | 'assistant'; content: string }[]
}

export const useCompareStore = create<CompareStore>()((set, get) => ({
  hydrated: false,
  current: null,
  history: [],

  initialize: () => {
    if (get().hydrated) return
    let history: CompareHistoryEntry[] = []
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as { payload?: { history?: CompareHistoryEntry[] } }
        if (Array.isArray(parsed.payload?.history)) {
          history = parsed.payload.history.slice(0, MAX_HISTORY)
        }
      }
    } catch {
      /* unreadable history is simply dropped */
    }
    set({ hydrated: true, history })
  },

  startComparison: (input: StartInput) => {
    const run: CompareRun = {
      id: makeId('cmp'),
      prompt: input.prompt,
      contextIncluded: input.contextBlock.length > 0,
      mode: 'demo',
      slots: input.slots,
      results: [
        { ...IDLE },
        { ...IDLE },
      ],
      createdAt: Date.now(),
    }
    set({ current: run })

    input.slots.forEach((slot, slotIndex) => {
      void runSlot(run.id, slotIndex, slot, input)
    })
  },

  stopSlot: (slotIndex) => {
    const current = get().current
    if (!current) return
    slotControllers.get(controllerKey(current.id, slotIndex))?.abort()
  },

  stopAll: () => {
    const current = get().current
    if (!current) return
    slotControllers.get(controllerKey(current.id, 0))?.abort()
    slotControllers.get(controllerKey(current.id, 1))?.abort()
  },

  clearCurrent: () => {
    const current = get().current
    if (current) {
      slotControllers.get(controllerKey(current.id, 0))?.abort()
      slotControllers.get(controllerKey(current.id, 1))?.abort()
    }
    set({ current: null })
  },
}))

async function runSlot(
  runId: string,
  slotIndex: number,
  slot: CompareSlot,
  input: StartInput,
): Promise<void> {
  const controller = new AbortController()
  slotControllers.set(controllerKey(runId, slotIndex), controller)

  patchResult(runId, slotIndex, {
    status: 'running',
    content: '',
    error: null,
    startedAt: Date.now(),
    endedAt: null,
  })

  const handlers: ChatStreamHandlers = {
    onStart: () => {},
    onDelta: (text) => {
      const current = useCompareStore.getState().current
      if (!current || current.id !== runId) return
      patchResult(runId, slotIndex, {
        content: current.results[slotIndex].content + text,
      })
    },
    onDone: (reason) => {
      patchResult(runId, slotIndex, {
        status: reason === 'stopped' ? 'stopped' : 'complete',
        endedAt: Date.now(),
      })
      finalize(runId)
    },
    onError: (error) => {
      patchResult(runId, slotIndex, {
        status: 'error',
        error: error.message,
        endedAt: Date.now(),
      })
      finalize(runId)
    },
  }

  try {
    // Read credentials at the moment of the explicit user-triggered run.
    const { useAppStore } = await import('@/state/store')
    const appState = useAppStore.getState()
    const provider = appState.providers.find((p) => p.id === slot.providerId)
    const credential = appState.credentials[slot.providerId]
    const snapshot: ProviderSnapshot = {
      providerId: slot.providerId,
      modelId: slot.modelId,
      apiKey:
        credential?.status === 'connected' && credential.apiKey ? credential.apiKey : null,
      endpoint: provider?.endpointUrl ?? '',
      kind: provider?.kind ?? 'openai-compatible',
    }

    const resolved = resolveSlotAdapter(slot, snapshot)
    setRunMode(runId, resolved.mode)

    // An abort that arrived during adapter resolution (before the stream
    // attached its listener) must still be honored.
    if (controller.signal.aborted) {
      patchResult(runId, slotIndex, { status: 'stopped', endedAt: Date.now() })
      finalize(runId)
      return
    }

    const system = input.contextBlock
      ? `Selected context:\n\n${input.contextBlock}`
      : undefined

    if (resolved.adapter) {
      await resolved.adapter.stream(
        {
          prompt: input.prompt,
          history: input.history,
          tools: [],
          attachments: [],
          nickname: '',
          traits: '',
          system,
        },
        handlers,
        controller.signal,
      )
    } else {
      const streamer = demoStreamOverride ?? streamDemoResponse
      await streamer(slotIndex, handlers, controller.signal)
    }
  } finally {
    slotControllers.delete(controllerKey(runId, slotIndex))
  }
}

function patchResult(runId: string, slotIndex: number, patch: Partial<CompareResult>): void {
  useCompareStore.setState((state) => {
    const current = state.current
    if (!current || current.id !== runId) return state
    const results: [CompareResult, CompareResult] = [...current.results] as [CompareResult, CompareResult]
    results[slotIndex] = { ...results[slotIndex], ...patch }
    return { current: { ...current, results } }
  })
}

function setRunMode(runId: string, mode: 'demo' | 'live'): void {
  useCompareStore.setState((state) => {
    const current = state.current
    if (!current || current.id !== runId) return state
    if (current.mode === mode) return state
    return { current: { ...current, mode } }
  })
}

/** Persist a finished run into history (credentials never included). */
function finalize(runId: string): void {
  const state = useCompareStore.getState()
  const current = state.current
  if (!current || current.id !== runId) return
  const stillRunning = current.results.some((result) => result.status === 'running')
  if (stillRunning) return

  const entry: CompareHistoryEntry = {
    id: current.id,
    prompt: current.prompt,
    mode: current.mode,
    slots: current.slots,
    results: current.results,
    createdAt: current.createdAt,
  }
  const history = [entry, ...state.history.filter((h) => h.id !== entry.id)].slice(0, MAX_HISTORY)
  useCompareStore.setState({ history })
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify({ version: 1, savedAt: Date.now(), payload: { history } }),
    )
  } catch {
    /* quota — history stays in memory for this session */
  }
}

/** Test-only: reset compare state and storage. */
export function resetCompareStoreForTests(options: { keepStorage?: boolean } = {}): void {
  if (!options.keepStorage) {
    try {
      localStorage.removeItem(HISTORY_KEY)
    } catch {
      /* ignore */
    }
  }
  for (const controller of slotControllers.values()) controller.abort()
  slotControllers.clear()
  setDemoStreamForTests(null)
  useCompareStore.setState({ hydrated: false, current: null, history: [] })
}
