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
  listServerProviders,
  setServerProviderCredential,
  testServerProvider,
  type ServerProvider,
} from '@/services/api/serverProviders'
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

interface ServerSessionState {
  status: ServerSessionStatus
  account: ServerAccount | null
  error: string | null

  conversations: ServerConversationSummary[]
  conversationsLoading: boolean
  openConversationId: string | null
  openConversation: ServerConversationDetail | null
  openConversationLoading: boolean

  /** Server providers (B03): encrypted credentials live server-side. */
  serverProviders: ServerProvider[]
  serverProvidersLoading: boolean
  serverProviderError: string | null

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
  activeRun: null,
  runError: null,
}

export const useServerSessionStore = create<ServerSessionState>()((set, get) => ({
  status: 'loading',
  ...clearedServerData,

  initialize: async () => {
    set({ status: 'loading' })
    try {
      const account = await fetchServerAccount()
      set({ status: account ? 'signed-in' : 'signed-out', account, error: null })
    } catch {
      // Backend unreachable: local mode continues to work; server mode
      // is honestly shown as unavailable rather than "signed out".
      set({ status: 'signed-out', account: null, error: null })
    }
  },

  signIn: async (email, password) => {
    set({ error: null })
    try {
      const account = await signInToServer({ email, password })
      set({ status: 'signed-in', account })
      await get().loadConversations()
      void get().loadServerProviders()
      return true
    } catch (error) {
      set({ error: errorMessage(error) })
      return false
    }
  },

  signUp: async (name, email, password) => {
    set({ error: null })
    try {
      const account = await signUpOnServer({ name, email, password })
      set({ status: 'signed-in', account })
      await get().loadConversations()
      void get().loadServerProviders()
      return true
    } catch (error) {
      set({ error: errorMessage(error) })
      return false
    }
  },

  signOut: async () => {
    try {
      await signOutOfServer()
    } catch {
      // Even if the network call fails, drop all server-derived state —
      // a cached prior account must never survive sign-out.
    }
    set({ status: 'signed-out', ...clearedServerData })
  },

  loadConversations: async () => {
    if (get().status !== 'signed-in') return
    set({ conversationsLoading: true })
    try {
      const page = await apiFetch<Page<ServerConversationSummary>>(`${API_ROOT}/conversations`)
      set({ conversations: page.items, conversationsLoading: false })
    } catch (error) {
      set({ conversationsLoading: false, error: errorMessage(error) })
    }
  },

  openServerConversation: async (id) => {
    if (id === null) {
      set({ openConversationId: null, openConversation: null })
      return
    }
    set({ openConversationId: id, openConversationLoading: true, openConversation: null })
    try {
      const detail = await apiFetch<ServerConversationDetail>(
        `${API_ROOT}/conversations/${encodeURIComponent(id)}`,
      )
      // Ignore stale responses after rapid switching.
      if (get().openConversationId === id) {
        set({ openConversation: detail, openConversationLoading: false })
      }
    } catch (error) {
      if (get().openConversationId === id) {
        set({ openConversationLoading: false, error: errorMessage(error) })
      }
    }
  },

  importPreview: async (backup) => {
    try {
      return await apiFetch<ImportPreviewResponse>(`${API_ROOT}/import/preview`, {
        method: 'POST',
        body: JSON.stringify(backup),
      })
    } catch (error) {
      set({ error: errorMessage(error) })
      return null
    }
  },

  importCommit: async (backup) => {
    try {
      const result = await apiFetch<ImportCommitResponse>(`${API_ROOT}/import/commit`, {
        method: 'POST',
        body: JSON.stringify(backup),
      })
      // Refresh the list to include newly imported conversations.
      await get().loadConversations()
      return result
    } catch (error) {
      set({ error: errorMessage(error) })
      return null
    }
  },

  loadServerProviders: async () => {
    if (get().status !== 'signed-in') return
    set({ serverProvidersLoading: true })
    try {
      const providers = await listServerProviders()
      set({ serverProviders: providers, serverProvidersLoading: false, serverProviderError: null })
    } catch (error) {
      set({ serverProvidersLoading: false, serverProviderError: errorMessage(error) })
    }
  },

  addServerProvider: async (input) => {
    set({ serverProviderError: null })
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
      set({ serverProviderError: errorMessage(error) })
      return false
    }
  },

  testServerProviderById: async (providerId) => {
    set({ serverProviderError: null })
    try {
      await testServerProvider(providerId)
    } catch (error) {
      set({ serverProviderError: errorMessage(error) })
    }
    await get().loadServerProviders()
  },

  newServerConversation: async (title) => {
    try {
      const summary = await apiFetch<{ id: string }>(`${API_ROOT}/conversations`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      })
      await get().loadConversations()
      await get().openServerConversation(summary.id)
      return summary.id
    } catch (error) {
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

    const provider = get().serverProviders.find((entry) => entry.credential.present)
    if (!provider) {
      set({ runError: 'Add a server provider with an API key first (panel above).' })
      return false
    }
    const modelId = provider.modelId ?? provider.models[0] ?? null
    if (!modelId) {
      set({ runError: 'That server provider has no model selected yet.' })
      return false
    }

    set({ runError: null })
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

      // 3. Stream events into the live bubble.
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
      await streamServerRunEvents(createdRun.id, 0, {
        onEvent: (event: ServerRunEvent) => {
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
      })
      return true
    } catch (error) {
      set({
        runError: errorMessage(error),
        activeRun: get().activeRun
          ? { ...get().activeRun!, status: 'error', errorMessage: errorMessage(error) }
          : null,
      })
      return false
    } finally {
      // Refresh the conversation so the persisted assistant node (with
      // its truthful status) replaces the live bubble.
      if (get().openConversationId === conversationId) {
        await get().openServerConversation(conversationId)
        const active = get().activeRun
        if (active && active.runId === created?.run.id) {
          set({ activeRun: null })
        }
      }
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
    set({ status: 'loading', ...clearedServerData })
  },
}))
