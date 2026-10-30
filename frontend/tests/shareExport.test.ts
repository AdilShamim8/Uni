import { describe, expect, it } from 'vitest'
import type { Conversation, MessageNode } from '@/domain/types'
import {
  conversationToMarkdown,
  conversationToShareHtml,
  slugifyTitle,
} from '@/features/chat/exportUtils'

function node(
  id: string,
  parentId: string | null,
  role: 'user' | 'assistant',
  content: string,
  createdAt: number,
  extra: Partial<MessageNode> = {},
): MessageNode {
  return { id, parentId, role, content, createdAt, status: 'complete', feedback: null, ...extra }
}

function buildConversation(): Conversation {
  // u1 -> a1 -> u2 -> a2 (active leaf)
  //             \-> a2b  (an older variant, not on the active path)
  const nodes: Record<string, MessageNode> = {}
  for (const entry of [
    node('u1', null, 'user', 'What is the free path?', 1),
    node('a1', 'u1', 'assistant', 'Bring your own key — several providers are free.', 2, {
      statusPrefix: 'Searched the web (simulated)',
    }),
    node('u2', 'a1', 'user', 'Which ones?', 3),
    node('a2', 'u2', 'assistant', 'Groq, Google AI Studio, and local models.', 4),
    node('a2b', 'u2', 'assistant', 'Older variant, not on the active path.', 5),
  ]) {
    nodes[entry.id] = entry
  }
  return {
    id: 'c1',
    title: 'The <free> path',
    createdAt: 1,
    updatedAt: 5,
    pinned: false,
    archived: false,
    temporary: false,
    nodes,
    activeLeafId: 'a2',
  }
}

describe('share-ready HTML export', () => {
  it('produces a complete standalone HTML document', () => {
    const html = conversationToShareHtml(buildConversation())

    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">')
    expect(html).toContain('<title>The &lt;free&gt; path</title>')
    expect(html).toContain('</html>')
  })

  it('renders every turn of the active path with honest role labels', () => {
    const html = conversationToShareHtml(buildConversation())

    expect(html).toContain('What is the free path?')
    expect(html).toContain('Bring your own key — several providers are free.')
    expect(html).toContain('Which ones?')
    expect(html).toContain('Groq, Google AI Studio, and local models.')
    // The task-status line travels with its turn.
    expect(html).toContain('Searched the web (simulated)')
    // Exactly two user turns and two assistant turns.
    expect(html.match(/class="role">You</g)?.length).toBe(2)
    expect(html.match(/class="role">Uni</g)?.length).toBe(2)
  })

  it('exports only the active path — other branches stay out', () => {
    const html = conversationToShareHtml(buildConversation())

    expect(html).not.toContain('Older variant, not on the active path.')
  })

  it('escapes content — a crafted message cannot inject markup or script', () => {
    const conversation = buildConversation()
    conversation.nodes['u1'] = node(
      'u1',
      null,
      'user',
      '<script>alert("xss")</script> & "quotes" \'too\'',
      1,
    )
    const html = conversationToShareHtml(conversation)

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&amp;')
    expect(html).toContain('&quot;')
    expect(html).toContain('&#39;')
    // The only link in the page is the footer's repo link.
    expect(html.match(/<a /g)?.length).toBe(1)
  })

  it('carries the provenance footer with the repo link', () => {
    const html = conversationToShareHtml(buildConversation())

    expect(html).toContain('github.com/AdilShamim8/Uni')
    expect(html).toContain('free, open-source AI workspace')
    expect(html).toContain('local prototype')
  })

  it('markdown export still matches the same active path', () => {
    const markdown = conversationToMarkdown(buildConversation())

    expect(markdown).toContain('# The <free> path')
    expect(markdown).toContain('Groq, Google AI Studio, and local models.')
    expect(markdown).not.toContain('Older variant')
  })

  it('slugifies titles for filenames', () => {
    expect(slugifyTitle('The <free> path')).toBe('the-free-path')
    expect(slugifyTitle('')).toBe('conversation')
  })
})
