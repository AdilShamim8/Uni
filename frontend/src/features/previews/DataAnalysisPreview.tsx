import { Download, Table2 } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Badge } from '@/components/ui/Tooltip'
import { downloadText } from '@/features/chat/exportUtils'
import { SAMPLE_CSV, SAMPLE_SUMMARY } from '@/services/mock/previewFixtures'

/**
 * Data analysis preview: a bundled sample file with precomputed results.
 * No computation is performed on anything the user uploads.
 */
export function DataAnalysisPreview() {
  const closePreview = useAppStore((state) => state.closePreview)

  const rows = SAMPLE_CSV.trim().split('\n').map((line) => line.split(','))
  const header = rows[0]
  const body = rows.slice(1)
  const maxValue = Math.max(...SAMPLE_SUMMARY.chart.map((point) => point.value))
  const chartWidth = 560
  const chartHeight = 180
  const barWidth = chartWidth / SAMPLE_SUMMARY.chart.length - 8

  return (
    <Dialog
      open
      onClose={closePreview}
      title="Data analysis preview"
      description="A bundled sample file with precomputed results — uploaded files are never analyzed in this prototype."
      size="lg"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => downloadText('universe-sample-data.csv', SAMPLE_CSV, 'text/csv')}
          >
            <Download size={14} />
            Download sample CSV
          </Button>
          <Button variant="primary" onClick={closePreview}>
            Done
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="warning">
            <Table2 size={11} /> Fixture results — not computed from your files
          </Badge>
          <span className="text-xs text-ink-faint">
            {SAMPLE_SUMMARY.rows} rows · {SAMPLE_SUMMARY.columns.length} columns · file: sample.csv
          </span>
        </div>

        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {header.map((cell) => (
                  <th
                    key={cell}
                    className="border-b border-line bg-subtle px-3 py-2 text-left font-semibold text-ink"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, index) => (
                    <td key={index} className="border-b border-line px-3 py-1.5 text-ink">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section aria-label="Highlights">
          <h3 className="text-sm font-semibold text-ink">Highlights</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink-soft">
            {SAMPLE_SUMMARY.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        </section>

        <section aria-label="Checkouts by month (bundled chart)">
          <h3 className="text-sm font-semibold text-ink">Checkouts by month</h3>
          <svg
            viewBox={`0 0 ${chartWidth} ${chartHeight + 24}`}
            className="mt-2 w-full"
            role="img"
            aria-label="Bar chart of sample checkouts by month"
          >
            {SAMPLE_SUMMARY.chart.map((point, index) => {
              const height = (point.value / maxValue) * chartHeight
              const x = index * (chartWidth / SAMPLE_SUMMARY.chart.length) + 4
              return (
                <g key={point.label}>
                  <rect
                    x={x}
                    y={chartHeight - height}
                    width={barWidth}
                    height={height}
                    rx={4}
                    fill="var(--c-accent)"
                  />
                  <text
                    x={x + barWidth / 2}
                    y={chartHeight + 14}
                    textAnchor="middle"
                    fontSize="10"
                    fill="var(--c-ink-faint)"
                  >
                    {point.label}
                  </text>
                </g>
              )
            })}
          </svg>
        </section>
      </div>
    </Dialog>
  )
}
