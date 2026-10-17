import { create } from 'zustand'
import type {
  AttachmentMeta,
  Conversation,
  MessageNode,
  ModelInfo,
  Preferences,
  PreviewState,
  ProviderCredential,
  ProviderProfile,
  ToolId,
  ToastState,
  PersistedState,
} from '@/domain/types'
import {
  activePath,
  attachNode,
  createNode,
  deepestLeaf,
  deriveTitle,
  siblingsOf,
  switchToNode,
} from '@/domain/conversationTree'
import type { ChatAdapter, ChatTurn } from '@/domain/chatAdapter'
import { createMockAdapter } from '@/services/mock/mockChatAdapter'
import { createLiveAdapter } from '@/services/live/liveChatAdapter'
import {
  buildSeedConversations,
  buildSeedProviders,
  DEFAULT_PREFERENCES,
} from '@/services/mock/fixtures'
import {
  clearPersisted,
  loadPersisted,
  savePersisted,
} from '@/services/storage/localStorage'
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
} from '@/services/storage/credentials'
import { makeId } from '@/domain/ids'

interface UiState {
  searchOpen: boolean
  settingsOpen: boolean
  /** Section to focus when the settings dialog opens (e.g. 'providers'). */
  settingsSection: string | null
  mobileSidebarOpen: boolean
  preview: PreviewState | null
}

export interface AppStore {
  hydrated: boolean
  conversations: Record<string, Conversation>
  activeConversationId: string | null
  preferences: Preferences
  providers: ProviderProfile[]
  activeProviderId: string | null
  activeModelId: string | null
  /** Provider credentials — kept OUT of the persisted/serialized app data. */
  credentials: Record<string, ProviderCredential>
  ui: UiState
  toast: ToastState | null

  initialize: () => void
  resetDemoData: () => void
  clearHistory: () => void
  exportAllData: () => string

  newConversation: (options?: { temporary?: boolean }) => string
  selectConversation: (id: string) => void
  renameConversation: (id: string, title: string) => void
  togglePin: (id: string) => void
  toggleArchive: (id: string) => void
  deleteConversation: (id: string) => void
  setTemporary: (id: string, temporary: boolean) => void

  sendMessage: (params: {
    text: string
    attachments?: AttachmentMeta[]
    tools?: ToolId[]
  }) => Promise<void>
  stopGeneration: () => void
  regenerate: (assistantNodeId: string) => Promise<void>
  editUserMessage: (nodeId: string, newText: string) => Promise<void>
  switchSibling: (nodeId: string, direction: 1 | -1) => void
  setFeedback: (nodeId: string, feedback: 'up' | 'down' | null) => void
  deleteMessage: (nodeId: string) => void

  updatePreferences: (patch: Partial<Preferences>) => void
  addProvider: (profile: ProviderProfile) => void
  updateProvider: (profile: ProviderProfile) => void
  removeProvider: (id: string) => void
  setActiveModel: (providerId: string, modelId: string) => void
  setCredential: (providerId: string, credential: ProviderCredential) => void
  clearCredential: (providerId: string) => void

  setUi: (patch: Partial<UiState>) => void
  openPreview: (preview: PreviewState) => void
  closePreview: () => void
  showToast: (message: string, options?: { actionLabel?: string; onAction?: () => void }) => void
  dismissToast: () => void
}

/* ------------------------------------------------------------------ */
/* Adapter + abort management (module-scoped, never persisted)         */
/* ------------------------------------------------------------------ */

let activeAdapter: ChatAdapter = createMockAdapter()
let activeAbort: AbortController | null = null

/** Replace the chat adapter (used by tests; the UI never needs this). */
export function setChatAdapter(adapter: ChatAdapter): void {
  activeAdapter = adapter
}

/**
 * Pick the adapter for the next turn: when the active provider has a
 * connected credential and a selected model, chat runs live against the
 * user's own endpoint; otherwise fall back to the local demo adapter
 * (or the adapter a test injected). Keys never leave this path.
 */
