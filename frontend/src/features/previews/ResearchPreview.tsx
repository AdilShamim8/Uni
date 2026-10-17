import { useEffect, useState } from 'react'
import { Check, Copy, Download, Play } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Spinner } from '@/components/ui/Spinner'
import { TextArea } from '@/components/ui/TextField'
import { Markdown } from '@/features/chat/Markdown'
import { downloadText } from '@/features/chat/exportUtils'
import { buildResearchReport, RESEARCH_STEPS } from '@/services/mock/previewFixtures'

/**
 * Research preview: brief in, clearly-labeled simulated progress, fixture
 * report with example sources. No real search occurs.
 */
export function ResearchPreview({ brief }: { brief?: string }) {
  const closePreview = useAppStore((state) => state.closePreview)
  const showToast = useAppStore((state) => state.showToast)
  const [value, setValue] = useState(brief ?? '')
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle')
  const [stepIndex, setStepIndex] = useState(-1)

  useEffect(() => {
    if (phase !== 'running') return
    if (stepIndex >= RESEARCH_STEPS.length - 1) {
      const timer = setTimeout(() => setPhase('done'), 800)
      return () => clearTimeout(timer)
    }
    const timer = setTimeout(() => setStepIndex((index) => index + 1), 850)
    return () => clearTimeout(timer)
  }, [phase, stepIndex])

  const report = phase === 'done' ? buildResearchReport(value) : null

  async function copyReport() {
    if (!report) return
    try {
      await navigator.clipboard.writeText(report)
      showToast('Report copied to clipboard')
    } catch {
      showToast('Clipboard unavailable in this browser')
    }
  }

  return (
    <Dialog
      open
      onClose={closePreview}
      title="Research preview"
      description="A simulated workflow: progress is labeled, the report is a fixture, and every source is an example."
      size="lg"
      footer={
        report ? (
          <>
            <Button variant="ghost" onClick={() => void copyReport()}>
              <Copy size={14} />
              Copy report
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                downloadText('universe-research-report.md', report, 'text/markdown')
              }
            >
              <Download size={14} />
              Download Markdown
            </Button>
            <Button variant="primary" onClick={closePreview}>
              Done
            </Button>
          </>
        ) : undefined
      }
    >
      {phase === 'done' && report ? (
        <Markdown content={report} />
      ) : (
        <div className="flex flex-col gap-4">
          <TextArea
            label="Research brief"
            hint="What should the simulated investigation look into?"
            rows={3}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={phase === 'running'}
            placeholder="e.g. Compare small-scale composting options for an apartment"
          />
          <Button
            variant="primary"
            className="self-start"
            disabled={!value.trim() || phase === 'running'}
            onClick={() => {
              setStepIndex(0)
              setPhase('running')
            }}
          >
            <Play size={14} />
            Start research (simulated)
          </Button>

          {phase === 'running' && (
            <ol className="flex flex-col gap-2 rounded-xl border border-line bg-raised p-4" aria-live="polite">
              <li className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Simulated progress
              </li>
              {RESEARCH_STEPS.map((step, index) => (
                <li key={step} className="flex items-center gap-2.5 text-sm">
                  {index < stepIndex ? (
                    <Check size={15} className="text-success" />
                  ) : index === stepIndex ? (
                    <Spinner size={14} />
                  ) : (
                    <span className="inline-block h-[14px] w-[14px] rounded-full border border-line-strong" />
                  )}
                  <span className={index <= stepIndex ? 'text-ink' : 'text-ink-faint'}>{step}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Dialog>
  )
}
