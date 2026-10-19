import Papa from 'papaparse'

/**
 * Browser-local CSV analysis — real computation over user uploads.
 * Deterministic, offline, and honest: nothing is precomputed, results
 * always change when the input changes, and failures are reported, never
 * substituted with canned output.
 */

export const MAX_FILE_BYTES = 2 * 1024 * 1024 // 2 MB
export const MAX_ROWS = 20000
export const MAX_COLUMNS = 200

export interface ParseWarning {
  message: string
  count?: number
}

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
  warnings: ParseWarning[]
  truncated: boolean
}

export interface ColumnTypeChoice {
  /** 'auto' follows inference; explicit choices override it. */
  type: 'auto' | 'text' | 'number' | 'date'
}

export type InferredType = 'text' | 'number' | 'date'

export interface ColumnProfile {
  header: string
  inferred: InferredType
  /** Why auto decided — shown to the user, including ambiguity notes. */
  note: string | null
  values: string[]
  missing: number
}

export interface NumericSummary {
  count: number
  missing: number
  min: number
  max: number
  mean: number
  median: number
  sum: number
  stddev: number
}

export interface ColumnSummary {
  header: string
  type: InferredType
  missing: number
  distinct: number
  numeric: NumericSummary | null
  topValue: { value: string; count: number } | null
  dateRange: { min: string; max: string } | null
}

export interface GroupingResult {
  groupBy: string
  value: string
  aggregation: string
  points: { label: string; value: number }[]
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

export function parseCsvText(text: string): ParsedCsv {
  const warnings: ParseWarning[] = []
  const result = Papa.parse<string[]>(text.trim(), {
    delimiter: '', // auto-detect, handles ; and \t too
    skipEmptyLines: 'greedy',
  })

  const rawRows = (result.data as string[][]).filter((row) => Array.isArray(row))
  if (result.errors.length > 0) {
    warnings.push({
      message: `${result.errors.length} parsing note${result.errors.length === 1 ? '' : 's'} — malformed rows were skipped or partially read.`,
    })
  }

  if (rawRows.length === 0) {
    throw new Error('No rows found in the file.')
  }

  let headers = rawRows[0].map((header, index) => header.trim() || `Column ${index + 1}`)

  // Duplicate headers get explicit suffixes so columns stay addressable.
  const seen = new Map<string, number>()
  const duplicates: string[] = []
  headers = headers.map((header) => {
    const count = seen.get(header) ?? 0
    seen.set(header, count + 1)
    if (count > 0) {
      duplicates.push(header)
      return `${header} (${count + 1})`
    }
    return header
  })
  if (duplicates.length > 0) {
    warnings.push({
      message: `Duplicate column name${duplicates.length === 1 ? '' : 's'} (${duplicates
        .map((d) => `“${d}”`)
        .join(', ')}) — renamed with a number suffix.`,
    })
  }

  let rows = rawRows.slice(1)

  // Ragged rows: keep their cells; pad short rows, note the mismatch.
  const width = headers.length
  const shortRows = rows.filter((row) => row.length < width).length
  const longRows = rows.filter((row) => row.length > width).length
  if (shortRows + longRows > 0) {
    warnings.push({
      message: `${shortRows + longRows} row${shortRows + longRows === 1 ? '' : 's'} had ${
        shortRows > 0 ? 'fewer' : 'more'
      } cells than the header — extra cells were dropped, missing ones treated as blank.`,
      count: shortRows + longRows,
    })
  }
  rows = rows.map((row) => {
    if (row.length === width) return row
    const fixed = row.slice(0, width)
    while (fixed.length < width) fixed.push('')
    return fixed
  })

  let truncated = false
  if (rows.length > MAX_ROWS) {
    rows = rows.slice(0, MAX_ROWS)
    truncated = true
    warnings.push({
      message: `Only the first ${MAX_ROWS.toLocaleString()} rows were analyzed (file has more).`,
    })
  }
  if (headers.length > MAX_COLUMNS) {
    headers = headers.slice(0, MAX_COLUMNS)
    rows = rows.map((row) => row.slice(0, MAX_COLUMNS))
    warnings.push({
      message: `Only the first ${MAX_COLUMNS} columns were analyzed.`,
    })
  }

  return { headers, rows, warnings, truncated }
}

/* ------------------------------------------------------------------ */
/* Type inference                                                      */
/* ------------------------------------------------------------------ */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?)?$/
const SLASH_DATE = /^\d{1,2}\/\d{1,2}\/\d{2,4}$/

function looksLikeNumber(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed === '') return false
  return Number.isFinite(Number(trimmed)) && /^-?[\d.,]+%?$/.test(trimmed)
}

