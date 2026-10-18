import { describe, expect, it } from 'vitest'
import {
  groupAggregate,
  parseCsvText,
  profileColumns,
  rowsToCsv,
  sanitizeCsvCell,
  summarizeColumn,
  summarizeToMarkdown,
} from '@/domain/csvAnalysis'

/**
 * Real CSV computation — quoted delimiters, malformed input, honest
 * summaries, grouping that changes with the input, and formula-sanitized
 * exports. All expected values are hand-computed.
 */

const SIMPLE_CSV = `Month,Checkouts,Genre
2024-01,120,Fantasy
2024-02,150,Fantasy
2024-03,90,Sci-Fi
2024-04,,Sci-Fi
2024-05,200,Fantasy`

describe('parsing', () => {
  it('parses quoted delimiters, newlines inside quotes, and trims empty lines', () => {
    const csv = `Name,Note,Score
"Ada Lovelace, Countess","Line one
Line two",10
"Plain row",,5`
    const parsed = parseCsvText(csv)
    expect(parsed.headers).toEqual(['Name', 'Note', 'Score'])
    expect(parsed.rows).toHaveLength(2)
    expect(parsed.rows[0][0]).toBe('Ada Lovelace, Countess')
    expect(parsed.rows[0][1]).toContain('Line one\nLine two')
    expect(parsed.rows[1][1]).toBe('')
  })

  it('renames duplicate headers with suffixes and warns', () => {
    const parsed = parseCsvText('id,value,id\n1,2,3')
    expect(parsed.headers).toEqual(['id', 'value', 'id (2)'])
    expect(parsed.warnings.some((w) => w.message.includes('Duplicate'))).toBe(true)
  })

  it('auto-detects semicolon and tab delimiters', () => {
    const semi = parseCsvText('a;b\n1;2')
    expect(semi.headers).toEqual(['a', 'b'])
    const tab = parseCsvText('a\tb\n1\t2')
    expect(tab.headers).toEqual(['a', 'b'])
  })

  it('reports ragged rows instead of crashing', () => {
    const parsed = parseCsvText('a,b,c\n1,2\n1,2,3,4')
    expect(parsed.warnings.some((w) => w.message.includes('fewer'))).toBe(true)
    expect(parsed.rows[0]).toEqual(['1', '2', ''])
    expect(parsed.rows[1]).toEqual(['1', '2', '3'])
  })

  it('throws honestly on unparseable input instead of substituting results', () => {
    expect(() => parseCsvText('')).toThrow()
    expect(() => parseCsvText('   \n  \n')).toThrow()
  })
})

describe('column profiles and summaries', () => {
  it('computes hand-checked numeric summaries including blanks', () => {
    const parsed = parseCsvText(SIMPLE_CSV)
    const profiles = profileColumns(parsed)
    const checkouts = profiles.find((p) => p.header === 'Checkouts')!
    expect(checkouts.inferred).toBe('number')

    const summary = summarizeColumn(checkouts, { type: 'auto' })
    // Values: 120, 150, 90, blank, 200
    expect(summary.numeric?.count).toBe(4)
    expect(summary.numeric?.missing).toBe(1)
    expect(summary.numeric?.min).toBe(90)
    expect(summary.numeric?.max).toBe(200)
    expect(summary.numeric?.sum).toBe(560)
    expect(summary.numeric?.mean).toBe(140)
    // Sorted: 90, 120, 150, 200 → median (120+150)/2
    expect(summary.numeric?.median).toBe(135)
  })

  it('handles negative and zero values, and all-empty columns', () => {
    const csv = `delta,label
-5,a
0,b
12.5,c
,d`
    const parsed = parseCsvText(csv)
    const profiles = profileColumns(parsed)
    const delta = profiles.find((p) => p.header === 'delta')!
    const summary = summarizeColumn(delta, { type: 'auto' })
    expect(summary.numeric?.min).toBe(-5)
    expect(summary.numeric?.max).toBe(12.5)
    expect(summary.numeric?.sum).toBe(7.5)

    const label = profiles.find((p) => p.header === 'label')!
    expect(summarizeColumn(label, { type: 'auto' }).topValue?.count).toBe(1)
  })

  it('flags malformed numbers in a mostly-numeric column as missing, not as data', () => {
    const csv = 'value\n1\n2\nthree\n4'
    const parsed = parseCsvText(csv)
    const profile = profileColumns(parsed)[0]
    expect(profile.inferred).toBe('number')
    expect(profile.note).toContain('not numeric')
    const summary = summarizeColumn(profile, { type: 'auto' })
    expect(summary.numeric?.count).toBe(3)
    expect(summary.numeric?.sum).toBe(7)
  })

  it('detects ISO dates and treats ambiguous slash dates as text with a note', () => {
    const csv = 'iso,slash\n2024-01-02,01/02/2024\n2024-03-04,03/04/2024'
    const parsed = parseCsvText(csv)
    const profiles = profileColumns(parsed)
    expect(profiles[0].inferred).toBe('date')
    expect(profiles[1].inferred).toBe('date')
    expect(profiles[1].note).toContain('ambiguous')
    // Explicit override switches the effective type.
    expect(
      summarizeColumn(profiles[1], { type: 'text' }).type,
    ).toBe('text')
  })

  it('respects explicit type overrides over inference', () => {
    const parsed = parseCsvText(SIMPLE_CSV)
    const genre = profileColumns(parsed).find((p) => p.header === 'Genre')!
    expect(summarizeColumn(genre, { type: 'auto' }).numeric).toBeNull()
    expect(summarizeColumn(genre, { type: 'text' }).distinct).toBe(2)
  })
})

