import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, Download, Save, Table2, Upload } from 'lucide-react'
import {
  MAX_FILE_BYTES,
  MAX_ROWS,
  groupAggregate,
  parseCsvText,
  profileColumns,
  rowsToCsv,
  summarizeColumn,
  summarizeToMarkdown,
  type Aggregation,
  type ColumnTypeChoice,
  type ParsedCsv,
} from '@/domain/csvAnalysis'
import { SAMPLE_CSV } from '@/services/mock/previewFixtures'
import { useAppStore } from '@/state/store'
import { useLibraryStore } from '@/state/libraryStore'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { Tooltip } from '@/components/ui/Tooltip'
import { downloadText, slugifyTitle } from '@/features/chat/exportUtils'

/**
 * Data analysis — real browser-local computation over an uploaded CSV.
 * The bundled sample runs through the exact same code path, explicitly
 * labeled as an example. Nothing is precomputed: change the input, or a
 * column type, and the results change.
 *
 * Retention is explicit: the source file is read in memory only and never
 * persisted; saving keeps a derived summary artifact with local-computation
 * provenance and input metadata.
 */

const SAMPLE_FILE_NAME = 'sample-checkouts.csv'

interface LoadedFile {
  name: string
  parsed: ParsedCsv
  isSample: boolean
}