function parseNumberStrict(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '').replace(/%$/, '')
  if (trimmed === '') return null
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export function profileColumns(parsed: ParsedCsv): ColumnProfile[] {
  return parsed.headers.map((header, columnIndex) => {
    const values = parsed.rows.map((row) => row[columnIndex] ?? '')
    const nonEmpty = values.filter((value) => value.trim() !== '')
    const missing = values.length - nonEmpty.length

    if (nonEmpty.length === 0) {
      return {
        header,
        inferred: 'text',
        note: 'All values are blank',
        values,
        missing,
      }
    }

    const numericCount = nonEmpty.filter(looksLikeNumber).length
    const isoCount = nonEmpty.filter((value) => ISO_DATE.test(value.trim())).length
    const slashCount = nonEmpty.filter((value) => SLASH_DATE.test(value.trim())).length

    if (isoCount === nonEmpty.length) {
      return { header, inferred: 'date', note: 'ISO dates (YYYY-MM-DD)', values, missing }
    }
    if (slashCount === nonEmpty.length && numericCount < nonEmpty.length) {
      return {
        header,
        inferred: 'date',
        note: 'Slash dates — ambiguous day/month order; treated as plain text unless you choose Date',
        values,
        missing,
      }
    }
    if (numericCount === nonEmpty.length) {
      return { header, inferred: 'number', note: null, values, missing }
    }
    // Majority numeric? Note the malformed share honestly; the rest count
    // as missing values rather than silently becoming text.
    if (numericCount > 0 && numericCount * 2 > nonEmpty.length) {
      return {
        header,
        inferred: 'number',
        note: `${nonEmpty.length - numericCount} value${
          nonEmpty.length - numericCount === 1 ? ' is' : 's are'
        } not numeric — counted as missing`,
        values,
        missing,
      }
    }
    return { header, inferred: 'text', note: null, values, missing }
  })
}

/* ------------------------------------------------------------------ */
/* Summaries                                                           */
/* ------------------------------------------------------------------ */

export function effectiveType(profile: ColumnProfile, choice: ColumnTypeChoice): InferredType {
  if (choice.type === 'auto') return profile.inferred
  return choice.type
}

export function summarizeColumn(
  profile: ColumnProfile,
  choice: ColumnTypeChoice,
): ColumnSummary {
  const type = effectiveType(profile, choice)
  const nonEmpty = profile.values.filter((value) => value.trim() !== '')
  const distinct = new Set(nonEmpty).size

  const counts = new Map<string, number>()
  for (const value of nonEmpty) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  let topValue: { value: string; count: number } | null = null
  for (const [value, count] of counts) {
    if (!topValue || count > topValue.count || (count === topValue.count && value < topValue.value)) {
      topValue = { value, count }
    }
  }

  const base: ColumnSummary = {
    header: profile.header,
    type,
    missing: profile.missing,
    distinct,
    numeric: null,
    topValue,
    dateRange: null,
  }

  if (type === 'number') {
    const numbers = nonEmpty
      .map(parseNumberStrict)
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b)
    if (numbers.length === 0) {
      return base
    }
    const sum = numbers.reduce((acc, value) => acc + value, 0)
    const mean = sum / numbers.length
    const median =
      numbers.length % 2 === 1
        ? numbers[(numbers.length - 1) / 2]
        : (numbers[numbers.length / 2 - 1] + numbers[numbers.length / 2]) / 2
    const variance =
      numbers.reduce((acc, value) => acc + (value - mean) ** 2, 0) / numbers.length
    return {
      ...base,
      numeric: {
        count: numbers.length,
        missing: profile.values.length - numbers.length,
        min: numbers[0],
        max: numbers[numbers.length - 1],
        mean,
        median,
        sum,
        stddev: Math.sqrt(variance),
      },
    }
  }

  if (type === 'date') {
    const sorted = [...nonEmpty].sort()
    if (sorted.length > 0) {
      return { ...base, dateRange: { min: sorted[0], max: sorted[sorted.length - 1] } }
    }
  }

  return base
}

/* ------------------------------------------------------------------ */
/* Grouping                                                            */
/* ------------------------------------------------------------------ */

export type Aggregation = 'sum' | 'mean' | 'count' | 'min' | 'max'

