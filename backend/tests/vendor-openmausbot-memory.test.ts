import { describe, expect, it } from 'vitest'
import {
  alwaysCore,
  factIdentity,
  isMemoryDate,
  lineFactIdentity,
  notebookIdentities,
  parseMemoryEntries,
  withoutExpired,
  withoutSuperseded,
} from '../src/vendor/openmausbot/memory-entries.js'
import {
  mergeTopicText,
  parseTopicHeader,
  renderTopicIndex,
  topicBody,
  topicWords,
} from '../src/vendor/openmausbot/memory-topics.js'
import {
  holdsCredential,
  mask,
  redactSecretsInText,
} from '../src/vendor/openmausbot/redact.js'
import { unifiedDiff } from '../src/vendor/openmausbot/unified-diff.js'
import {
  enoughMatches,
  recallQuery,
  recallTerms,
  RECALL_CLOSE,
  RECALL_OPEN,
  renderRecall,
} from '../src/vendor/openmausbot/recall.js'

/**
 * Acceptance suite for the vendored OpenMausBot memory text kernel
 * (OpenMausBot @ 0d8eacc, Apache-2.0 — provenance in
 * third_party/sources.lock.json). Cases below were derived from the
 * upstream modules' documented grammar and from the upstream suites
 * (server/memory-entries.test.ts, server/memory-topics.test.ts,
 * server/recall.test.ts, server/redact.test.ts,
 * server/memory-journal.test.ts diff cases) so any behavioral drift
 * between the vendored files and upstream is caught here, not in
 * production.
 */

describe('memory entry grammar (vendored from OpenMausBot)', () => {
  it('parses a dated entry with source and until mark', () => {
    const text = '# Notes\n- 2026-01-05 · from chat · Prefers decaf espresso · until 2026-06-01'
    const entries = parseMemoryEntries(text)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.date).toBe('2026-01-05')
    expect(entries[0]!.until).toBe('2026-06-01')
    expect(entries[0]!.struck).toBe(false)
    expect(entries[0]!.body).toBe('Prefers decaf espresso')
  })

  it('strikes through superseded entries and withoutSuperseded drops them', () => {
    const text = [
      '- 2026-01-01 · Likes oat milk',
      '- 2026-02-01 · ~~Likes oat milk~~ · superseded 2026-02-02',
      '- 2026-02-02 · Switched to black coffee',
    ].join('\n')
    const entries = parseMemoryEntries(text)
    expect(entries).toHaveLength(3)
    expect(entries[1]!.struck).toBe(true)
    expect(withoutSuperseded(text)).toBe('- 2026-01-01 · Likes oat milk\n- 2026-02-02 · Switched to black coffee')
  })

  it('hides only expired unstruck entries', () => {
    const text = '- 2026-01-01 · Away until Friday · until 2026-01-03\n- 2026-01-01 · Permanent fact'
    const { text: kept, hidden } = withoutExpired(text, '2026-01-04')
    expect(hidden).toBe(1)
    expect(kept).toBe('- 2026-01-01 · Permanent fact')
    // Not yet expired: still visible the day before.
    expect(withoutExpired(text, '2026-01-03').hidden).toBe(0)
  })

  it('validates calendar dates, not just shapes', () => {
    expect(isMemoryDate('2026-02-29')).toBe(false) // not a leap year
    expect(isMemoryDate('2026-02-28')).toBe(true)
    expect(isMemoryDate('2026-13-01')).toBe(false)
  })

  it('keeps fact identity deliberately narrow', () => {
    expect(factIdentity('- Prefers tea.')).toBe('Prefers tea')
    expect(factIdentity('C++')).not.toBe(factIdentity('C'))
    expect(factIdentity('API_KEY')).not.toBe(factIdentity('api_key'))
    expect(lineFactIdentity('- 2026-01-01 ·  Likes  tea ')).toBe('Likes tea')
    // A struck entry is not a fact.
    expect(lineFactIdentity('- 2026-01-01 · ~~Likes tea~~')).toBe('')
    expect(notebookIdentities('- Likes tea\n- Likes tea').size).toBe(1)
  })

  it('marks safety and health facts as always-core', () => {
    expect(alwaysCore('Peanut allergy — anaphylaxis risk')).toBe(true)
    expect(alwaysCore('Takes diabetes medication')).toBe(true)
    expect(alwaysCore('Prefers morning meetings')).toBe(false)
  })

  it('leaves undated hand-written lines alone', () => {
    expect(parseMemoryEntries('Just a heading\nand prose')).toHaveLength(0)
  })
})

