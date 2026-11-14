import { describe, expect, it } from 'vitest'
import {
  canonicalSaveResultSchema,
  createLibraryArtifactRequestSchema,
  libraryArtifactKindSchema,
  libraryProvenanceSchema,
  patchLibraryArtifactRequestSchema,
} from '../src/index.js'

/** Canonical artifacts with immutable versions; provenance is honest. */
describe('library vocabulary', () => {
  it('kinds are report/document/email/data', () => {
    for (const kind of ['report', 'document', 'email', 'data']) {
      expect(libraryArtifactKindSchema.safeParse(kind).success).toBe(true)
    }
    expect(libraryArtifactKindSchema.safeParse('spreadsheet').success).toBe(false)
  })

  it('provenance separates provider output, demo simulation, and imports', () => {
    expect(libraryProvenanceSchema.safeParse('provider-generated').success).toBe(true)
    expect(libraryProvenanceSchema.safeParse('demo-simulation').success).toBe(true)
    expect(libraryProvenanceSchema.safeParse('imported').success).toBe(true)
    expect(libraryProvenanceSchema.safeParse('unknown').success).toBe(false)
  })
})

describe('artifact requests', () => {
  it('creation requires a title and non-empty bounded markdown', () => {
    expect(
      createLibraryArtifactRequestSchema.safeParse({ title: 'Brief', kind: 'report', markdown: '# Hi' })
        .success,
    ).toBe(true)
    expect(
      createLibraryArtifactRequestSchema.safeParse({ title: '', kind: 'report', markdown: '# Hi' })
        .success,
    ).toBe(false)
    expect(
      createLibraryArtifactRequestSchema.safeParse({ title: 'Brief', kind: 'report', markdown: '' })
        .success,
    ).toBe(false)
  })

  it('a patch with no fields is rejected', () => {
    expect(patchLibraryArtifactRequestSchema.safeParse({}).success).toBe(false)
    expect(patchLibraryArtifactRequestSchema.safeParse({ title: 'Renamed' }).success).toBe(true)
  })
})

describe('canonical save result', () => {
  it('says which artifact holds the content and whether it was (re)created', () => {
    const result = {
      artifactId: 'art_1',
      created: false,
      recreated: true,
      title: 'Brief',
      version: 3,
    }
    expect(canonicalSaveResultSchema.parse(result)).toEqual(result)
    expect(canonicalSaveResultSchema.safeParse({ ...result, version: 0 }).success).toBe(false)
  })

  it('markdown is bounded at exactly 500,000 characters', () => {
    expect(
      createLibraryArtifactRequestSchema.safeParse({
        title: 'Big',
        kind: 'document',
        markdown: 'x'.repeat(500_000),
      }).success,
    ).toBe(true)
    expect(
      createLibraryArtifactRequestSchema.safeParse({
        title: 'Big',
        kind: 'document',
        markdown: 'x'.repeat(500_001),
      }).success,
    ).toBe(false)
  })
})