describe('grouping', () => {
  it('aggregates sum by group, hand-checked', () => {
    const parsed = parseCsvText(SIMPLE_CSV)
    const result = groupAggregate(parsed, { groupByIndex: 2, valueIndex: 1, aggregation: 'sum' })
    // Fantasy: 120 + 150 + 200 = 470; Sci-Fi: 90 (blank skipped)
    const fantasy = result.points.find((p) => p.label === 'Fantasy')
    const scifi = result.points.find((p) => p.label === 'Sci-Fi')
    expect(fantasy?.value).toBe(470)
    expect(scifi?.value).toBe(90)
  })

  it('results change when the input changes', () => {
    const base = parseCsvText(SIMPLE_CSV)
    const changed = parseCsvText(SIMPLE_CSV.replace('200', '400'))
    const a = groupAggregate(base, { groupByIndex: 2, valueIndex: 1, aggregation: 'sum' })
    const b = groupAggregate(changed, { groupByIndex: 2, valueIndex: 1, aggregation: 'sum' })
    expect(a.points.find((p) => p.label === 'Fantasy')?.value).toBe(470)
    expect(b.points.find((p) => p.label === 'Fantasy')?.value).toBe(670)
  })

  it('count aggregation works on non-numeric values and includes blanks as a group', () => {
    const parsed = parseCsvText(SIMPLE_CSV)
    const result = groupAggregate(parsed, { groupByIndex: 2, valueIndex: 1, aggregation: 'count' })
    expect(result.points.find((p) => p.label === 'Fantasy')?.value).toBe(3)
    expect(result.points.find((p) => p.label === 'Sci-Fi')?.value).toBe(2)
  })

  it('mean aggregation is hand-checked', () => {
    const parsed = parseCsvText(SIMPLE_CSV)
    const result = groupAggregate(parsed, { groupByIndex: 2, valueIndex: 1, aggregation: 'mean' })
    expect(result.points.find((p) => p.label === 'Fantasy')?.value).toBeCloseTo(470 / 3, 5)
    expect(result.points.find((p) => p.label === 'Sci-Fi')?.value).toBe(90)
  })
})

describe('exports', () => {
  it('sanitizes spreadsheet formula-like cells on CSV export', () => {
    expect(sanitizeCsvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)")
    expect(sanitizeCsvCell('+cmd')).toBe("'+cmd")
    expect(sanitizeCsvCell('@import')).toBe("'@import")
    expect(sanitizeCsvCell('-1')).toBe("'-1")
    expect(sanitizeCsvCell('normal value')).toBe('normal value')
    expect(sanitizeCsvCell('')).toBe('')
    // A lone minus or plus is kept as-is.
    expect(sanitizeCsvCell('-')).toBe('-')
  })

  it('exports rows with quoting and sanitization combined', () => {
    const csv = rowsToCsv(['name', 'formula'], [['a,b'], ['=DANGER()']])
    const lines = csv.split('\n')
    expect(lines[0]).toBe('name,formula')
    expect(lines[1]).toBe('"a,b"')
    expect(lines[2]).toBe("'=DANGER()")
  })

  it('summary markdown records provenance and real numbers', () => {
    const parsed = parseCsvText(SIMPLE_CSV)
    const summaries = profileColumns(parsed).map((p) => summarizeColumn(p, { type: 'auto' }))
    const grouping = groupAggregate(parsed, {
      groupByIndex: 2,
      valueIndex: 1,
      aggregation: 'sum',
    })
    const markdown = summarizeToMarkdown({
      fileName: 'checkouts.csv',
      parsed,
      summaries,
      grouping,
    })
    expect(markdown).toContain('# CSV analysis — checkouts.csv')
    expect(markdown).toContain('470') // Fantasy sum
    expect(markdown).toContain('Computed locally')
    expect(markdown).not.toContain('precomputed')
  })
})
