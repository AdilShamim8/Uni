import { create } from 'zustand'
import {
  API_ROOT,
  apiFetch,
  type ApiErrorEnvelope,
} from '@/services/api/client'
import {
  fetchServerAccount,
  signInToServer,
  signUpOnServer,
  signOutOfServer,
  type ServerAccount,
} from '@/services/api/serverSession'
import {
  createServerProvider,
  discoverServerProviderModels,
  listServerProviders,
  setServerProviderCredential,
  type ServerProvider,
} from '@/services/api/serverProviders'

export type { ServerProvider } from '@/services/api/serverProviders'
import type { ServerProviderTestResponse } from '@/services/api/serverProviders'
import {
  cancelServerRun,
  createServerRun,
  streamServerRunEvents,
  type ServerRunEvent,
} from '@/services/api/serverRuns'
import type {
  ImportCommitResponse,
  ImportPreviewResponse,
  Page,
} from '@/services/api/serverContracts'

/**
 * Server-mode session state — kept strictly separate from the local app
 * store. Server-derived records live ONLY here and are cleared on
 * sign-out/account switch, so a previous user's data can never leak from
 * this cache. Local (localStorage) data is never touched by this store.
 */

export interface ServerConversationSummary {
  id: string
  title: string
  agentId: string | null
  pinned: boolean
  archived: boolean
  activeLeafId: string | null
  createdAt: number
  updatedAt: number
  messageCount: number
}

export interface ServerMessageNode {
  id: string
  parentId: string | null
  role: 'user' | 'assistant'
  status: 'complete' | 'stopped' | 'error'
  content: string
  createdAt: number
  feedback: 'up' | 'down' | null
  error?: string | null
}

export interface ServerConversationDetail extends ServerConversationSummary {
  nodes: ServerMessageNode[]
}

export type ServerSessionStatus = 'loading' | 'signed-out' | 'signed-in'

/**
 * Session-scoped abort registry (F07/U009): every auth transition
 * starts a fresh scope and aborts the previous one, so in-flight
 * subscriptions (run streams) stop with the session that started them.
 */
let sessionScope = new AbortController()

interface ServerSessionState {
  status: ServerSessionStatus
  account: ServerAccount | null
  error: string | null

  conversations: ServerConversationSummary[]
  conversationsLoading: boolean
  openConversationId: string | null
  openConversation: ServerConversationDetail | null
  openConversationLoading: boolean

  /**
   * Monotonic session generation, bumped on every auth transition.
   * Async writers capture it at entry and discard their results if it
   * changed — a delayed response from account A can never repopulate
   * signed-out state or account B (F07).
   */
  sessionGeneration: number

  /** Server providers (B03): encrypted credentials live server-side. */
  serverProviders: ServerProvider[]
  serverProvidersLoading: boolean
  serverProviderError: string | null
  /** Outcome of the last provider Test, shown verbatim (honest feedback). */
  serverProviderTest: (ServerProviderTestResponse & { providerId: string }) | null
  /**
   * The user's deliberate provider+model choice for server chat (U013).
   * When set, sends use exactly this pair — inserting, reordering, or
   * deleting ANOTHER provider can never silently change it; deleting
   * the chosen one asks for a new choice instead of guessing.
   */
  serverChatSelection: { providerId: string; modelId: string } | null

  /** The run currently streaming into the open conversation, if any. */
  activeRun: {
    runId: string
    conversationId: string
    text: string
    status: 'running' | 'cancelling' | 'complete' | 'stopped' | 'repetition_stopped' | 'error'
    errorMessage: string | null
  } | null
  runError: string | null

  loadServerProviders: () => Promise<void>
  addServerProvider: (input: {
    label: string
    kind: 'openai-compatible' | 'anthropic'
    endpointUrl: string
    modelId?: string
    apiKey: string
  }) => Promise<boolean>
  testServerProviderById: (providerId: string) => Promise<void>
  /** Deliberate provider+model choice for server chat (U013). */
  setServerChatSelection: (providerId: string, modelId: string) => void

  newServerConversation: (title: string) => Promise<string | null>
  sendServerMessage: (text: string) => Promise<boolean>
  stopActiveServerRun: () => Promise<void>

  initialize: () => Promise<void>
  signIn: (email: string, password: string) => Promise<boolean>
  signUp: (name: string, email: string, password: string) => Promise<boolean>
  signOut: () => Promise<void>

  loadConversations: () => Promise<void>
  openServerConversation: (id: string | null) => Promise<void>

  importPreview: (backup: unknown) => Promise<ImportPreviewResponse | null>
  importCommit: (backup: unknown) => Promise<ImportCommitResponse | null>

  resetForTests: () => void
}

