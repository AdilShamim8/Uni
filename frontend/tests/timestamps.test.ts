import { describe, expect, it } from 'vitest'
import { formatSeparator, withSeparators } from '@/domain/timestamps'
import type { MessageNode } from '@/domain/types'

function node(id: string, createdAt: number): MessageNode {
  return {
    id,
    parentId: null,
    role: 'user',
    content: `message ${id}`,
    createdAt,
    status: 'complete',
  }
}

describe('withSeparators', () => {
  it('marks the first message of a transcript with a separator', () => {
    const nodes = [node('a', 1_000), node('b', 1_000 + 60_000)]
    const result = withSeparators(nodes)
    expect(result[0].separator).not.toBeNull()
    expect(result[1].separator).toBeNull()
  })

  it('inserts a separator after a gap of fifteen minutes or more', () => {
    const start = Date.now() - 60_000
    const nodes = [
      node('a', start),
      node('b', start + 5 * 60_000), // 5 min later — no separator
      node('c', start + 5 * 60_000 + 15 * 60_000), // 15 min later — separator
    ]
    const result = withSeparators(nodes)
    expect(result.map((item) => item.separator === null)).toEqual([false, true, false])
  })

  it('never mutates the input and keeps every node in order', () => {
    const nodes = [node('a', 1), node('b', 2), node('c', 3)]
    const result = withSeparators(nodes)
    expect(result.map((item) => item.node.id)).toEqual(['a', 'b', 'c'])
    expect(nodes).toHaveLength(3)
  })
})

describe('formatSeparator', () => {
  it('labels timestamps from today with just the time', () => {
    const today = new Date()
    today.setHours(14, 5, 0, 0)
    const label = formatSeparator(today.getTime())
    // Locale-independent assertion: the label contains the minutes, no date words.
    expect(label).toMatch(/5/)
    expect(label.toLowerCase()).not.toContain('yesterday')
  })

  it('labels yesterday with the Yesterday prefix', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(9, 0, 0, 0)
    expect(formatSeparator(yesterday.getTime()).toLowerCase()).toContain('yesterday')
  })
})
