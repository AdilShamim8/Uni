import { describe, expect, it } from 'vitest'
import {
  buildKnowledgeContextBlock,
  buildKnowledgeIndex,
  chunkDocument,
  searchKnowledge,
  type KnowledgeChunk,
} from '@/domain/knowledgeBase'

function indexDocs(
  docs: { id: string; title: string; text: string }[],
): ReturnType<typeof buildKnowledgeIndex> {
  const chunksByDoc: Record<string, KnowledgeChunk[]> = {}
  for (const doc of docs) chunksByDoc[doc.id] = chunkDocument(doc.id, doc.text).chunks
  return buildKnowledgeIndex(
    docs.map(({ id, title }) => ({ id, title })),
    chunksByDoc,
  )
}

describe('knowledge search', () => {
  it('finds the document that contains the query terms and cites its title', () => {
    const index = indexDocs([
      { id: 'd1', title: 'Onboarding guide', text: '# Setup\n\nInstall the CLI and run uni init.' },
      { id: 'd2', title: 'Recipes', text: '# Pasta\n\nBoil water, add salt, cook twelve minutes.' },
    ])
    const hits = searchKnowledge(index, 'how do I install the CLI?')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].docTitle).toBe('Onboarding guide')
    expect(hits[0].heading).toBe('Setup')
    expect(hits[0].snippet.toLowerCase()).toContain('install')
  })

  it('ranks a heading match above a body-only match', () => {
    const index = indexDocs([
      {
        id: 'd1',
        title: 'Handbook',
        text: '# Refunds\n\nOur policy mentions refunds only once here in the body text.',
      },
      {
        id: 'd2',
        title: 'Policies',
        text: '# Other\n\nRefunds refunds refunds — mentioned many times but never in a heading.',
      },
    ])
    const hits = searchKnowledge(index, 'refunds')
    expect(hits[0].docId).toBe('d1')
  })

  it('gives an exact-phrase bonus to the chunk containing the phrase verbatim', () => {
    const index = indexDocs([
      { id: 'd1', title: 'Ops runbook', text: '# Incident\n\nRoll back the deploy to the previous release tag.' },
      { id: 'd2', title: 'Glossary', text: '# Terms\n\ndeploy: verb. release: noun. roll: many unrelated senses listed here.' },
    ])
    const hits = searchKnowledge(index, 'roll back the deploy')
    expect(hits[0].docId).toBe('d1')
    expect(hits[0].snippet).toContain('Roll back the deploy')
  })

  it('caps hits per document so one document cannot flood the results', () => {
    const sections = Array.from(
      { length: 8 },
      (_, i) => `# Section ${i}\n\nQuarterly revenue grew across all regions, quarter ${i}.`,
    ).join('\n\n')
    const index = indexDocs([
      { id: 'd1', title: 'Revenue report', text: sections },
      { id: 'd2', title: 'Other', text: '# Misc\n\nNothing to see in this unrelated entry at all.' },
    ])
    const hits = searchKnowledge(index, 'quarterly revenue', { limit: 6 })
    expect(hits.length).toBeLessThanOrEqual(3)
    expect(hits.every((hit) => hit.docId === 'd1')).toBe(true)
  })

  it('respects the total limit option', () => {
    const docs = Array.from({ length: 10 }, (_, i) => ({
      id: `d${i}`,
      title: `Doc ${i}`,
      text: `# Head\n\nDeployment checklist step ${i} for the deployment pipeline.`,
    }))
    const index = indexDocs(docs)
    const hits = searchKnowledge(index, 'deployment checklist', { limit: 4 })
    expect(hits.length).toBeLessThanOrEqual(4)
  })

  it('returns nothing for empty, stopword-only, or unmatched queries', () => {
    const index = indexDocs([{ id: 'd1', title: 'Doc', text: '# H\n\nSome real content about kubernetes.' }])
    expect(searchKnowledge(index, '')).toEqual([])
    expect(searchKnowledge(index, 'the and of')).toEqual([])
    expect(searchKnowledge(index, 'zebra quantum llama')).toEqual([])
  })

  it('returns nothing on an empty index', () => {
    const index = buildKnowledgeIndex([], {})
    expect(searchKnowledge(index, 'anything')).toEqual([])
  })

  it('snippets are bounded and carry ellipses when cut from a long chunk', () => {
    const body = `${'filler '.repeat(300)}kubernetes cluster nodes drain gracefully ${'filler '.repeat(300)}`
    const index = indexDocs([{ id: 'd1', title: 'Ops', text: `# Ops\n\n${body}` }])
    const hits = searchKnowledge(index, 'kubernetes cluster nodes')
    expect(hits).toHaveLength(1)
    expect(hits[0].snippet.length).toBeLessThanOrEqual(280)
    expect(hits[0].snippet).toContain('kubernetes')
    expect(hits[0].snippet.startsWith('…') || hits[0].snippet.endsWith('…')).toBe(true)
  })

  it('is deterministic: identical queries return identical order', () => {
    const docs = Array.from({ length: 6 }, (_, i) => ({
      id: `d${i}`,
      title: `Doc ${i}`,
      text: `# Head\n\nTesting deterministic retrieval ordering sample ${i}.`,
    }))
    const index = indexDocs(docs)
    const first = searchKnowledge(index, 'deterministic retrieval ordering')
    const second = searchKnowledge(index, 'deterministic retrieval ordering')
    expect(first.map((h) => h.chunkId)).toEqual(second.map((h) => h.chunkId))
  })

  it('matches across separate windows of one long section (overlap works)', () => {
    const words = Array.from({ length: 900 }, (_, i) => `word${i}`).join(' ')
    const index = indexDocs([
      { id: 'd1', title: 'Long doc', text: `# Big\n\n${words} The magic phrase appears at the very end.` },
    ])
    const hits = searchKnowledge(index, 'magic phrase appears')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].snippet).toContain('magic phrase')
  })
})

describe('knowledge context block', () => {
  it('builds an honestly-labeled, numbered, cited block', () => {
    const index = indexDocs([
      { id: 'd1', title: 'Onboarding', text: '# Setup\n\nInstall the CLI from the package registry.' },
    ])
    const block = buildKnowledgeContextBlock(searchKnowledge(index, 'install the CLI'))
    expect(block).toContain('Knowledge base excerpts')
    expect(block).toContain('retrieved locally')
    expect(block).toContain('[1] From “Onboarding” — Setup')
    expect(block).toContain('Install the CLI')
  })

  it('heading-less chunks cite the document only', () => {
    const index = indexDocs([{ id: 'd1', title: 'Plain', text: 'Just an intro paragraph about kubernetes.' }])
    const block = buildKnowledgeContextBlock(searchKnowledge(index, 'kubernetes'))
    expect(block).toContain('[1] From “Plain”')
    expect(block).not.toContain('— Setup')
  })

  it('returns an empty string for zero hits (never an empty section)', () => {
    expect(buildKnowledgeContextBlock([])).toBe('')
  })
})
