/**
 * The local (browser) chat repository (U021): wraps the app store's
 * conversation operations behind the backend-neutral repository
 * contract. Everything stays in this browser; nothing is sent anywhere.
 */

import type {
  ChatConversationSummary,
  ChatNodeRecord,
  ChatWorkspaceRepository,
  LoadedConversation,
} from '@/domain/chatRepositories'
import { useAppStore } from '@/state/store'
import type { Conversation, MessageNode } from '@/domain/types'

function toSummary(conversation: Conversation): ChatConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    pinned: conversation.pinned,
    archived: conversation.archived,
    updatedAt: conversation.updatedAt,
    messageCount: Object.values(conversation.nodes).length,
  }
}

function toNodeRecord(node: MessageNode): ChatNodeRecord {
  return {
    id: node.id,
    parentId: node.parentId,
    role: node.role,
    content: node.content,
    status: node.status,
    createdAt: node.createdAt,
    activeLeafId: null,
  }
}

function findConversation(conversationId: string): Conversation | undefined {
  return useAppStore.getState().conversations[conversationId]
}

export const localChatRepository: ChatWorkspaceRepository = {
  mode: 'local',
  get ready() {
    return true
  },

  async listConversations() {
    return Object.values(useAppStore.getState().conversations)
      .map(toSummary)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  },

  async createConversation(title) {
    const store = useAppStore.getState()
    const id = store.newConversation()
    store.renameConversation(id, title)
    const conversation = findConversation(id)
    if (!conversation) throw new Error('Local conversation was not created.')
    return toSummary(conversation)
  },

  async renameConversation(conversationId, title) {
    if (!findConversation(conversationId)) throw new Error('Conversation not found.')
    useAppStore.getState().renameConversation(conversationId, title)
  },

  async setPinned(conversationId, pinned) {
    const conversation = findConversation(conversationId)
    if (!conversation) throw new Error('Conversation not found.')
    if (conversation.pinned !== pinned) useAppStore.getState().togglePin(conversationId)
  },

  async setArchived(conversationId, archived) {
    const conversation = findConversation(conversationId)
    if (!conversation) throw new Error('Conversation not found.')
    if (conversation.archived !== archived) {
      useAppStore.getState().toggleArchive(conversationId)
    }
  },

  async deleteConversation(conversationId) {
    if (!findConversation(conversationId)) throw new Error('Conversation not found.')
    useAppStore.getState().deleteConversation(conversationId)
  },

  async loadConversation(conversationId): Promise<LoadedConversation | null> {
    const conversation = findConversation(conversationId)
    if (!conversation) return null
    return {
      summary: toSummary(conversation),
      nodes: Object.values(conversation.nodes).map(toNodeRecord),
      activeLeafId: conversation.activeLeafId,
    }
  },
}
