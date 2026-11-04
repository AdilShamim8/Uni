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
  deleteServerProvider as deleteServerProviderApi,
  discoverServerProviderModels,
  listServerProviders,
  patchServerProviderModel as patchServerProviderModelApi,
  setServerProviderCredential,
  type ServerProvider,
  type ServerProviderTestResponse,
} from '@/services/api/serverProviders'
import {
  cancelServerRun,
  createServerRun,
  streamServerRunEvents,
  type ServerRunEvent,
} from '@/services/api/serverRuns'
import {
  beginServerSend,
  clearServerSends,
  completeServerSend,
  retryOnNetworkFailure,
} from '@/services/api/sendIdentity'
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
 * The explicit server-chat destination (N004): exact provider and model
 * IDs chosen by the user. Lookups are ALWAYS by ID — creating, deleting
 * or reordering other profiles can never silently change where a send
 * goes. Persisted per workspace (server-derived identity, U009-scoped)
 * so reload preserves the choice; a stale selection (deleted provider
 * or model) is an explicit unavailable state, never an automatic
 * fallback (N005).
 */
export interface ServerSelection {
  providerId: string
  modelId: string
}

const SERVER_SELECTION_PREFIX = 'universe:server-selection:v1:'

function loadStoredSelection(workspaceId: string): ServerSelection | null {
  try {
    const raw = localStorage.getItem(SERVER_SELECTION_PREFIX + workspaceId)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as ServerSelection).providerId === 'string' &&
      typeof (parsed as ServerSelection).modelId === 'string'
    ) {
      return parsed as ServerSelection
    }
    return null
  } catch {
    return null
  }
}

function storeSelection(workspaceId: string, selection: ServerSelection): void {
  try {
    localStorage.setItem(SERVER_SELECTION_PREFIX + workspaceId, JSON.stringify(selection))
  } catch {
    /* storage unavailable — the in-memory choice still governs this session */
  }
}

