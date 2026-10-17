import type { Conversation, MessageNode, MessageRole } from './types'
import { makeId } from './ids'

/**
 * Message-tree operations.
 *
 * Branch semantics (defined in frontend/docs/conversation-model.md):
 * - The visible transcript is the path from `activeLeafId` to the root.
 * - Editing a user message and regenerating a response create *siblings*;
 *   nothing is ever silently deleted.
 * - Switching variants re-anchors the active leaf to the chosen sibling and
 *   follows its latest continuation.
 */

export function createNode(
  role: MessageRole,
  content: string,
  parentId: string | null,
  createdAt = Date.now(),
  extra: Partial<MessageNode> = {},
): MessageNode {
  return {
    id: makeId(role === 'user' ? 'u' : 'a'),
    parentId,
    role,
    content,
    createdAt,
    status: role === 'assistant' ? 'streaming' : 'complete',
    feedback: null,
    ...extra,
  }
}

/** The visible transcript: root -> activeLeaf, oldest first. */
export function activePath(conversation: Conversation): MessageNode[] {
  const path: MessageNode[] = []
  const seen = new Set<string>()
  let current = conversation.activeLeafId
    ? conversation.nodes[conversation.activeLeafId]
    : null
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    path.push(current)
    current = current.parentId ? conversation.nodes[current.parentId] : null
  }
  return path.reverse()
}

export function childrenOf(
  conversation: Conversation,
  parentId: string | null,
): MessageNode[] {
  return Object.values(conversation.nodes)
    .filter((node) => node.parentId === parentId)
    .sort((a, b) => a.createdAt - b.createdAt)
}

export function siblingsOf(
  conversation: Conversation,
  nodeId: string,
): MessageNode[] {
  const node = conversation.nodes[nodeId]
  if (!node) return []
  return childrenOf(conversation, node.parentId)
}

/** Follow the last-child chain down to the latest leaf under `fromId`. */
export function deepestLeaf(conversation: Conversation, fromId: string): string {
  let currentId = fromId
  for (;;) {
    const kids = childrenOf(conversation, currentId)
    if (kids.length === 0) return currentId
    currentId = kids[kids.length - 1].id
  }
}

/** Attach a node to a (mutable draft) conversation and make it active. */
export function attachNode(conversation: Conversation, node: MessageNode): void {
  conversation.nodes[node.id] = node
  conversation.activeLeafId = node.id
  conversation.updatedAt = node.createdAt
}

/** Re-anchor the active thread on `nodeId`, bringing its continuation. */
export function switchToNode(conversation: Conversation, nodeId: string): void {
  conversation.activeLeafId = deepestLeaf(conversation, nodeId)
  const node = conversation.nodes[nodeId]
  if (node) conversation.updatedAt = Math.max(conversation.updatedAt, node.createdAt)
}

/** Derive a conversation title from the first user message. */
export function deriveTitle(text: string, max = 48): string {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (cleaned.length <= max) return cleaned
  const cut = cleaned.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + '…'
}

/** Turn count on the active path, used for empty-state checks. */
export function hasContent(conversation: Conversation): boolean {
  return Object.keys(conversation.nodes).length > 0
}
