import { describe, expect, it } from 'vitest'
import type { Conversation, MessageNode } from '@/domain/types'
import {
  activePath,
  attachNode,
  childrenOf,
  createNode,
  deepestLeaf,
  deriveTitle,
  siblingsOf,
  switchToNode,
} from '@/domain/conversationTree'

function node(
  id: string,
  parentId: string | null,
  role: 'user' | 'assistant',
  createdAt: number,
): MessageNode {
  return { id, parentId, role, content: `content-${id}`, createdAt, status: 'complete', feedback: null }
}

function buildTree(): Conversation {
  // u1 -> a1 -> u2 -> a2
  //             \-> u2b -> a2b   (edited branch, newer)
  const nodes: Record<string, MessageNode> = {}
  for (const entry of [
    node('u1', null, 'user', 1),
    node('a1', 'u1', 'assistant', 2),
    node('u2', 'a1', 'user', 3),
    node('a2', 'u2', 'assistant', 4),
    node('u2b', 'a1', 'user', 5),
    node('a2b', 'u2b', 'assistant', 6),
  ]) {
    nodes[entry.id] = entry
  }
  return {
    id: 'c1',
    title: 'Test conversation',
    createdAt: 1,
    updatedAt: 6,
    pinned: false,
    archived: false,
    temporary: false,
    nodes,
    activeLeafId: 'a2',
  }
}

describe('conversation tree operations', () => {
  it('renders the active path from root to leaf, oldest first', () => {
    const path = activePath(buildTree()).map((entry) => entry.id)
    expect(path).toEqual(['u1', 'a1', 'u2', 'a2'])
  })

  it('lists children in creation order', () => {
    const conversation = buildTree()
    expect(childrenOf(conversation, 'a1').map((entry) => entry.id)).toEqual(['u2', 'u2b'])
    expect(childrenOf(conversation, null).map((entry) => entry.id)).toEqual(['u1'])
  })

  it('returns siblings (edit/regenerate variants) of a node', () => {
    const conversation = buildTree()
    expect(siblingsOf(conversation, 'u2').map((entry) => entry.id)).toEqual(['u2', 'u2b'])
    expect(siblingsOf(conversation, 'a2').map((entry) => entry.id)).toEqual(['a2'])
  })

  it('follows the latest continuation when switching variants', () => {
    const conversation = buildTree()
    switchToNode(conversation, 'u2b')
    expect(conversation.activeLeafId).toBe('a2b')
    expect(activePath(conversation).map((entry) => entry.id)).toEqual(['u1', 'a1', 'u2b', 'a2b'])
  })

  it('switching back to the original variant restores its subtree', () => {
    const conversation = buildTree()
    switchToNode(conversation, 'u2b')
    switchToNode(conversation, 'u2')
    expect(activePath(conversation).map((entry) => entry.id)).toEqual(['u1', 'a1', 'u2', 'a2'])
  })

  it('finds the deepest leaf below a node (preferring the newest child)', () => {
    const conversation = buildTree()
    expect(deepestLeaf(conversation, 'a1')).toBe('a2b')
    expect(deepestLeaf(conversation, 'u2')).toBe('a2')
  })

  it('attachNode makes the new node active and bumps updatedAt', () => {
    const conversation = buildTree()
    const fresh = createNode('user', 'new content', 'a2', 99)
    attachNode(conversation, fresh)
    expect(conversation.activeLeafId).toBe(fresh.id)
    expect(conversation.nodes[fresh.id].content).toBe('new content')
    expect(conversation.updatedAt).toBe(99)
  })

  it('derives titles with a word-boundary cut and ellipsis', () => {
    expect(deriveTitle('short title')).toBe('short title')
    const long = 'word '.repeat(30).trim()
    const derived = deriveTitle(long)
    expect(derived.length).toBeLessThanOrEqual(50)
    expect(derived.endsWith('…')).toBe(true)
  })
})