function resolveAdapter(): ChatAdapter {
  const { providers, activeProviderId, activeModelId, credentials } = useAppStore.getState()
  const provider = providers.find((p) => p.id === activeProviderId)
  const credential = activeProviderId ? credentials[activeProviderId] : undefined
  if (provider && activeModelId && credential?.status === 'connected' && credential.apiKey) {
    return createLiveAdapter(provider, credential.apiKey, activeModelId)
  }
  return activeAdapter
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export const useAppStore = create<AppStore>()((set, get) => ({
  hydrated: false,
  conversations: {},
  activeConversationId: null,
  preferences: { ...DEFAULT_PREFERENCES },
  providers: [],
  activeProviderId: null,
  activeModelId: null,
  credentials: {},
  ui: {
    searchOpen: false,
    settingsOpen: false,
    settingsSection: null,
    mobileSidebarOpen: false,
    preview: null,
  },
  toast: null,

  initialize: () => {
    if (get().hydrated) return
    const loaded = loadPersisted()
    // Credentials load from their own storage key, separate from app data,
    // so they survive alongside profiles but never travel with exports.
    const credentials = loadCredentials()
    if (loaded.state) {
      const conversations: Record<string, Conversation> = {}
      for (const conversation of loaded.state.conversations) {
        conversations[conversation.id] = conversation
      }
      set({
        hydrated: true,
        conversations,
        activeConversationId: null,
        preferences: { ...DEFAULT_PREFERENCES, ...loaded.state.preferences },
        providers: loaded.state.providers,
        activeProviderId: loaded.state.activeProviderId,
        activeModelId: loaded.state.activeModelId,
        credentials,
      })
    } else {
      get().resetDemoData()
      if (loaded.recoveredFrom) {
        get().showToast(
          'Saved data was unreadable, so a fresh demo workspace was created. A backup of the old data was kept locally.',
        )
      }
    }
  },

  resetDemoData: () => {
    const providers = buildSeedProviders()
    const conversations: Record<string, Conversation> = {}
    for (const conversation of buildSeedConversations()) {
      conversations[conversation.id] = conversation
    }
    clearPersisted()
    // Seed profiles replace everything the user configured, so their
    // credentials are orphaned — drop them to avoid connected keys pointing
    // at endpoints that no longer exist.
    clearCredentials()
    set({
      hydrated: true,
      conversations,
      activeConversationId: null,
      preferences: { ...get().preferences },
      providers,
      activeProviderId: providers[0]?.id ?? null,
      activeModelId: 'demo-pro',
      credentials: {},
    })
  },

  clearHistory: () => {
    set((state) => {
      const conversations: Record<string, Conversation> = {}
      for (const [id, conversation] of Object.entries(state.conversations)) {
        if (conversation.temporary) conversations[id] = conversation
      }
      return { conversations, activeConversationId: null }
    })
  },

  exportAllData: () => JSON.stringify(serialize(get()), null, 2),

  newConversation: (options) => {
    const now = Date.now()
    const conversation: Conversation = {
      id: makeId('c'),
      title: 'New chat',
      createdAt: now,
      updatedAt: now,
      pinned: false,
      archived: false,
      temporary: options?.temporary ?? false,
      nodes: {},
      activeLeafId: null,
    }
    set((state) => {
      const conversations: Record<string, Conversation> = {}
      for (const [id, existing] of Object.entries(state.conversations)) {
        // Drop abandoned empty chats, except the one currently open.
        if (Object.keys(existing.nodes).length === 0 && id !== state.activeConversationId) {
          continue
        }
        conversations[id] = existing
      }
      conversations[conversation.id] = conversation
      return {
        conversations,
        activeConversationId: conversation.id,
        ui: { ...state.ui, mobileSidebarOpen: false },
      }
    })
    return conversation.id
  },

  selectConversation: (id) => {
    set((state) => {
      if (!state.conversations[id]) return state
      const conversations: Record<string, Conversation> = {}
      for (const [existingId, existing] of Object.entries(state.conversations)) {
        if (
          Object.keys(existing.nodes).length === 0 &&
          existingId !== state.activeConversationId &&
          existingId !== id
        ) {
          continue
        }
        conversations[existingId] = existing
      }
      return {
        conversations,
        activeConversationId: id,
        ui: { ...state.ui, mobileSidebarOpen: false },
      }
    })
  },

  renameConversation: (id, title) => {
    updateConversation(id, (draft) => {
      draft.title = title.trim() || draft.title
      draft.updatedAt = Date.now()
    })
  },

  togglePin: (id) => {
    updateConversation(id, (draft) => {
      draft.pinned = !draft.pinned
      draft.updatedAt = Date.now()
    })
  },

  toggleArchive: (id) => {
    updateConversation(id, (draft) => {
      draft.archived = !draft.archived
      draft.updatedAt = Date.now()
    })
  },

  deleteConversation: (id) => {
    const snapshot = get().conversations[id]
    if (!snapshot) return
    set((state) => {
      const conversations = { ...state.conversations }
      delete conversations[id]
      return {
        conversations,
        activeConversationId: state.activeConversationId === id ? null : state.activeConversationId,
      }
    })
    get().showToast('Conversation deleted', {
      actionLabel: 'Undo',
      onAction: () => {
        set((state) => ({
          conversations: { ...state.conversations, [snapshot.id]: snapshot },
        }))
      },
    })
  },

  setTemporary: (id, temporary) => {
    updateConversation(id, (draft) => {
      draft.temporary = temporary
    })
  },

  sendMessage: async ({ text, attachments = [], tools = [] }) => {
    const trimmed = text.trim()
    if (!trimmed && attachments.length === 0) return

    let conversationId = get().activeConversationId
    let conversation = conversationId ? get().conversations[conversationId] : null
    if (!conversation) {
      conversationId = get().newConversation()
      conversation = get().conversations[conversationId]
    }
    if (!conversation || !conversationId) return

    const userNode = createNode('user', trimmed, conversation.activeLeafId, Date.now(), {
      tools,
      attachments,
    })
    updateConversation(conversationId, (draft) => {
      attachNode(draft, userNode)
      if (draft.title === 'New chat' && trimmed) {
        draft.title = deriveTitle(trimmed)
      }
    })

    const previewTool = tools.find(
      (tool) => tool === 'research' || tool === 'images' || tool === 'voice' || tool === 'canvas',
    )
    if (previewTool) {
      get().openPreview({ kind: previewTool, brief: trimmed })
    }

    await runAssistantTurn(conversationId, userNode)
  },

  stopGeneration: () => {
    activeAbort?.abort()
  },

  regenerate: async (assistantNodeId) => {
    const { conversations } = get()
    const conversation = Object.values(conversations).find((c) => c.nodes[assistantNodeId])
    if (!conversation) return
    const node = conversation.nodes[assistantNodeId]
    const parentNode = node.parentId ? conversation.nodes[node.parentId] : null
    if (!parentNode || parentNode.role !== 'user') return
    await runAssistantTurn(conversation.id, parentNode)
  },

  editUserMessage: async (nodeId, newText) => {
    const trimmed = newText.trim()
    if (!trimmed) return
    const { conversations } = get()
    const conversation = Object.values(conversations).find((c) => c.nodes[nodeId])
    if (!conversation) return
    const original = conversation.nodes[nodeId]
    if (original.role !== 'user') return

    const edited = createNode('user', trimmed, original.parentId, Date.now(), {
      tools: original.tools,
      attachments: original.attachments,
    })
    updateConversation(conversation.id, (draft) => {
      attachNode(draft, edited)
    })
    await runAssistantTurn(conversation.id, edited)
  },

  switchSibling: (nodeId, direction) => {
    const { conversations, activeConversationId } = get()
    const conversation = activeConversationId ? conversations[activeConversationId] : null
    if (!conversation) return
    const siblings = siblingsOf(conversation, nodeId)
    const index = siblings.findIndex((node) => node.id === nodeId)
    if (index === -1) return
    const target = siblings[index + direction]
    if (!target) return
    updateConversation(conversation.id, (draft) => {
      switchToNode(draft, target.id)
    })
  },

  setFeedback: (nodeId, feedback) => {
    const { conversations, activeConversationId } = get()
    const conversation = activeConversationId ? conversations[activeConversationId] : null
    if (!conversation || !conversation.nodes[nodeId]) return
    const current = conversation.nodes[nodeId].feedback
    updateNode(conversation.id, nodeId, { feedback: current === feedback ? null : feedback })
  },

  deleteMessage: (nodeId) => {
    const { conversations } = get()
    const snapshot = Object.values(conversations).find((c) => c.nodes[nodeId])
    if (!snapshot || !snapshot.nodes[nodeId]) return

    // Collect the node and its whole subtree — deleting a message removes
    // everything that depends on it in that branch.
    const doomed = new Set<string>([nodeId])
    const stack = [nodeId]
    while (stack.length > 0) {
      const current = stack.pop() as string
      for (const node of Object.values(snapshot.nodes)) {
        if (node.parentId === current && !doomed.has(node.id)) {
          doomed.add(node.id)
          stack.push(node.id)
        }
      }
    }

    set((state) => {
      const previous = state.conversations[snapshot.id]
      const nodes: Conversation['nodes'] = {}
      for (const node of Object.values(previous.nodes)) {
        if (!doomed.has(node.id)) nodes[node.id] = node
      }

      // Re-anchor the visible thread: if the active leaf was removed, fall
      // back to the deleted node's parent (following its latest remaining
      // continuation), then to the latest surviving root.
      let activeLeafId = previous.activeLeafId
      if (activeLeafId && doomed.has(activeLeafId)) {
        const parentId = previous.nodes[nodeId].parentId
        if (parentId && nodes[parentId]) {
          activeLeafId = deepestLeaf({ ...previous, nodes }, parentId)
        } else {
          const roots = Object.values(nodes)
            .filter((node) => node.parentId === null || !nodes[node.parentId])
            .sort((a, b) => a.createdAt - b.createdAt)
          activeLeafId = roots.length > 0 ? roots[roots.length - 1].id : null
        }
      }

      return {
        conversations: {
          ...state.conversations,
          [snapshot.id]: {
            ...previous,
            nodes,
            activeLeafId,
            updatedAt: Date.now(),
          },
        },
      }
    })

    get().showToast('Message deleted', {
      actionLabel: 'Undo',
      onAction: () => {
        set((state) => ({
          conversations: { ...state.conversations, [snapshot.id]: snapshot },
        }))
      },
    })
  },

  updatePreferences: (patch) => {
    set((state) => ({ preferences: { ...state.preferences, ...patch } }))
  },

  addProvider: (profile) => {
    set((state) => ({ providers: [...state.providers, profile] }))
  },

  updateProvider: (profile) => {
    set((state) => ({
      providers: state.providers.map((p) => (p.id === profile.id ? profile : p)),
    }))
  },

  removeProvider: (id) => {
    set((state) => {
      const credentials = { ...state.credentials }
      delete credentials[id]
      saveCredentials(credentials)
      return {
        providers: state.providers.filter((p) => p.id !== id),
        activeProviderId: state.activeProviderId === id ? null : state.activeProviderId,
        activeModelId: state.activeProviderId === id ? null : state.activeModelId,
        credentials,
      }
    })
  },

  setActiveModel: (providerId, modelId) => {
    set({ activeProviderId: providerId, activeModelId: modelId })
  },

  setCredential: (providerId, credential) => {
    set((state) => {
      const credentials = { ...state.credentials, [providerId]: credential }
      saveCredentials(credentials)
      return { credentials }
    })
  },

  clearCredential: (providerId) => {
    set((state) => {
      if (!state.credentials[providerId]) return state
      const credentials = { ...state.credentials }
      delete credentials[providerId]
      saveCredentials(credentials)
      return { credentials }
    })
  },

  setUi: (patch) => {
    set((state) => ({ ui: { ...state.ui, ...patch } }))
  },

  openPreview: (preview) => {
    set((state) => ({ ui: { ...state.ui, preview } }))
  },

  closePreview: () => {
    set((state) => ({ ui: { ...state.ui, preview: null } }))
  },

  showToast: (message, options) => {
    const toast: ToastState = {
      id: makeId('t'),
      message,
      actionLabel: options?.actionLabel,
      onAction: options?.onAction,
    }
    set({ toast })
    if (toastTimer) clearTimeout(toastTimer)
    toastTimer = setTimeout(() => set({ toast: null }), 8000)
  },

  dismissToast: () => {
    if (toastTimer) clearTimeout(toastTimer)
    set({ toast: null })
  },
}))

/* ------------------------------------------------------------------ */
/* Internal helpers                                                    */
/* ------------------------------------------------------------------ */

let toastTimer: ReturnType<typeof setTimeout> | undefined

function updateConversation(id: string, mutate: (draft: Conversation) => void): void {
  useAppStore.setState((state) => {
    const existing = state.conversations[id]
    if (!existing) return state
    const draft: Conversation = { ...existing, nodes: { ...existing.nodes } }
    mutate(draft)
    return { conversations: { ...state.conversations, [id]: draft } }
  })
}

function updateNode(
  conversationId: string,
  nodeId: string,
  patch: Partial<MessageNode>,
): void {
  updateConversation(conversationId, (draft) => {
    const node = draft.nodes[nodeId]
    if (node) {
      draft.nodes[nodeId] = { ...node, ...patch }
    }
  })
}

async function runAssistantTurn(conversationId: string, userNode: MessageNode): Promise<void> {
  const assistant = createNode('assistant', '', userNode.id, Date.now())
  updateConversation(conversationId, (draft) => {
    attachNode(draft, assistant)
  })

  const { conversations, preferences } = useAppStore.getState()
  const conversation = conversations[conversationId]
  if (!conversation) return

  const history: ChatTurn[] = activePath(conversation)
    .filter((node) => node.id !== assistant.id && node.id !== userNode.id)
    .map((node) => ({ role: node.role, content: node.content }))

  const controller = new AbortController()
  activeAbort = controller

  try {
    await resolveAdapter().stream(
      {
        prompt: userNode.content,
        history,
        tools: userNode.tools ?? [],
        attachments: userNode.attachments ?? [],
        nickname: preferences.nickname,
        traits: preferences.traits,
      },
      {
        onStart: (draft) => {
          updateNode(conversationId, assistant.id, {
            sources: draft.sources,
            statusPrefix: draft.statusPrefix,
          })
        },
        onDelta: (text) => {
          const current = useAppStore.getState().conversations[conversationId]?.nodes[assistant.id]
          if (!current) return
          updateNode(conversationId, assistant.id, { content: current.content + text })
        },
        onDone: (reason) => {
          updateNode(conversationId, assistant.id, {
            status: reason === 'stopped' ? 'stopped' : 'complete',
          })
        },
        onError: (error) => {
          updateNode(conversationId, assistant.id, { status: 'error', error: error.message })
        },
      },
      controller.signal,
    )
  } finally {
    if (activeAbort === controller) activeAbort = null
  }
}

/* ------------------------------------------------------------------ */
/* Persistence wiring                                                  */
/* ------------------------------------------------------------------ */

function serialize(state: AppStore): PersistedState {
  return {
    version: 1,
    savedAt: Date.now(),
    conversations: Object.values(state.conversations).filter((c) => !c.temporary),
    preferences: state.preferences,
    providers: state.providers,
    activeProviderId: state.activeProviderId,
    activeModelId: state.activeModelId,
  }
}

let saveTimer: ReturnType<typeof setTimeout> | undefined

export function flushPersistence(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  const state = useAppStore.getState()
  if (!state.hydrated) return
  savePersisted(serialize(state))
}

useAppStore.subscribe(() => {
  const state = useAppStore.getState()
  if (!state.hydrated) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushPersistence, 400)
})

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushPersistence)
}

