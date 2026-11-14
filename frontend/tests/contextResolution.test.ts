import { describe, expect, it } from 'vitest'
import type { Artifact, Project } from '@/domain/workspaceTypes'
import {
  buildContextBlock,
  resolveContextItems,
  totalContextSize,
  type ResolvedContextItem,
} from '@/domain/contextResolution'
import type { ContextItem } from '@/state/contextStore'

function item(overrides: Partial<ContextItem>): ContextItem {
  return {
    id: 'ctx_1',
    kind: 'note',
    refId: null,
    title: 'A note',
    content: 'the note text',
    addedAt: 1,
    ...overrides,
  }
}

function artifact(overrides: Partial<Artifact>): Artifact {
  return {
    id: 'art_1',
    title: 'Report',
    kind: 'report',
    taskId: null,
    projectId: null,
    markdown: '# The report',
    workingDraft: null,
    draftUpdatedAt: null,
    versions: [],
    source: null,
    createdAt: 1,
    updatedAt: 1,
    provenance: 'user-authored',
    generatedBy: null,
    ...overrides,
  }
}

/**
 * Context resolution is the single source both the inspector preview
 * and the send path share — what it says IS what a live send includes.
 */
describe('resolveContextItems', () => {
  it('a note with content is available; a blank note is not (content passes through verbatim)', () => {
    const [ok, empty] = resolveContextItems(
      [item({}), item({ content: '   ' })],
      {},
      {},
    )
    expect(ok).toMatchObject({ available: true, reason: null, content: 'the note text' })
    expect(empty).toMatchObject({ available: false, reason: 'This note is empty', content: '   ' })
  })

  it('a deleted artifact resolves to an honest unavailable state', () => {
    const [resolved] = resolveContextItems(
      [item({ kind: 'artifact', refId: 'art_gone', content: null })],
      {},
      {},
    )
    expect(resolved).toMatchObject({
      available: false,
      reason: 'This document was deleted',
      content: '',
    })
  })

  it('an artifact prefers the working draft over the committed markdown', () => {
    const [resolved] = resolveContextItems(
      [item({ kind: 'artifact', refId: 'art_1', content: null })],
      { art_1: artifact({ workingDraft: '# Draft in progress' }) },
      {},
    )
    expect(resolved).toMatchObject({ available: true, content: '# Draft in progress' })
  })

  it('oversized artifacts truncate to the item limit and say so', () => {
    const [resolved] = resolveContextItems(
      [item({ kind: 'artifact', refId: 'art_big', content: null })],
      { art_big: artifact({ markdown: 'x'.repeat(20_000) }) },
      {},
    )
    expect(resolved.truncated).toBe(true)
    expect(resolved.size).toBe(16_000)
  })

  it('knowledge items report availability, not content — the send path retrieves it', () => {
    const [withDocs] = resolveContextItems([item({ kind: 'knowledge', content: null })], {}, {}, 3)
    expect(withDocs).toMatchObject({ available: true, reason: null, content: '', size: 0 })
    const [withoutDocs] = resolveContextItems(
      [item({ kind: 'knowledge', content: null })],
      {},
      {},
      0,
    )
    expect(withoutDocs).toMatchObject({
      available: false,
      reason: 'The knowledge base is empty',
      content: '',
    })
  })

  it('a project contributes its description, or says it has none', () => {
    const project: Project = { id: 'prj_1', name: 'Launch', description: 'The launch plan.', createdAt: 1 }
    const [resolved, blank] = resolveContextItems(
      [
        item({ kind: 'project', refId: 'prj_1', content: null }),
        item({ kind: 'project', refId: 'prj_blank', content: null }),
      ],
      {},
      { prj_1: project, prj_blank: { ...project, id: 'prj_blank', description: '  ' } },
    )
    expect(resolved).toMatchObject({ available: true, content: 'The launch plan.' })
    expect(blank).toMatchObject({
      available: false,
      reason: 'This project has no description to include',
    })
  })
})

describe('buildContextBlock + totalContextSize', () => {
  it('an empty selection builds an empty block', () => {
    expect(buildContextBlock([])).toBe('')
  })

  it('the block names each section by kind with its content', () => {
    const resolved = resolveContextItems(
      [item({ title: 'My note' }), item({ kind: 'project', refId: 'prj_1', title: 'Launch', content: null })],
      {},
      { prj_1: { id: 'prj_1', name: 'Launch', description: 'Ship it.', createdAt: 1 } },
    )
    const block = buildContextBlock(resolved)
    expect(block).toContain('### Note: My note')
    expect(block).toContain('the note text')
    expect(block).toContain('### Project: Launch')
    expect(block).toContain('Ship it.')
    expect(block).toContain('---')
  })

  it('totalContextSize sums the per-item sizes', () => {
    const resolved: ResolvedContextItem[] = resolveContextItems(
      [item({ content: '12345' }), item({ id: 'ctx_2', content: '123' })],
      {},
      {},
    )
    expect(totalContextSize(resolved)).toBe(8)
  })
})
