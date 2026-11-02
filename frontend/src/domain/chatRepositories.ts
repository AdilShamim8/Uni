/**
 * Domain repository interfaces for the chat workspace (U021): the
 * single contract every workspace operation goes through, with TWO
 * backends — the local (browser) store and the Uni server. The main UI
 * reads/writes ONE selected backend per operation, chosen by the
 * current workspace mode; switching modes never copies data or moves
 * active pointers between stores.
 */

import type { MessageNode } from './types'

export type WorkspaceMode = 'local' | 'server'

/** Backend-neutral conversation summary (sidebar rows). */
export interface ChatConversationSummary {
  id: string
  title: string
  pinned: boolean
  archived: boolean
  /** Epoch milliseconds of the last update. */
  updatedAt: number
  messageCount: number
}

/** Backend-neutral chat node, preserving branching and status. */
export interface ChatNodeRecord {
  id: string
  parentId: string | null
  role: MessageNode['role']
  content: string
  status: MessageNode['status']
  createdAt: number
  /** The conversation's currently active leaf, set by loadNodes. */
  activeLeafId: string | null
}

export interface LoadedConversation {
  summary: ChatConversationSummary
  nodes: ChatNodeRecord[]
  activeLeafId: string | null
}

/**
 * One workspace backend. Local and server implementations each satisfy
 * exactly this contract — no operation reaches around it.
 */
export interface ChatWorkspaceRepository {
  readonly mode: WorkspaceMode
  /**
   * Whether the backend can serve operations right now: always true
   * locally; on the server, only while signed in.
   */
  readonly ready: boolean
  listConversations(): Promise<ChatConversationSummary[]>
  createConversation(title: string): Promise<ChatConversationSummary>
  renameConversation(conversationId: string, title: string): Promise<void>
  setPinned(conversationId: string, pinned: boolean): Promise<void>
  setArchived(conversationId: string, archived: boolean): Promise<void>
  deleteConversation(conversationId: string): Promise<void>
  loadConversation(conversationId: string): Promise<LoadedConversation | null>
}

/** Thrown when an operation is dispatched to a backend that is not ready. */
export class WorkspaceNotReadyError extends Error {
  constructor(mode: WorkspaceMode) {
    super(
      mode === 'server'
        ? 'The server workspace needs a signed-in account first.'
        : 'The local workspace is not ready.',
    )
    this.name = 'WorkspaceNotReadyError'
  }
}