export function DataAnalysisPreview() {
  const closePreview = useAppStore((state) => state.closePreview)
  const showToast = useAppStore((state) => state.showToast)
  const addArtifact = useLibraryStore((state) => state.addArtifact)
  const openInspector = useWorkspaceUiStore((state) => state.openInspector)

  const [file, setFile] = useState<LoadedFile | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [choices, setChoices] = useState<Record<number, ColumnTypeChoice>>({})
  const [groupByIndex, setGroupByIndex] = useState<number | null>(null)
  const [valueIndex, setValueIndex] = useState<number | null>(null)
  const [aggregation, setAggregation] = useState<Aggregation>('sum')
  const [savedArtifactId, setSavedArtifactId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const profiles = useMemo(
    () => (file ? profileColumns(file.parsed) : []),
    [file],
  )
  const summaries = useMemo(
    () => profiles.map((profile, index) => summarizeColumn(profile, choices[index] ?? { type: 'auto' })),
    [profiles, choices],
  )
  const grouping = useMemo(() => {
    if (!file || groupByIndex === null || valueIndex === null) return null
    if (groupByIndex === valueIndex && aggregation !== 'count') return null
    return groupAggregate(file.parsed, { groupByIndex, valueIndex, aggregation })
  }, [file, groupByIndex, valueIndex, aggregation])

  function loadText(name: string, text: string, isSample: boolean) {
    setError(null)
    setSavedArtifactId(null)
    try {
      const parsed = parseCsvText(text)
      setChoices({})
      setGroupByIndex(null)
      setValueIndex(null)
      setAggregation('sum')
      setFile({ name, parsed, isSample })
    } catch (parseError) {
      setFile(null)
      setError(
        parseError instanceof Error
          ? parseError.message
          : 'The file could not be parsed as CSV/TSV.',
      )
    }
  }

  async function handleFile(selected: File) {
    if (selected.size > MAX_FILE_BYTES) {
      setError(`“${selected.name}” is larger than the ${MAX_FILE_BYTES / 1024 / 1024} MB limit.`)
      setFile(null)
      return
    }
    const text = await selected.text()
    loadText(selected.name, text, false)
  }

  function saveSummary() {
    if (!file) return
    const markdown = summarizeToMarkdown({
      fileName: file.name,
      parsed: file.parsed,
      summaries,
      grouping,
    })
    const id = addArtifact({
      title: `Analysis — ${file.name}`,
      kind: 'data',
      markdown,
      provenance: 'local-computation',
    })
    setSavedArtifactId(id)
    showToast('Summary saved to Library — the source file itself was not kept')
  }

  const canGroup = !!file && profiles.length > 0

  return (
    <Dialog
      open
      onClose={closePreview}
      title="Data analysis"
      description={`Real, local analysis of CSV/TSV files up to ${MAX_FILE_BYTES / 1024 / 1024} MB and ${MAX_ROWS.toLocaleString()} rows. Files never leave this browser.`}
      size="lg"
      footer={
        <>
          {file && (
            <span className="mr-auto hidden text-xs text-ink-faint sm:inline">
              {file.isSample ? 'Example file — same computation as uploads' : file.name} ·{' '}
              {file.parsed.rows.length.toLocaleString()} rows × {file.parsed.headers.length} cols
              {file.parsed.truncated ? ' (truncated)' : ''}
            </span>
          )}
          {file && (
            <>
              <Button
                variant="ghost"
                onClick={() =>
                  downloadText(
                    `${slugifyTitle(file.name)}-selected.csv`,
                    rowsToCsv(file.parsed.headers, file.parsed.rows),
                    'text/csv',
                  )
                }
              >
                <Download size={14} />
                Download data
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  downloadText(
                    `${slugifyTitle(file.name)}-summary.md`,
                    summarizeToMarkdown({ fileName: file.name, parsed: file.parsed, summaries, grouping }),
                    'text/markdown',
                  )
                }
              >
                <Download size={14} />
                Summary
              </Button>
              <Button variant="primary" onClick={saveSummary}>
                <Save size={14} />
                Save summary
              </Button>
            </>
          )}
          {!file && (
            <Button variant="primary" onClick={closePreview}>
              Done
            </Button>
          )}
        </>
      }
    >
      {!file ? (
        <div className="flex flex-col gap-4">
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload a CSV file to analyze"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                fileInputRef.current?.click()
              }
            }}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-group border-2 border-dashed border-line px-6 py-10 text-center transition-colors hover:border-accent hover:bg-accent-soft/40"
          >
            <Upload size={22} className="text-ink-faint" aria-hidden="true" />
            <p className="text-sm font-medium text-ink">Drop or choose a CSV/TSV file</p>
            <p className="max-w-md text-xs leading-relaxed text-ink-faint">
              Parsed and computed locally — quoted delimiters, multiline cells, and malformed rows
              are handled and reported. The file is never uploaded or persisted.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/plain"
              className="sr-only"
              onChange={(event) => {
                const selected = event.target.files?.[0]
                if (selected) void handleFile(selected)
                event.target.value = ''
              }}
            />
          </div>
          {error && (
            <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadText(SAMPLE_FILE_NAME, SAMPLE_CSV, true)}
            >
              <Table2 size={14} />
              Try the labeled sample
            </Button>
          </div>
          <p className="text-center text-[11.5px] leading-relaxed text-ink-faint">
            Only CSV/TSV text files are supported in this milestone — spreadsheets (xlsx), PDFs,
            and other formats are not.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {file.isSample && (
            <p className="rounded-control bg-accent-soft px-3 py-2 text-xs font-medium text-accent">
              Example file — the sample runs through the same local computation as your uploads.
            </p>
          )}

          {file.parsed.warnings.length > 0 && (
            <div
              role="status"
              className="rounded-control border border-warning/40 bg-warning-soft px-3 py-2.5"
            >
              <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                <AlertTriangle size={13} /> Parsing notes
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs leading-relaxed text-ink-soft">
                {file.parsed.warnings.map((warning) => (
                  <li key={warning.message}>{warning.message}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Input preview */}
          <section aria-label="Input preview">
            <h3 className="text-sm font-semibold text-ink">Input preview</h3>
            <div className="mt-2 overflow-x-auto rounded-xl border border-line">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {file.parsed.headers.map((header) => (
                      <th
                        key={header}
                        className="border-b border-line bg-subtle px-3 py-2 text-left font-semibold text-ink"
                      >
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {file.parsed.rows.slice(0, 8).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex} className="border-b border-line px-3 py-1.5 text-ink">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {file.parsed.rows.length > 8 && (
              <p className="mt-1 text-[11px] text-ink-faint">
                First 8 of {file.parsed.rows.length.toLocaleString()} rows.
              </p>
            )}
          </section>

          {/* Column types */}
          <section aria-label="Column types and summaries">
            <h3 className="text-sm font-semibold text-ink">Columns</h3>
            <div className="mt-2 overflow-x-auto rounded-xl border border-line">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-subtle text-left text-xs uppercase tracking-wide text-ink-faint">
                    <th className="px-3 py-2 font-semibold">Column</th>
                    <th className="px-3 py-2 font-semibold">Type</th>
                    <th className="px-3 py-2 font-semibold">Missing</th>
                    <th className="px-3 py-2 font-semibold">Summary</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((profile, index) => {
                    const summary = summaries[index]
                    const choice = choices[index] ?? { type: 'auto' as const }
                    return (
                      <tr key={profile.header} className="border-t border-line align-top">
                        <td className="px-3 py-2">
                          <p className="font-medium text-ink">{profile.header}</p>
                          {profile.note && (
                            <Tooltip label={profile.note}>
                              <span className="text-[11px] text-ink-faint">{profile.note}</span>
                            </Tooltip>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <select
                            aria-label={`Type for ${profile.header}`}
                            value={choice.type}
                            onChange={(event) =>
                              setChoices((current) => ({
                                ...current,
                                [index]: { type: event.target.value as ColumnTypeChoice['type'] },
                              }))
                            }
                            className="rounded-control border border-line bg-raised px-2 py-1 text-xs text-ink focus:border-accent focus:outline-none"
                          >
                            <option value="auto">Auto ({profile.inferred})</option>
                            <option value="text">Text</option>
                            <option value="number">Number</option>
                            <option value="date">Date</option>
                          </select>
                        </td>
                        <td className="px-3 py-2 text-ink-soft">{summary.missing}</td>
                        <td className="px-3 py-2 text-xs leading-relaxed text-ink-soft">
                          {summary.numeric ? (
                            <span>
                              min {fmt(summary.numeric.min)} · max {fmt(summary.numeric.max)} · mean{' '}
                              {fmt(summary.numeric.mean)} · median {fmt(summary.numeric.median)} ·
                              σ {fmt(summary.numeric.stddev)}
                            </span>
                          ) : summary.dateRange ? (
                            <span>
                              {summary.dateRange.min} → {summary.dateRange.max}
                            </span>
                          ) : summary.topValue ? (
                            <span>
                              {summary.distinct} distinct · most common “{summary.topValue.value}” (
                              {summary.topValue.count}×)
                            </span>
                          ) : (
                            <span>{summary.distinct} distinct</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Grouping + chart */}
          {canGroup && (
            <section aria-label="Grouping and chart">
              <h3 className="text-sm font-semibold text-ink">Group and chart</h3>
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
                  Group by
                  <select
                    aria-label="Group by column"
                    value={groupByIndex ?? ''}
                    onChange={(event) =>
                      setGroupByIndex(event.target.value === '' ? null : Number(event.target.value))
                    }
                    className="rounded-control border border-line bg-raised px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
                  >
                    <option value="">Choose a column…</option>
                    {file.parsed.headers.map((header, index) => (
                      <option key={header} value={index}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
                  Value
                  <select
                    aria-label="Value column"
                    value={valueIndex ?? ''}
                    onChange={(event) =>
                      setValueIndex(event.target.value === '' ? null : Number(event.target.value))
                    }
                    className="rounded-control border border-line bg-raised px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
                  >
                    <option value="">Choose a column…</option>
                    {file.parsed.headers.map((header, index) => (
                      <option key={header} value={index}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs font-medium text-ink-soft">
                  Aggregation
                  <select
                    aria-label="Aggregation"
                    value={aggregation}
                    onChange={(event) => setAggregation(event.target.value as Aggregation)}
                    className="rounded-control border border-line bg-raised px-2 py-1.5 text-xs text-ink focus:border-accent focus:outline-none"
                  >
                    <option value="sum">Sum</option>
                    <option value="mean">Mean</option>
                    <option value="count">Count</option>
                    <option value="min">Min</option>
                    <option value="max">Max</option>
                  </select>
                </label>
              </div>

              {grouping && (
                <>
                  <p className="mt-3 text-xs text-ink-faint">
                    {grouping.aggregation} of “{grouping.value}” grouped by “{grouping.groupBy}” —
                    computed from the parsed rows.
                  </p>
                  <svg
                    viewBox={`0 0 560 ${Math.max(60, grouping.points.length * 22 + 8)}`}
                    className="mt-2 w-full"
                    role="img"
                    aria-label={`Bar chart: ${grouping.aggregation} of ${grouping.value} by ${grouping.groupBy}`}
                  >
                    {grouping.points.map((point, index) => {
                      const max = Math.max(...grouping.points.map((p) => Math.abs(p.value)), 1)
                      const width = (Math.abs(point.value) / max) * 400
                      const y = index * 22 + 4
                      return (
                        <g key={point.label}>
                          <text
                            x={0}
                            y={y + 11}
                            fontSize="10"
                            fill="var(--c-ink-faint)"
                            textAnchor="start"
                          >
                            {point.label.slice(0, 14)}
                          </text>
                          <rect
                            x={110}
                            y={y}
                            width={Math.max(width, 2)}
                            height={16}
                            rx={4}
                            fill="var(--c-accent)"
                          />
                          <text
                            x={110 + Math.max(width, 2) + 6}
                            y={y + 11}
                            fontSize="10"
                            fill="var(--c-ink-soft)"
                          >
                            {fmt(point.value)}
                          </text>
                        </g>
                      )
                    })}
                  </svg>
                  {/* Data-table alternative to the chart */}
                  <div className="mt-2 overflow-x-auto rounded-xl border border-line">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-subtle text-left text-xs uppercase tracking-wide text-ink-faint">
                          <th className="px-3 py-2 font-semibold">{grouping.groupBy}</th>
                          <th className="px-3 py-2 font-semibold">
                            {grouping.aggregation}({grouping.value})
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {grouping.points.map((point) => (
                          <tr key={point.label} className="border-t border-line">
                            <td className="px-3 py-1.5 text-ink">{point.label}</td>
                            <td className="px-3 py-1.5 text-ink-soft">{fmt(point.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {groupByIndex !== null && valueIndex !== null && !grouping && (
                <p className="mt-2 text-xs text-ink-faint">
                  Choose two different columns (or Count, which works on one).
                </p>
              )}
            </section>
          )}

          {savedArtifactId && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-success-soft px-3 py-2">
              <p className="text-xs text-ink-soft">
                Summary saved to Library with local-computation provenance. The source file was
                not persisted.
              </p>
              <Menu
                label="Saved summary actions"
                trigger={
                  <Button variant="ghost" size="sm">
                    Open
                  </Button>
                }
              >
                <MenuItem
                  onClick={() => {
                    closePreview()
                    openInspector({ tab: 'canvas', artifactId: savedArtifactId })
                  }}
                >
                  Open in Canvas
                </MenuItem>
              </Menu>
            </div>
          )}
        </div>
      )}
    </Dialog>
  )
}

function fmt(value: number): string {
  if (!Number.isFinite(value)) return String(value)
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 })
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}


