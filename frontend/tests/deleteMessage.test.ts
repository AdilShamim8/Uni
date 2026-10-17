import { beforeEach, describe, expect, it } from 'vitest'
import { useAppStore } from '@/state/store'
import type { Conversation, MessageNode } from '@/domain/types'

/* ------------------------------------------------------------------ */
/* Store-level tests for deleteMessage                                 */
/* ------------------------------------------------------------------ */

function node(
  id: string,
  parentId: string | null,
  role: 'user' | 'assistant',
  createdAt: number,
): MessageNode {
  return {
    id,
    parentId,
    role,
    content: `content-${id}`,
    createdAt,
    status: 'complete',
    feedback: null,
  }
}

function seedConversation(conversation: Conversation) {
  useAppStore.setState((state) => ({
    conversations: { ...state.conversations, [conversation.id]: conversation },
    activeConversationId: conversation.id,
  }))
}

function conversation(): Conversation {
  // u1 -> a1 -> u2 -> a2   (active leaf: a2)
  const nodes: Record<string, MessageNode> = {}
  for (const entry of [
    node('u1', null, 'user', 1),
    node('a1', 'u1', 'assistant', 2),
    node('u2', 'a1', 'user', 3),
    node('a2', 'u2', 'assistant', 4),
  ]) {
    nodes[entry.id] = entry
  }
  return {
    id: 'conv-delete',
    title: 'Delete test',
    createdAt: 1,
    updatedAt: 4,
    pinned: false,
    archived: false,
    temporary: false,
    nodes,
    activeLeafId: 'a2',
  }
}

describe('deleteMessage', () => {
  beforeEach(() => {
    useAppStore.setState({ conversations: {}, activeConversationId: null })
    // Keep the toast quiet in tests.
    useAppStore.getState().dismissToast?.()
  })

  it('removes the message and its subtree, re-anchoring to the parent', () => {
    seedConversation(conversation())
    useAppStore.getState().deleteMessage('u2')

    const updated = useAppStore.getState().conversations['conv-delete']
    expect(Object.keys(updated.nodes).sort()).toEqual(['a1', 'u1'])
    expect(updated.activeLeafId).toBe('a1')
  })

  it('deleting a mid-conversation assistant reply keeps earlier turns', () => {
    seedConversation(conversation())
    useAppStore.getState().deleteMessage('a1')

    const updated = useAppStore.getState().conversations['conv-delete']
    expect(Object.keys(updated.nodes).sort()).toEqual(['u1'])
    expect(updated.activeLeafId).toBe('u1')
  })

  it('deleting the last root empties the transcript cleanly', () => {
    seedConversation(conversation())
    useAppStore.getState().deleteMessage('u1')

    const updated = useAppStore.getState().conversations['conv-delete']
    expect(Object.keys(updated.nodes)).toEqual([])
    expect(updated.activeLeafId).toBeNull()
  })

  it('keeps sibling branches untouched when deleting one variant', () => {
    const base = conversation()
    base.nodes['u2b'] = node('u2b', 'a1', 'user', 5)
    base.nodes['a2b'] = node('a2b', 'u2b', 'assistant', 6)
    base.activeLeafId = 'a2b'
    seedConversation(base)

    useAppStore.getState().deleteMessage('u2b')

    const updated = useAppStore.getState().conversations['conv-delete']
    expect(Object.keys(updated.nodes).sort()).toEqual(['a1', 'a2', 'u1', 'u2'])
    // The surviving sibling branch stays reachable.
    expect(updated.activeLeafId).toBe('a2')
  })

  it('shows an undo toast that restores the exact previous state', () => {
    seedConversation(conversation())
    const before = JSON.parse(
      JSON.stringify(useAppStore.getState().conversations['conv-delete']),
    ) as Conversation

    useAppStore.getState().deleteMessage('u2')

    const toast = useAppStore.getState().toast
    expect(toast?.message).toContain('deleted')
    toast?.onAction?.()

    const restored = useAppStore.getState().conversations['conv-delete']
    expect(restored).toEqual(before)
  })
})