describe('memory topic headers (vendored from OpenMausBot)', () => {
  it('parses YAML frontmatter with aliases in list and inline forms', () => {
    const block = '---\ntitle: "Coffee"\ndescription: how they take it\naliases:\n  - espresso\n  - flat white\n---\n\nBody line.'
    const header = parseTopicHeader(block)
    expect(header.title).toBe('Coffee')
    expect(header.description).toBe('how they take it')
    expect(header.aliases).toEqual(['espresso', 'flat white'])
    expect(topicBody(block)).toBe('Body line.')
  })

  it('derives topic words from name, title, description and aliases', () => {
    const words = topicWords('coffee-habits.md', parseTopicHeader('---\ntitle: Morning routine\naliases: [espresso]\n---\n'))
    expect(words).toContain('coffee')
    expect(words).toContain('habits')
    expect(words).toContain('morning')
    expect(words).toContain('espresso')
  })

  it('merges new lines under an existing topic without duplicating aliases', () => {
    const existing = '---\ntitle: Coffee\naliases: [espresso]\n---\n\n- 2026-01-01 · Takes it black'
    const merged = mergeTopicText(existing, { title: 'Coffee', aliases: ['espresso', 'cortado'], lines: ['- 2026-02-01 · Now oat milk'] })
    expect(merged).toContain('aliases: [espresso, cortado]')
    expect(merged.endsWith('- 2026-02-01 · Now oat milk\n')).toBe(true)
    // No new aliases: text unchanged apart from the appended lines.
    const same = mergeTopicText(existing, { title: 'Coffee', aliases: ['espresso'], lines: ['- 2026-03-01 · Third note'] })
    expect(same).toContain('- 2026-03-01 · Third note')
    expect((same.match(/aliases:/g) ?? []).length).toBe(1)
  })

  it('renders a bounded topic index', () => {
    const topics = Array.from({ length: 45 }, (_, index) => ({
      name: `topic-${index}.md`,
      header: parseTopicHeader(`---\ntitle: Topic ${index}\n---\n`),
    }))
    const index = renderTopicIndex(topics)
    expect(index).toContain('- memory/topic-0.md — Topic 0')
    expect(index).toContain('…and 5 more in memory/')
    expect(index.length).toBeLessThanOrEqual(2_500)
  })
})

describe('secret redaction (vendored from OpenMausBot)', () => {
  it('masks provider key shapes and stays stable across repeated passes', () => {
    const text = 'key sk-ant-api03-abcdefghijklmnopqrst and ghp_ABCDEFGHIJKLMNOPQRSTUVWXY234567'
    const once = redactSecretsInText(text)
    expect(once).not.toContain('sk-ant-api03-abcdefghijklmnopqrst')
    expect(once).toContain('«redacted ')
    // Idempotent: re-masking our own marker must not nest.
    expect(redactSecretsInText(once)).toBe(once)
  })

  it('redacts key=value, key: value, bearer tokens and URL userinfo', () => {
    expect(redactSecretsInText('api_key=abcdef12345678')).not.toContain('abcdef12345678')
    expect(redactSecretsInText('password: hunter2hunter2')).not.toContain('hunter2hunter2')
    expect(redactSecretsInText('Authorization: Bearer abcdef123456abcdef')).not.toContain('abcdef123456abcdef')
    expect(redactSecretsInText('postgres://user:seekrit123@host/db')).not.toContain('seekrit123')
  })

  it('leaves ordinary prose and code alone', () => {
    const prose = 'The password: leave blank on first run. C++ and C differ.'
    expect(redactSecretsInText(prose)).toBe(prose)
  })

  it('detects unmistakable credential text without rewriting it', () => {
    expect(holdsCredential('sk-ant-api03-abcdefghijklmnopqrst')).toBe(true)
    expect(holdsCredential('-----BEGIN RSA PRIVATE KEY-----')).toBe(true)
    expect(holdsCredential('just a sentence')).toBe(false)
    expect(mask('abc')).toBe('«redacted 3 chars»')
  })
})

