import { describe, expect, it } from 'vitest'
import {
  KNOWLEDGE_CHUNK_OVERLAP,
  KNOWLEDGE_CHUNK_TARGET,
  KNOWLEDGE_DOC_CHAR_LIMIT,
  KNOWLEDGE_MAX_CHUNKS_PER_DOC,
  chunkDocument,
  tokenizeForSearch,
} from '@/domain/knowledgeBase'

describe('knowledge chunking', () => {
  it('splits markdown into heading-aware chunks and keeps the heading text', () => {
    const doc = [
      '# Onboarding guide',
      '',
      'Welcome to the team. Read this first.',
      '',
      '## Setup',
      '',
      'Install the CLI with one command.',
      '',
      '## Support',
      '',
      'Email helpdesk for anything urgent.',
    ].join('\n')

    const { chunks } = chunkDocument('doc1', doc)
    expect(chunks).toHaveLength(3)
    expect(chunks[0]).toMatchObject({ heading: 'Onboarding guide' })
    expect(chunks[0].text).toContain('Welcome to the team')
    expect(chunks[1]).toMatchObject({ heading: 'Setup' })
    expect(chunks[1].text).toContain('Install the CLI')
    expect(chunks[2]).toMatchObject({ heading: 'Support' })
    expect(chunks[2].text).toContain('Email helpdesk')
  })

  it('text before the first heading becomes a heading-less chunk', () => {
    const { chunks } = chunkDocument('doc2', 'Intro paragraph with no heading.\n\n# Section\n\nBody.')
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toMatchObject({ heading: '', ordinal: 0 })
    expect(chunks[1]).toMatchObject({ heading: 'Section', ordinal: 1 })
  })

  it('assigns stable ids and consecutive ordinals', () => {
    const { chunks } = chunkDocument('doc3', '# A\n\none\n\n# B\n\ntwo\n\n# C\n\nthree')
    expect(chunks.map((c) => c.id)).toEqual(['doc3:0', 'doc3:1', 'doc3:2'])
    expect(chunks.map((c) => c.ordinal)).toEqual([0, 1, 2])
    expect(chunks.every((c) => c.docId === 'doc3')).toBe(true)
  })

  it('windows an over-long section with overlap and whole-word cuts', () => {
    const words = Array.from({ length: 900 }, (_, i) => `word${i}`).join(' ')
    const { chunks } = chunkDocument('doc4', `# Big\n\n${words}`)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(KNOWLEDGE_CHUNK_TARGET + 50)
    }
    // Consecutive windows share the overlap (the last words of one window
    // reappear near the start of the next).
    const tail = chunks[0].text.slice(-120).trim()
    const head = chunks[1].text.slice(0, KNOWLEDGE_CHUNK_OVERLAP + 40)
    const shared = tail.split(/\s+/).filter((w) => w.length > 0 && head.includes(w))
    expect(shared.length).toBeGreaterThan(0)
    // No window is empty and every window keeps the section heading.
    expect(chunks.every((c) => c.heading === 'Big' && c.text.length > 0)).toBe(true)
  })

  it('normalizes CRLF and lone CR line endings before splitting', () => {
    const { chunks } = chunkDocument('doc5', '# Title\r\n\r\nBody line.\r\nAnother.')
    expect(chunks).toHaveLength(1)
    expect(chunks[0].text).toContain('Body line.\nAnother.')
  })

  it('returns no chunks for empty or whitespace-only documents', () => {
    expect(chunkDocument('doc6', '').chunks).toEqual([])
    expect(chunkDocument('doc6', '   \n\n  \t  ').chunks).toEqual([])
    expect(chunkDocument('doc6', '# Only a heading\n\n   ').chunks).toEqual([])
  })

  it('caps the chunk count at the hard limit and reports it honestly', () => {
    // Enough text to blow past the cap: 400+ sections.
    const doc = Array.from(
      { length: KNOWLEDGE_MAX_CHUNKS_PER_DOC + 50 },
      (_, i) => `# S${i}\n\nSection ${i} body text.`,
    ).join('\n\n')
    const { chunks, capped } = chunkDocument('doc7', doc)
    expect(chunks).toHaveLength(KNOWLEDGE_MAX_CHUNKS_PER_DOC)
    expect(capped).toBe(true)
  })

  it('very long headings are trimmed, never crash the chunker', () => {
    const longHeading = 'H'.repeat(500)
    const { chunks } = chunkDocument('doc8', `# ${longHeading}\n\nbody`)
    expect(chunks).toHaveLength(1)
    expect(chunks[0].heading.length).toBeLessThanOrEqual(120)
  })

  it('respects the documented per-document character limit as a constant', () => {
    expect(KNOWLEDGE_DOC_CHAR_LIMIT).toBe(400_000)
    expect(KNOWLEDGE_CHUNK_TARGET).toBeGreaterThan(0)
    expect(KNOWLEDGE_CHUNK_OVERLAP).toBeGreaterThan(0)
    expect(KNOWLEDGE_CHUNK_OVERLAP).toBeLessThan(KNOWLEDGE_CHUNK_TARGET)
  })
})

describe('search tokenizer', () => {
  it('lowercases and keeps Unicode letter/number runs', () => {
    expect(tokenizeForSearch('Café Résumé 2024')).toEqual(['café', 'résumé', '2024'])
  })

  it('drops single characters and English stopwords', () => {
    expect(tokenizeForSearch('the a of AND or is')).toEqual([])
    // "it" and "with" are stopwords; only real content words survive.
    expect(tokenizeForSearch('Ship it with the crew')).toEqual(['ship', 'crew'])
  })

  it('splits on punctuation and symbols, dropping 1-char tokens', () => {
    expect(tokenizeForSearch('release-v2.1: ship! (final)')).toEqual([
      'release',
      'v2',
      'ship',
      'final',
    ])
  })
})
