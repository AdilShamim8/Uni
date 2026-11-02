/**
 * The server chat repository (U021): wraps the Uni server's
 * conversation API behind the backend-neutral repository contract.
 * Reads/writes go to the owned server workspace over HTTP; the local
 * browser store is never touched by these operations.
 */

import {
  API_ROOT,
  apiFetch,
  ApiError,
} from '@/services/api/client'
import type {
  ChatConversationSummary,
  ChatWorkspaceRepository,
  LoadedConversation,
} from '@/domain/chatRepositories'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerConversationDetail, ServerConversationSummary } from '@/state/serverSessionStore'

function toSummary(conversation: ServerConversationSummary): ChatConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    pinned: conversation.pinned,
    archived: conversation.archived,
    updatedAt: conversation.updatedAt,
    messageCount: conversation.messageCount,
  }
}

async function requireSignedIn(): Promise<void> {
  const status = useServerSessionStore.getState().status
  if (status !== 'signed-in') {
    throw new ApiError(
      { code: 'unauthenticated', requestId: '-', message: 'The server workspace needs a signed-in account first.' },
      401,
    )
  }
}

async function patchConversation(
  conversationId: string,
  body: Record<string, unknown>,
): Promise<void> {
  await requireSignedIn()
  await apiFetch(
    `${API_ROOT}/conversations/${encodeURIComponent(conversationId)}`,
    { method: 'PATCH', body: JSON.stringify(body) },
  )
}

export function createServerChatRepository(): ChatWorkspaceRepository {
  return {
    mode: 'server',
    get ready() {
      return useServerSessionStore.getState().status === 'signed-in'
    },

    async listConversations() {
      await requireSignedIn()
      const page = await apiFetch<{ items: ServerConversationSummary[] }>(`${API_ROOT}/conversations`)
      return page.items.map(toSummary)
    },

    async createConversation(title) {
      await requireSignedIn()
      const created = await apiFetch<ServerConversationSummary>(`${API_ROOT}/conversations`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      })
      return toSummary(created)
    },

    async renameConversation(conversationId, title) {
      await patchConversation(conversationId, { title })
    },

    async setPinned(conversationId, pinned) {
      await patchConversation(conversationId, { pinned })
    },

    async setArchived(conversationId, archived) {
      await patchConversation(conversationId, { archived })
    },

    async deleteConversation(conversationId) {
      await requireSignedIn()
      await apiFetch(`${API_ROOT}/conversations/${encodeURIComponent(conversationId)}`, {
        method: 'DELETE',
      })
    },

    async loadConversation(conversationId): Promise<LoadedConversation | null> {
      await requireSignedIn()
      try {
        const detail = await apiFetch<ServerConversationDetail>(
          `${API_ROOT}/conversations/${encodeURIComponent(conversationId)}`,
        )
        return {
          summary: toSummary(detail),
          nodes: detail.nodes.map((node) => ({
            id: node.id,
            parentId: node.parentId,
            role: node.role,
            content: node.content,
            status: node.status,
            createdAt: node.createdAt,
            activeLeafId: null,
          })),
          activeLeafId: detail.activeLeafId,
        }
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null
        throw error
      }
    },
  }
}