describe('unified diff engine (vendored from OpenMausBot)', () => {
  it('produces a minimal unified diff with correct hunk headers', () => {
    const before = ['alpha', 'beta', 'gamma', 'delta'].join('\n')
    const after = ['alpha', 'beta', 'GAMMA', 'delta', 'epsilon'].join('\n')
    const diff = unifiedDiff(before, after, 'MEMORY.md')
    expect(diff.added).toBe(2)
    expect(diff.removed).toBe(1)
    expect(diff.text).toContain('--- a/MEMORY.md')
    expect(diff.text).toContain('+++ b/MEMORY.md')
    expect(diff.text).toMatch(/^@@ -1,4 \+1,5 @@$/m)
    expect(diff.truncated).toBe(false)
  })

  it('returns an empty diff for identical text', () => {
    const diff = unifiedDiff('same\nsame', 'same\nsame', 'memory/topic.md')
    expect(diff.text).toBe('')
    expect(diff.added).toBe(0)
    expect(diff.removed).toBe(0)
  })

  it('caps long diffs honestly', () => {
    const before = Array.from({ length: 2000 }, (_, i) => `line ${i}`).join('\n')
    const after = Array.from({ length: 2000 }, (_, i) => `changed ${i}`).join('\n')
    const diff = unifiedDiff(before, after, 'big.md', 1_000)
    expect(diff.truncated).toBe(true)
    expect(diff.text.endsWith('… (diff cut here)')).toBe(true)
    expect(diff.text.length).toBeLessThanOrEqual(1_000 + '\n… (diff cut here)'.length)
  })
})

describe('recall query and rendering (vendored from OpenMausBot)', () => {
  it('drops stop words and filler, caps terms', () => {
    const terms = recallTerms('please remind me about the quarterly budget for the marketing team, thanks!')
    expect(terms).not.toContain('please')
    expect(terms).not.toContain('remind')
    expect(terms).not.toContain('the')
    expect(terms).toContain('quarterly')
    expect(terms).toContain('budget')
    expect(terms.length).toBeLessThanOrEqual(16)
  })

  it('gates short queries out entirely', () => {
    expect(recallQuery('hey')).toBeNull()
    expect(recallQuery('hi there')).toBeNull() // only filler terms survive
    expect(recallQuery('What was the quarterly budget?')).toBe('What was the quarterly budget?')
  })

  it('requires two matched terms for long queries', () => {
    const query = 'quarterly budget marketing team review' // 5+ terms
    expect(enoughMatches(query, 'the [quarterly] review')).toBe(false)
    expect(enoughMatches(query, 'the [quarterly] [budget] review')).toBe(true)
    const short = 'budget review' // < 5 terms
    expect(enoughMatches(short, 'the [budget]')).toBe(true)
  })

  it('renders bounded passages with fence-neutralised snippets', () => {
    const result = renderRecall([
      {
        source: 'memory',
        label: 'memory/coffee.md',
        at: new Date('2026-03-04T12:00:00Z').getTime(),
        snippet: '```js\nconst x = 1\n```\nsecond line',
      },
      { source: 'conversation', label: 'Chat with Uni', snippet: 'plain passage' },
    ])
    expect(result).not.toBeNull()
    expect(result!.text.startsWith(RECALL_OPEN)).toBe(true)
    expect(result!.text.endsWith(RECALL_CLOSE)).toBe(true)
    expect(result!.text).toContain("(2026-03-04): '''js … const x = 1 … ''' … second line")
    expect(result!.notes).toBe(1)
    expect(result!.conversations).toBe(1)
  })

  it('returns null when nothing fits the budget', () => {
    expect(renderRecall([])).toBeNull()
    const huge = 'x'.repeat(7_000)
    expect(renderRecall([{ source: 'memory', label: 'l', snippet: huge }])).toBeNull()
  })
})
