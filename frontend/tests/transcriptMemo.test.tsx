import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { Conversation, MessageNode } from '@/domain/types'
import { createNode } from '@/domain/conversationTree'
import { MessageItem } from '@/features/chat/MessageItem'
import { MessageList } from '@/features/chat/MessageList'
import { resetStoreForTests, useAppStore } from '@/state/store'

/**
 * Milestone 08, F14/F14b: during streaming the store patches one node per
 * token and gives the conversation a new identity. Unchanged messages must
 * bail at the memo boundary instead of re-rendering, and variant
 * index/count must arrive precomputed instead of per-item sibling scans.
 */

function buildConversation(messages: number): Conversation {
  const nodes: Record<string, MessageNode> = {}
  let parentId: string | null = null
  for (let i = 0; i < messages; i += 1) {
    const role = i % 2 === 0 ? 'user' : 'assistant'
    const node = createNode(role, `message ${i}`, parentId, i + 1)
    if (role === 'assistant') node.status = 'complete'
    nodes[node.id] = node
    parentId = node.id
  }
  return {
    id: 'memo-conv',
    title: 'Memo test',
    createdAt: 1,
    updatedAt: messages + 1,
    pinned: false,
    archived: false,
    temporary: false,
    nodes,
    activeLeafId: parentId,
  }
}

/** The store's real streaming patch: new node object, new conversation. */
function patchNodeContent(conversation: Conversation, nodeId: string, content: string): Conversation {
  const node = conversation.nodes[nodeId]
  const nodes = { ...conversation.nodes, [nodeId]: { ...node, content } }
  return { ...conversation, nodes }
}

describe('MessageItem memoization contract', () => {
  it('bails when props are unchanged (identical node object and primitives)', async () => {
    const timestamps = await import('@/domain/timestamps')
    // Every message execution renders one full-timestamp title, so the
    // spy counts actual component executions — unlike a Profiler, which
    // fires on any subtree commit even when children bail out.
    const spy = vi.spyOn(timestamps, 'formatFullTimestamp')

    const node = createNode('assistant', 'stable content', null, 1)
    node.status = 'complete'
    const props = { node, conversationId: 'c1', isLast: true, variantIndex: 0, variantCount: 1 }

    const view = render(<MessageItem {...props} />)
    expect(spy).toHaveBeenCalledTimes(1)

    // Same node object, same primitives: React must skip the subtree.
    view.rerender(<MessageItem {...props} />)
    expect(spy).toHaveBeenCalledTimes(1)

    // A token patch: new node object (new content) → re-render happens.
    const patched = { ...node, content: 'stable content + token' }
    view.rerender(<MessageItem {...props} node={patched} />)
    expect(spy).toHaveBeenCalledTimes(2)
    expect(screen.getByText('stable content + token')).toBeTruthy()

    // A new sibling variant appears: variantCount changes → re-render,
    // and the variant switcher shows the new count.
    view.rerender(<MessageItem {...props} node={patched} variantCount={2} />)
    expect(spy).toHaveBeenCalledTimes(3)
    expect(screen.getByText('1/2')).toBeTruthy()
  })
})

describe('MessageList re-renders during a streaming token patch', () => {
  beforeEach(() => {
    resetStoreForTests()
  })

  it('re-renders only the patched message, not the whole transcript', async () => {
    const timestamps = await import('@/domain/timestamps')
    const spy = vi.spyOn(timestamps, 'formatFullTimestamp')
    const conversation = buildConversation(12)

    const view = render(<MessageList conversation={conversation} />)
    // Every message (user and assistant kinds) renders one full-timestamp
    // title at mount — the spy counts component executions.
    expect(spy).toHaveBeenCalledTimes(12)

    // A token lands on the last assistant node: new conversation object,
    // one new node object, everything else referentially identical.
    const leafId = conversation.activeLeafId as string
    const updated = patchNodeContent(conversation, leafId, 'message 11 + token')
    spy.mockClear()
    view.rerender(<MessageList conversation={updated} />)

    // Exactly ONE assistant message executed — the one being streamed.
    expect(spy).toHaveBeenCalledTimes(1)
    expect(screen.getByText('message 11 + token')).toBeTruthy()
    // Older content is untouched in the DOM.
    expect(screen.getByText('message 1')).toBeTruthy()
  })
})

describe('store streaming path keeps node identity for unaffected messages', () => {
  it('updateNode patches one node and preserves every other node object', () => {
    useAppStore.setState((state) => {
      const conversation = buildConversation(6)
      return {
        ...state,
        conversations: { ...state.conversations, [conversation.id]: conversation },
        activeConversationId: conversation.id,
      }
    })

    const before = useAppStore.getState().conversations['memo-conv']
    const leafId = before.activeLeafId as string
    const identityBefore = new Map(
      Object.values(before.nodes).map((node) => [node.id, node]),
    )

    useAppStore.setState((state) => {
      const conversation = state.conversations['memo-conv']
      const nodes = {
        ...conversation.nodes,
        [leafId]: { ...conversation.nodes[leafId], content: 'streamed token' },
      }
      return {
        ...state,
        conversations: {
          ...state.conversations,
          'memo-conv': { ...conversation, nodes },
        },
      }
    })

    const after = useAppStore.getState().conversations['memo-conv']
    for (const [id, node] of identityBefore) {
      if (id === leafId) {
        expect(after.nodes[id]).not.toBe(node)
        expect(after.nodes[id].content).toBe('streamed token')
      } else {
        // Referential stability is what makes the memo effective.
        expect(after.nodes[id]).toBe(node)
      }
    }
  })
})
