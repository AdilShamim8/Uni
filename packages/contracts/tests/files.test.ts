import { describe, expect, it } from 'vitest'
import {
  createFileDocumentRequestSchema,
  fileExtractionStatusSchema,
  retrievalHitSchema,
  retrievalRequestSchema,
  retrievalResponseSchema,
} from '../src/index.js'

/**
 * Files & knowledge: extraction is conservative — 'unsupported' is an
 * honest status, never a fake 'extracted' with empty text.
 */
describe('extraction status vocabulary', () => {
  it('includes the honest pending/extracted/unsupported/failed set', () => {
    for (const status of ['pending', 'extracted', 'unsupported', 'failed']) {
      expect(fileExtractionStatusSchema.safeParse(status).success).toBe(true)
    }
    expect(fileExtractionStatusSchema.safeParse('partial').success).toBe(false)
  })
})

describe('file document requests', () => {
  it('content is bounded at 2,000,000 characters', () => {
    expect(
      createFileDocumentRequestSchema.safeParse({
        title: 'Notes',
        fileName: 'notes.txt',
        content: 'x'.repeat(2_000_000),
      }).success,
    ).toBe(true)
    expect(
      createFileDocumentRequestSchema.safeParse({
        title: 'Notes',
        fileName: 'notes.txt',
        content: 'x'.repeat(2_000_001),
      }).success,
    ).toBe(false)
  })
})

describe('retrieval', () => {
  it('the request bounds the query and defaults the limit to 8', () => {
    expect(retrievalRequestSchema.parse({ query: 'launch plan' })).toEqual({
      query: 'launch plan',
      limit: 8,
    })
    expect(retrievalRequestSchema.safeParse({ query: '', limit: 5 }).success).toBe(false)
    expect(retrievalRequestSchema.safeParse({ query: 'q', limit: 21 }).success).toBe(false)
  })

  it('a hit carries a bounded excerpt and an honest lexical score', () => {
    const hit = {
      documentId: 'doc_1',
      title: 'Notes',
      excerpt: '…the launch plan…',
      score: 3,
    }
    expect(retrievalHitSchema.parse(hit)).toEqual(hit)
    expect(retrievalHitSchema.safeParse({ ...hit, score: -1 }).success).toBe(false)
    expect(retrievalHitSchema.safeParse({ ...hit, score: 1.5 }).success).toBe(false)
  })

  it('the response echoes the query it actually searched', () => {
    expect(
      retrievalResponseSchema.safeParse({ hits: [], query: 'launch plan' }).success,
    ).toBe(true)
    expect(retrievalResponseSchema.safeParse({ hits: [] }).success).toBe(false)
  })
})