/** Test-only helper: wipe state (and optionally storage) for a fresh run. */
export function resetStoreForTests(options: { keepStorage?: boolean } = {}): void {
  if (!options.keepStorage) clearPersisted()
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  if (toastTimer) {
    clearTimeout(toastTimer)
    toastTimer = undefined
  }
  activeAbort = null
  clearCredentials()
  useAppStore.setState({
    hydrated: false,
    conversations: {},
    activeConversationId: null,
    preferences: { ...DEFAULT_PREFERENCES },
    providers: [],
    activeProviderId: null,
    activeModelId: null,
    credentials: {},
    ui: {
    searchOpen: false,
    settingsOpen: false,
    settingsSection: null,
    mobileSidebarOpen: false,
    preview: null,
  },
    toast: null,
  })
}

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

export function selectActiveConversation(state: AppStore): Conversation | null {
  if (!state.activeConversationId) return null
  return state.conversations[state.activeConversationId] ?? null
}

export function selectActiveModel(
  state: AppStore,
): { provider: ProviderProfile; model: ModelInfo } | null {
  const provider = state.providers.find((p) => p.id === state.activeProviderId)
  if (!provider) return null
  const model = provider.models.find((m) => m.id === state.activeModelId)
  if (!model) return null
  return { provider, model }
}

