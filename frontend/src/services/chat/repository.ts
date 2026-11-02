/**
 * Workspace mode dispatch (U021): every workspace operation resolves
 * ONE backend at operation time from the current mode — local (this
 * browser) or server (the signed-in Uni workspace). Switching mode
 * changes only which backend subsequent operations use: it never
 * copies data, moves active pointers, or splits a write across both
 * stores.
 */

import type {
  ChatWorkspaceRepository,
  WorkspaceMode,
} from '@/domain/chatRepositories'
import { localChatRepository } from './localChatRepository'
import { createServerChatRepository } from './serverChatRepository'

let serverRepository: ChatWorkspaceRepository | null = null

/**
 * The repository for a mode. The server repository is created lazily
 * and cached (it reads live sign-in state per operation through its
 * `ready` guard).
 */
export function chatRepositoryFor(mode: WorkspaceMode): ChatWorkspaceRepository {
  if (mode === 'server') {
    serverRepository ??= createServerChatRepository()
    return serverRepository
  }
  return localChatRepository
}