function clearStoredSelection(workspaceId: string): void {
  try {
    localStorage.removeItem(SERVER_SELECTION_PREFIX + workspaceId)
  } catch {
    /* ignore */
  }
}

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

  /** The explicit server-chat destination (N004). */
  serverSelection: ServerSelection | null
  /** Explicit notice when the chosen destination was removed (N005). */
  serverSelectionNotice: string | null

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
    /** Empty/omitted for keyless connections (N003, keyless-capable protocols only). */
    apiKey?: string
  }) => Promise<boolean>
  testServerProviderById: (providerId: string) => Promise<void>
  /** Choose the exact server-chat destination (N004). */
  setServerSelection: (providerId: string, modelId: string) => void
  /**
   * Manual model setup (N010): persist an exact model id on the provider
   * row — for endpoints whose discovery fails or lists nothing usable.
   * When the provider is the selected destination, the destination
   * follows the explicit manual choice; when no destination exists yet,
   * a usable provider with a manual model becomes it (the same explicit
   * first-destination rule as adding a provider). It never switches
   * away from a DIFFERENT selected provider (N004).
   */
  setServerProviderModel: (providerId: string, modelId: string) => Promise<boolean>
  deleteServerProvider: (providerId: string) => Promise<void>

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
  | 'serverSelection'
  | 'serverSelectionNotice'
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
  serverSelection: null,
  serverSelectionNotice: null,
  activeRun: null,
  runError: null,
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
        set({
          status: account ? 'signed-in' : 'signed-out',
          account,
          error: null,
          serverSelection: account ? loadStoredSelection(account.workspace.id) : null,
        })
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
        clearServerSends()
        set({
          ...clearedServerData,
          status: 'signed-in',
          account,
          serverSelection: loadStoredSelection(account.workspace.id),
        })
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
        clearServerSends()
        set({
          ...clearedServerData,
          status: 'signed-in',
          account,
          serverSelection: loadStoredSelection(account.workspace.id),
        })
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
      clearServerSends()
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
        // N005: an initial default is only allowed when the list had NO
        // usable destination before this load (fresh sign-in, or the
        // first usable provider ever). When a usable provider existed —
        // e.g. the chosen one was just deleted while others remain —
        // the empty selection stays an explicit unavailable state;
        // switching to another (possibly paid) provider automatically
        // would be a silent fallback.
        const usableWithModel = (entry: ServerProvider): boolean =>
          (entry.credential.present || entry.authMode === 'none') &&
          (entry.modelId ?? entry.models[0] ?? null) !== null
        const hadUsableBefore = get().serverProviders.some(usableWithModel)
        set({ serverProviders: providers, serverProvidersLoading: false, serverProviderError: null })
        // Initial default only (N004): when the user has never chosen a
        // destination, the first usable provider with a model becomes it —
        // visible in the picker and changeable at any time. An EXISTING
        // selection is never rewritten by list changes.
        if (!get().serverSelection && !hadUsableBefore) {
          const first = providers.find(usableWithModel)
          const modelId = first ? (first.modelId ?? first.models[0] ?? null) : null
          if (first && modelId) {
            get().setServerSelection(first.id, modelId)
          }
        }
      } catch (error) {
        if (!stillCurrent(generation)) return
        set({ serverProvidersLoading: false, serverProviderError: errorMessage(error) })
      }
    },

    addServerProvider: async (input) => {
      set({ serverProviderError: null })
      const generation = get().sessionGeneration
      try {
        const apiKey = (input.apiKey ?? '').trim()
        const keyless = apiKey.length === 0
        if (keyless && input.kind !== 'openai-compatible') {
          set({ serverProviderError: 'Anthropic connections need an API key.' })
          return false
        }
        const provider = await createServerProvider({
          label: input.label,
          kind: input.kind,
          // Keyless connections are explicit on the server (N001/N002):
          // authMode 'none' persists the choice; a key switches the row
          // to its protocol's keyed transport server-side.
          authMode: keyless ? 'none' : undefined,
          endpointUrl: input.endpointUrl,
          modelId: input.modelId,
        })
        if (!keyless) {
          await setServerProviderCredential(provider.id, apiKey)
        }
        await get().loadServerProviders()
        // First usable provider becomes the initial destination (an
        // explicit choice the user can change); an EXISTING selection is
        // never rewritten by adding another profile (N004).
        if (!get().serverSelection) {
          const modelId = provider.modelId ?? provider.models[0] ?? null
          if (modelId) {
            get().setServerSelection(provider.id, modelId)
          }
        }
        return true
      } catch (error) {
        if (!stillCurrent(generation)) return false
        set({ serverProviderError: errorMessage(error) })
        return false
      }
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

    setServerSelection: (providerId, modelId) => {
      // The destination is stored by exact IDs and validated against the
      // loaded provider list (N004): reordering or adding profiles can
      // never change what a send addresses.
      const provider = get().serverProviders.find((entry) => entry.id === providerId)
      if (!provider) return
      const modelKnown =
        provider.modelId === modelId || provider.models.includes(modelId)
      if (!modelKnown) return
      const selection: ServerSelection = { providerId, modelId }
      set({ serverSelection: selection, runError: null, serverSelectionNotice: null })
      const account = get().account
      if (account) storeSelection(account.workspace.id, selection)
    },

    setServerProviderModel: async (providerId, modelId) => {
      set({ serverProviderError: null })
      const generation = get().sessionGeneration
      try {
        const updated = await patchServerProviderModelApi(providerId, modelId)
        if (!stillCurrent(generation)) return false
        // Patch the row in place; the discovered catalog is untouched.
        set({
          serverProviders: get().serverProviders.map((entry) =>
            entry.id === providerId ? updated : entry,
          ),
        })
        const selection = get().serverSelection
        if (selection?.providerId === providerId) {
          // The selected provider's manual model becomes the
          // destination's model — an explicit choice, not a fallback.
          get().setServerSelection(providerId, modelId)
        } else if (!selection) {
          // No destination yet: a usable provider with a manual model
          // becomes it (the same rule as adding the first provider).
          const usable = updated.credential.present || updated.authMode === 'none'
          if (usable) get().setServerSelection(providerId, modelId)
        }
        return true
      } catch (error) {
        if (!stillCurrent(generation)) return false
        set({ serverProviderError: errorMessage(error) })
        return false
      }
    },

    deleteServerProvider: async (providerId) => {
      set({ serverProviderError: null })
      const generation = get().sessionGeneration
      try {
        await deleteServerProviderApi(providerId)
        if (!stillCurrent(generation)) return
        // Removing the CHOSEN provider leaves an explicit unavailable
        // state (N005): the selection is cleared with a clear notice —
        // never an automatic fallback to another (possibly paid) one.
        const selection = get().serverSelection
        if (selection?.providerId === providerId) {
          set({
            serverSelection: null,
            runError: null,
            serverSelectionNotice:
              'The selected provider was removed — server chat is unavailable until you pick another destination above. Existing conversations are kept.',
          })
          const account = get().account
          if (account) clearStoredSelection(account.workspace.id)
        }
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
   * node, create a run against the first credentialed server provider,
   * and stream the run's events into a live assistant bubble. On any
   * failure the error is shown honestly — never a fabricated reply.
   */
  sendServerMessage: async (text) => {
    const trimmed = text.trim()
    const conversationId = get().openConversationId
    const conversation = get().openConversation
    if (!trimmed || !conversationId || !conversation) return false
    if (get().activeRun) return false

    // The destination is the user's explicit selection (N004) — looked
    // up by exact ID, with explicit unavailable states instead of any
    // automatic fallback (N005).
    const selection = get().serverSelection
    if (!selection) {
      set({
        runError:
          'Choose a provider and model for server chat — pick them above the composer (Settings → Account).',
      })
      return false
    }
    const provider = get().serverProviders.find((entry) => entry.id === selection.providerId)
    if (!provider) {
      set({
        runError:
          'The selected provider is no longer available — it was removed. Pick another provider above the composer; nothing was sent.',
      })
      return false
    }
    if (!provider.credential.present && provider.authMode !== 'none') {
      set({
        runError: `The selected provider (${provider.label}) has no usable key — add one in Settings → Account, or pick a keyless provider.`,
      })
      return false
    }
    const modelId = selection.modelId
    const modelStillKnown = provider.modelId === modelId || provider.models.includes(modelId)
    if (!modelStillKnown) {
      set({
        runError: `The selected model (${modelId}) is no longer offered by ${provider.label} — pick a model above the composer.`,
      })
      return false
    }

    set({ runError: null })
    const generation = get().sessionGeneration
    // N019 — ONE operation id for this logical send, reused across
    // network retries (automatic below, manual on re-press) and page
    // reload (persisted). It is the node clientId AND (as `run-<opId>`)
    // the run idempotency key, so the server's N016–N018 idempotency
    // semantics apply to the real browser send path.
    const workspaceId = get().account?.workspace.id ?? 'unknown-workspace'
    const opId = beginServerSend(workspaceId, conversationId, trimmed)
    let created: {
      run: {
        id: string
        status: 'running' | 'cancelling' | 'complete' | 'stopped' | 'repetition_stopped' | 'error'
      }
      events: ServerRunEvent[]
    } | null = null
    try {
      // 1. The user node. Same op id on every attempt: a network retry
      // or a re-press replays the one node (N018), never a duplicate.
      const nodeResult = await retryOnNetworkFailure(
        () =>
          apiFetch<{
            node: ServerMessageNode
            conversation: ServerConversationDetail
            reused: boolean
          }>(`${API_ROOT}/conversations/${encodeURIComponent(conversationId)}/nodes`, {
            method: 'POST',
            body: JSON.stringify({
              role: 'user',
              content: trimmed,
              status: 'complete',
              clientId: opId,
            }),
          }),
        { signal: sessionScope.signal },
      )
      if (!stillCurrent(generation)) return false
      set({ openConversation: nodeResult.conversation })

      // 2. The run — idempotent by the SAME operation (`run-<opId>`).
      // The server binds the key to the effective request (N016) and
      // resolves concurrent same-key creation to one run (N017), so a
      // network retry here replays the run rather than starting a
      // second provider invocation.
      const idempotencyKey = `run-${opId}`
      const runResponse = await retryOnNetworkFailure(
        () =>
          createServerRun(conversationId, {
            parentNodeId: nodeResult.node.id,
            providerId: provider.id,
            modelId,
            idempotencyKey,
          }),
        { signal: sessionScope.signal },
      )
      // The client has now SEEN node + run exist server-side; the
      // logical send is complete. A later resend of the same text is a
      // NEW logical send (fresh ids, no replay of the finished run).
      completeServerSend(workspaceId, conversationId, opId)
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