export interface SearchHit {
  conversationId: string
  title: string
  snippet: string
  matchIn: 'title' | 'content'
  updatedAt: number
  pinned: boolean
  archived: boolean
  temporary: boolean
}

function buildSnippet(content: string, query: string): string {
  const lower = content.toLowerCase()
  const index = lower.indexOf(query)
  if (index === -1) return content.slice(0, 90).replace(/\s+/g, ' ')
  const start = Math.max(0, index - 36)
  const end = Math.min(content.length, index + query.length + 48)
  const middle = content.slice(start, end).replace(/\s+/g, ' ').trim()
  return `${start > 0 ? '…' : ''}${middle}${end < content.length ? '…' : ''}`
}

export function searchConversations(
  conversations: Record<string, Conversation>,
  query: string,
): SearchHit[] {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return []
  const hits: SearchHit[] = []

  for (const conversation of Object.values(conversations)) {
    const titleMatch = conversation.title.toLowerCase().includes(normalized)
    let contentNode: MessageNode | null = null
    if (!titleMatch) {
      const nodes = Object.values(conversation.nodes).sort((a, b) => a.createdAt - b.createdAt)
      for (const node of nodes) {
        if (node.content.toLowerCase().includes(normalized)) {
          contentNode = node
          break
        }
      }
    }
    if (!titleMatch && !contentNode) continue

    const firstUser = Object.values(conversation.nodes)
      .sort((a, b) => a.createdAt - b.createdAt)
      .find((node) => node.role === 'user')

    hits.push({
      conversationId: conversation.id,
      title: conversation.title,
      snippet: titleMatch
        ? buildSnippet(firstUser?.content ?? conversation.title, normalized)
        : buildSnippet(contentNode!.content, normalized),
      matchIn: titleMatch ? 'title' : 'content',
      updatedAt: conversation.updatedAt,
      pinned: conversation.pinned,
      archived: conversation.archived,
      temporary: conversation.temporary,
    })
  }

  return hits.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30)
}