function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'envelope' in error) {
    const envelope = (error as { envelope: ApiErrorEnvelope }).envelope
    return envelope.message
  }
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong talking to the server.'
}

/** Clear every server-derived field (used on sign-out and test reset). */
const clearedServerData: Pick<
  ServerSessionState,
  | 'account'
  | 'error'
  | 'conversations'
  | 'conversationsLoading'
  | 'openConversationId'
  | 'openConversation'
  | 'openConversationLoading'
  | 'serverProviders'
  | 'serverProvidersLoading'
  | 'serverProviderError'
  | 'serverProviderTest'
  | 'serverChatSelection'
  | 'activeRun'
  | 'runError'
> = {
  account: null,
  error: null,
  conversations: [],
  conversationsLoading: false,
  openConversationId: null,
  openConversation: null,
  openConversationLoading: false,
  serverProviders: [],
  serverProvidersLoading: false,
  serverProviderError: null,
  serverProviderTest: null,
  serverChatSelection: null,
  activeRun: null,
  runError: null,
}

/** True when a provider can serve a run: credentialed, or a no-auth local runtime marked connected (U012). */
export function isServerProviderUsable(provider: ServerProvider): boolean {
  return provider.credential.present || provider.credential.status === 'connected'
}

export const useServerSessionStore = create<ServerSessionState>()((set, get) => {
  /**
   * Start a new session scope: abort in-flight subscriptions from the
   * previous session state and invalidate every async write still in
   * flight from it.
   */
  const bumpSession = () => {
    sessionScope.abort()
    sessionScope = new AbortController()
    set((state) => ({ sessionGeneration: state.sessionGeneration + 1 }))
  }
  /** True when no auth transition happened since `generation` was captured. */
  const stillCurrent = (generation: number): boolean => get().sessionGeneration === generation

  return {
    status: 'loading',
    sessionGeneration: 0,
    ...clearedServerData,

    initialize: async () => {
      bumpSession()
      set({ status: 'loading' })
      const generation = get().sessionGeneration
      try {
        const account = await fetchServerAccount()
        if (!stillCurrent(generation)) return
        set({ status: account ? 'signed-in' : 'signed-out', account, error: null })
      } catch {
        if (!stillCurrent(generation)) return
        // Backend unreachable: local mode continues to work; server mode
        // is honestly shown as unavailable rather than "signed out".
        set({ status: 'signed-out', account: null, error: null })
      }
    },

    signIn: async (email, password) => {
      set({ error: null })
      const generation = get().sessionGeneration
      try {
        const account = await signInToServer({ email, password })
        // New session: invalidate anything still in flight from the
        // signed-out (or previous account) era and clear its data.
        bumpSession()
        set({ ...clearedServerData, status: 'signed-in', account })
        await get().loadConversations()
        void get().loadServerProviders()
        return true
      } catch (error) {
        if (!stillCurrent(generation)) return false
        set({ error: errorMessage(error) })
        return false
      }
    },

    signUp: async (name, email, password) => {
      set({ error: null })
      const generation = get().sessionGeneration
      try {
        const account = await signUpOnServer({ name, email, password })
        bumpSession()
        set({ ...clearedServerData, status: 'signed-in', account })
        await get().loadConversations()
        void get().loadServerProviders()
        return true
      } catch (error) {
        if (!stillCurrent(generation)) return false
        set({ error: errorMessage(error) })
        return false
      }
    },

    signOut: async () => {
      // Fence BEFORE the first await: every async write still in flight
      // from this session must be discarded whenever it lands.
      bumpSession()
      const generation = get().sessionGeneration
      set({ status: 'signed-out', ...clearedServerData })
      try {
        await signOutOfServer()
      } catch {
        // Even if the network call fails, drop all server-derived state —
        // a cached prior account must never survive sign-out. The cookie
        // may still be live server-side; the browser cache is what must
        // not leak. (Confirmed revocation is the server's problem.)
      }
      // A newer transition (e.g. a fast re-sign-in) wins; do not clobber.
      if (!stillCurrent(generation)) return
      set({ status: 'signed-out', ...clearedServerData })
    },

    loadConversations: async () => {
      if (get().status !== 'signed-in') return
      const generation = get().sessionGeneration
      set({ conversationsLoading: true })
      try {
        const page = await apiFetch<Page<ServerConversationSummary>>(`${API_ROOT}/conversations`)
        if (!stillCurrent(generation)) return
        set({ conversations: page.items, conversationsLoading: false })
      } catch (error) {
        if (!stillCurrent(generation)) return
        set({ conversationsLoading: false, error: errorMessage(error) })
      }
    },

    openServerConversation: async (id) => {
      if (id === null) {
        set({ openConversationId: null, openConversation: null })
        return
      }
      const generation = get().sessionGeneration
      set({ openConversationId: id, openConversationLoading: true, openConversation: null })
      try {
        const detail = await apiFetch<ServerConversationDetail>(
          `${API_ROOT}/conversations/${encodeURIComponent(id)}`,
        )
        // Ignore stale responses after rapid switching OR a sign-out /
        // account switch (the same conversation id in another workspace
        // must never hydrate from a previous account's fetch).
        if (stillCurrent(generation) && get().openConversationId === id) {
          set({ openConversation: detail, openConversationLoading: false })
        }
      } catch (error) {
        if (stillCurrent(generation) && get().openConversationId === id) {
          set({ openConversationLoading: false, error: errorMessage(error) })
        }
      }
    },

    importPreview: async (backup) => {
      const generation = get().sessionGeneration
      try {
        return await apiFetch<ImportPreviewResponse>(`${API_ROOT}/import/preview`, {
          method: 'POST',
          body: JSON.stringify(backup),
        })
      } catch (error) {
        if (!stillCurrent(generation)) return null
        set({ error: errorMessage(error) })
        return null
      }
    },

    importCommit: async (backup) => {
      const generation = get().sessionGeneration
      try {
        const result = await apiFetch<ImportCommitResponse>(`${API_ROOT}/import/commit`, {
          method: 'POST',
          body: JSON.stringify(backup),
        })
        // Refresh the list to include newly imported conversations.
        await get().loadConversations()
        return result
      } catch (error) {
        if (!stillCurrent(generation)) return null
        set({ error: errorMessage(error) })
        return null
      }
    },

    loadServerProviders: async () => {
      if (get().status !== 'signed-in') return
      const generation = get().sessionGeneration
      set({ serverProvidersLoading: true })
      try {
        const providers = await listServerProviders()
        if (!stillCurrent(generation)) return
        set({ serverProviders: providers, serverProvidersLoading: false, serverProviderError: null })
      } catch (error) {
        if (!stillCurrent(generation)) return
        set({ serverProvidersLoading: false, serverProviderError: errorMessage(error) })
      }
    },

    addServerProvider: async (input) => {
      set({ serverProviderError: null })
      const generation = get().sessionGeneration
      try {
        const provider = await createServerProvider({
          label: input.label,
          kind: input.kind,
          endpointUrl: input.endpointUrl,
          modelId: input.modelId,
        })
        await setServerProviderCredential(provider.id, input.apiKey)
        await get().loadServerProviders()
        return true
      } catch (error) {
        if (!stillCurrent(generation)) return false
        set({ serverProviderError: errorMessage(error) })
        return false
      }
    },

    setServerChatSelection: (providerId, modelId) => {
      const provider = get().serverProviders.find((entry) => entry.id === providerId)
      if (!provider) return
      const trimmed = modelId.trim()
      if (!trimmed) return
      set({ serverChatSelection: { providerId, modelId: trimmed }, runError: null })
    },

    testServerProviderById: async (providerId) => {
      set({ serverProviderError: null, serverProviderTest: null })
      const generation = get().sessionGeneration
      try {
        // Test + discover in one action: the backend checks the key AND
        // persists the discovered models, so server chat works without the
        // user typing a model id by hand. The result is shown verbatim.
        const result = await discoverServerProviderModels(providerId)
        if (!stillCurrent(generation)) return
        set({ serverProviderTest: { ...result, providerId } })
      } catch (error) {
        if (!stillCurrent(generation)) return
        set({ serverProviderError: errorMessage(error) })
      }
      await get().loadServerProviders()
    },

    newServerConversation: async (title) => {
      const generation = get().sessionGeneration
      try {
        const summary = await apiFetch<{ id: string }>(`${API_ROOT}/conversations`, {
          method: 'POST',
          body: JSON.stringify({ title }),
        })
        if (!stillCurrent(generation)) return null
        await get().loadConversations()
        await get().openServerConversation(summary.id)
        return summary.id
      } catch (error) {
        if (!stillCurrent(generation)) return null
        set({ error: errorMessage(error) })
        return null
      }
    },

  /**
   * Send a message in the open server conversation: append the user
   * node, create a run against the DELIBERATELY chosen provider+model
   * when one is selected (U013 — inserting/reordering/deleting another
   * provider can never silently change that choice), falling back to
   * the first usable provider otherwise. On any failure the error is
   * shown honestly — never a fabricated reply.
   */
  sendServerMessage: async (text) => {
    const trimmed = text.trim()
    const conversationId = get().openConversationId
    const conversation = get().openConversation
    if (!trimmed || !conversationId || !conversation) return false
    if (get().activeRun) return false

    const selection = get().serverChatSelection
    let provider: ServerProvider | undefined
    let modelId: string | null
    if (selection) {
      provider = get().serverProviders.find((entry) => entry.id === selection.providerId)
      if (!provider) {
        // The chosen provider is gone: say so and ask for a new choice —
        // never silently fall back to a different provider.
        set({
          serverChatSelection: null,
          runError: 'The selected provider no longer exists — choose a provider again.',
        })
        return false
      }
      if (!isServerProviderUsable(provider)) {
        set({
          runError: `The selected provider (${provider.label}) is not connected — run Test on it or choose another.`,
        })
        return false
      }
      modelId = selection.modelId
    } else {
      provider = get().serverProviders.find(isServerProviderUsable)
      if (!provider) {
        set({ runError: 'Add a server provider with an API key first (panel above).' })
        return false
      }
      modelId = provider.modelId ?? provider.models[0] ?? null
      if (!modelId) {
        set({
          runError:
            'That server provider has no model yet — click Test on it (Server providers above) to check the key and discover its models.',
        })
        return false
      }
    }

    set({ runError: null })
    const generation = get().sessionGeneration
    let created: {
      run: {
        id: string
        status: 'running' | 'cancelling' | 'complete' | 'stopped' | 'repetition_stopped' | 'error'
      }
      events: ServerRunEvent[]
    } | null = null
    try {
      // 1. The user node (clientId makes a retry a no-op).
      const nodeResult = await apiFetch<{
        node: ServerMessageNode
        conversation: ServerConversationDetail
        reused: boolean
      }>(`${API_ROOT}/conversations/${encodeURIComponent(conversationId)}/nodes`, {
        method: 'POST',
        body: JSON.stringify({
          role: 'user',
          content: trimmed,
          status: 'complete',
          clientId: `send-${Date.now()}-${trimmed.length}`,
        }),
      })
      if (!stillCurrent(generation)) return false
      set({ openConversation: nodeResult.conversation })

      // 2. The run (idempotent by key).
      const idempotencyKey = `run-${nodeResult.node.id}`
      const runResponse = await createServerRun(conversationId, {
        parentNodeId: nodeResult.node.id,
        providerId: provider.id,
        modelId,
        idempotencyKey,
      })
      created = runResponse
      if (!stillCurrent(generation)) return false

      // 3. Stream events into the live bubble. The subscription rides
      // the session scope: a sign-out aborts it, and every write below
      // is fenced by the generation captured above.
      const createdRun = runResponse.run
      set({
        activeRun: {
          runId: createdRun.id,
          conversationId,
          text: created.events
            .filter((event) => event.type === 'delta')
            .map((event) => event.payload.text ?? '')
            .join(''),
          status: createdRun.status,
          errorMessage: null,
        },
      })

      let streamed = ''
      await streamServerRunEvents(
        createdRun.id,
        0,
        {
          onEvent: (event: ServerRunEvent) => {
            if (!stillCurrent(generation)) return
            if (event.type === 'delta') {
              streamed += event.payload.text ?? ''
              const active = get().activeRun
              if (active && active.runId === createdRun.id) {
                set({ activeRun: { ...active, text: streamed } })
              }
            } else if (event.type === 'terminal') {
              const active = get().activeRun
              const status = event.payload.status ?? 'error'
              if (active && active.runId === createdRun.id) {
                set({
                  activeRun: {
                    ...active,
                    status,
                    errorMessage: event.payload.errorMessage ?? null,
                  },
                })
              }
            }
          },
        },
        sessionScope.signal,
      )
      return true
    } catch (error) {
      // A stale (signed-out) session's failure must not paint error
      // state over the cleared store.
      if (!stillCurrent(generation)) return false
      set({
        runError: errorMessage(error),
        activeRun: get().activeRun
          ? { ...get().activeRun!, status: 'error', errorMessage: errorMessage(error) }
          : null,
      })
      return false
    } finally {
      // Refresh the conversation so the persisted assistant node (with
      // its truthful status) replaces the live bubble, and re-fetch the
      // list so summaries (message count, updated time) stay current.
      if (stillCurrent(generation) && get().openConversationId === conversationId) {
        await get().openServerConversation(conversationId)
        const active = get().activeRun
        if (active && active.runId === created?.run.id) {
          set({ activeRun: null })
        }
      }
      void get().loadConversations()
    }
  },

  stopActiveServerRun: async () => {
    const active = get().activeRun
    if (!active) return
    try {
      await cancelServerRun(active.runId)
    } catch {
      // The durable cancel may still land; the refreshed conversation
      // shows the honest stopped state either way.
    }
  },

  resetForTests: () => {
    bumpSession()
    set({ status: 'loading', ...clearedServerData })
  },
}
})
