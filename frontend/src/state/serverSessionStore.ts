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
  'account' | 'error' | 'conversations' | 'conversationsLoading' | 'openConversationId' | 'openConversation' | 'openConversationLoading'
> = {
  account: null,
  error: null,
  conversations: [],
  conversationsLoading: false,
  openConversationId: null,
  openConversation: null,
  openConversationLoading: false,
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

  resetForTests: () => {
    set({ status: 'loading', ...clearedServerData })
  },
}))
