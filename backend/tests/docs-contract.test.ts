import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The provider compatibility matrix is a contract of the codebase
 * (U020): it must document both supported protocols, the
 * deterministic (offline) verification story, the opt-in smoke
 * harness, and explicit cost/credential requirements for the curated
 * routes. If a surface changes without updating the matrix, this test
 * fails.
 */

const DOC_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../docs/provider-compatibility.md')
const SMOKE_PATH = join(dirname(fileURLToPath(import.meta.url)), '../scripts/provider-smoke.mjs')

describe('provider compatibility matrix (U020)', () => {
  const doc = readFileSync(DOC_PATH, 'utf8')
  const smoke = readFileSync(SMOKE_PATH, 'utf8')

  it('documents both supported protocols and every surface', () => {
    expect(doc).toContain('openai-compatible')
    expect(doc).toContain('anthropic')
    for (const surface of ['Discovery', 'Generation', 'Credential transport', 'Key verification']) {
      expect(doc).toContain(surface)
    }
  })

  it('separates deterministic verification from real-provider smoke results', () => {
    expect(doc).toContain('Deterministic verification')
    expect(doc).toContain('Opt-in smoke harness')
    expect(doc).toContain('smoke-results.json')
    // Deterministic suites never need credentials.
    expect(doc).toContain('no network access and no credentials')
  })

  it('states cost and credential requirements explicitly for curated routes', () => {
    expect(doc).toContain('Credential')
    expect(doc).toContain('Cost')
    expect(doc).toMatch(/may consume quota or\s+cost tokens/)
    // Local routes are documented as genuinely keyless.
    expect(doc).toMatch(/Ollama.*None/)
  })

  it('the smoke harness is opt-in and never records credentials', () => {
    // Refuses to run without explicit opt-in.
    expect(smoke).toContain('opt-in only')
    expect(smoke).toContain('SMOKE_PROVIDERS')
    // And records hosts/results, never keys.
    expect(smoke).toContain('never the key')
    expect(smoke).toMatch(/never written to the results file/i)
    // Results live outside the deterministic suite.
    expect(smoke).toContain('smoke-results.json')
  })
})