export function groupAggregate(
  parsed: ParsedCsv,
  options: { groupByIndex: number; valueIndex: number; aggregation: Aggregation },
): GroupingResult {
  const { groupByIndex, valueIndex, aggregation } = options
  const groupLabel = parsed.headers[groupByIndex] ?? ''
  const valueLabel = parsed.headers[valueIndex] ?? ''

  const groups = new Map<string, number[]>()
  for (const row of parsed.rows) {
    const groupKey = (row[groupByIndex] ?? '').trim() || '(blank)'
    const raw = (row[valueIndex] ?? '').trim()
    const numeric = parseNumberStrict(raw)
    if (!groups.has(groupKey)) groups.set(groupKey, [])
    if (aggregation === 'count') {
      groups.get(groupKey)!.push(1)
    } else if (numeric !== null) {
      groups.get(groupKey)!.push(numeric)
    }
    // Non-numeric values are excluded from numeric aggregations.
  }

  const points: { label: string; value: number }[] = []
  for (const [label, numbers] of groups) {
    let value: number
    switch (aggregation) {
      case 'count':
        value = numbers.length
        break
      case 'sum':
        value = numbers.reduce((acc, entry) => acc + entry, 0)
        break
      case 'mean':
        value = numbers.length > 0 ? numbers.reduce((acc, entry) => acc + entry, 0) / numbers.length : 0
        break
      case 'min':
        value = numbers.length > 0 ? Math.min(...numbers) : 0
        break
      case 'max':
        value = numbers.length > 0 ? Math.max(...numbers) : 0
        break
    }
    points.push({ label, value })
  }

  points.sort((a, b) => b.value - a.value)
  return {
    groupBy: groupLabel,
    value: valueLabel,
    aggregation,
    points: points.slice(0, 24),
  }
}

/* ------------------------------------------------------------------ */
/* Exports                                                             */
/* ------------------------------------------------------------------ */

/**
 * Sanitize a cell for CSV export: spreadsheet formula injection is
 * neutralized by prefixing a quote. Used whenever untrusted text is
 * exported.
 */
export function sanitizeCsvCell(value: string): string {
  const trimmed = value.trimStart()
  if (/^[=+\-@\t\r]/.test(trimmed) && trimmed.length > 1) {
    return `'${value}`
  }
  return value
}

export function rowsToCsv(headers: string[], rows: string[][]): string {
  const escape = (cell: string) => {
    const safe = sanitizeCsvCell(cell ?? '')
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }
  const lines = [headers.map(escape).join(',')]
  for (const row of rows) {
    lines.push(row.map(escape).join(','))
  }
  return lines.join('\n')
}

export function summarizeToMarkdown(input: {
  fileName: string
  parsed: ParsedCsv
  summaries: ColumnSummary[]
  grouping: GroupingResult | null
}): string {
  const { fileName, parsed, summaries, grouping } = input
  const lines: string[] = []
  lines.push(`# CSV analysis — ${fileName}`)
  lines.push('')
  lines.push(
    `Analyzed locally in your browser: ${parsed.rows.length.toLocaleString()} rows × ${parsed.headers.length} columns.`,
  )
  lines.push('')
  if (parsed.warnings.length > 0) {
    lines.push('## Warnings')
    lines.push('')
    for (const warning of parsed.warnings) {
      lines.push(`- ${warning.message}`)
    }
    lines.push('')
  }
  lines.push('## Columns')
  lines.push('')
  lines.push('| Column | Type | Missing | Distinct | Summary |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const summary of summaries) {
    let summaryText = ''
    if (summary.numeric) {
      summaryText = `min ${round(summary.numeric.min)}, max ${round(summary.numeric.max)}, mean ${round(summary.numeric.mean)}, median ${round(summary.numeric.median)}`
    } else if (summary.dateRange) {
      summaryText = `${summary.dateRange.min} → ${summary.dateRange.max}`
    } else if (summary.topValue) {
      summaryText = `most common: “${summary.topValue.value}” (${summary.topValue.count}×)`
    }
    lines.push(
      `| ${summary.header} | ${summary.type} | ${summary.missing} | ${summary.distinct} | ${summaryText} |`,
    )
  }
  if (grouping) {
    lines.push('')
    lines.push(`## ${grouping.aggregation} of ${grouping.value} by ${grouping.groupBy}`)
    lines.push('')
    lines.push(`| ${grouping.groupBy} | ${grouping.aggregation}(${grouping.value}) |`)
    lines.push('| --- | --- |')
    for (const point of grouping.points) {
      lines.push(`| ${point.label} | ${round(point.value)} |`)
    }
  }
  lines.push('')
  lines.push('_Computed locally by Uni from the uploaded file; the file itself was not uploaded anywhere._')
  return lines.join('\n')
}

function round(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  if (Number.isInteger(value)) return value.toLocaleString()
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}
