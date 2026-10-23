import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, Copy, FileText, Play, RotateCcw, Square } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { useCompareStore, type CompareSlot } from '@/state/compareStore'
import { useContextStore } from '@/state/contextStore'
import {
  buildContextBlock,
  resolveContextItems,
  totalContextSize,
} from '@/domain/contextResolution'
import { useLibraryStore } from '@/state/libraryStore'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Tooltip } from '@/components/ui/Tooltip'

/**
 * Side-by-side model comparison. Explicit by design: pick two models, one
 * prompt, inspect the intended context, then press Run. Live comparisons
 * warn that up to two requests may be charged. Each side runs in its own
 * controller — one failure never erases the other. Results are presented
 * neutrally: no invented scores, costs, or latencies; only measured
 * durations.
 */

export function CompareDialog() {
  const navigate = useNavigate()
  const open = useAppStore((state) => state.ui.compareOpen)
  const setUi = useAppStore((state) => state.setUi)
  const providers = useAppStore((state) => state.providers)
  const credentials = useAppStore((state) => state.credentials)
  const activeConversationId = useAppStore((state) => state.activeConversationId)
  const importComparisonResult = useAppStore((state) => state.importComparisonResult)
  const showToast = useAppStore((state) => state.showToast)

  const current = useCompareStore((state) => state.current)
  const startComparison = useCompareStore((state) => state.startComparison)
  const stopSlot = useCompareStore((state) => state.stopSlot)
  const clearCurrent = useCompareStore((state) => state.clearCurrent)

  const artifacts = useLibraryStore((state) => state.artifacts)
  const projects = useLibraryStore((state) => state.projects)
  const addArtifact = useLibraryStore((state) => state.addArtifact)
  const openInspector = useWorkspaceUiStore((state) => state.openInspector)

  const contextSelection = useContextStore((state) => state.selections)

  const [prompt, setPrompt] = useState('')
  const [slotA, setSlotA] = useState<string | null>(null) // "providerId::modelId"
  const [slotB, setSlotB] = useState<string | null>(null)

  const modelOptions = useMemo(() => {
    const options: (CompareSlot & { value: string; live: boolean })[] = []
    for (const provider of providers) {
      const live = credentials[provider.id]?.status === 'connected'
      for (const model of provider.models) {
        options.push({
          value: `${provider.id}::${model.id}`,
          providerId: provider.id,
          modelId: model.id,
          modelLabel: model.label,
          providerLabel: provider.label,
          live,
        })
      }
    }
    return options
  }, [providers, credentials])

  const pickedA = modelOptions.find((option) => option.value === slotA) ?? null
  const pickedB = modelOptions.find((option) => option.value === slotB) ?? null

  const contextSummary = useMemo(() => {
    if (!activeConversationId) return null
    const items = contextSelection[activeConversationId] ?? []
    if (items.length === 0) return null
    const resolved = resolveContextItems(items, artifacts, projects)
    return {
      count: items.length,
      characters: totalContextSize(resolved),
      block: buildContextBlock(resolved),
    }
  }, [activeConversationId, contextSelection, artifacts, projects])

  const anyLive = !!pickedA?.live || !!pickedB?.live
  const canRun = prompt.trim().length > 0 && !!pickedA && !!pickedB

  function close() {
    clearCurrent()
    setUi({ compareOpen: false })
  }

  function run() {
    if (!pickedA || !pickedB || !prompt.trim()) return
    startComparison({
      prompt: prompt.trim(),
      slots: [
        {
          providerId: pickedA.providerId,
          modelId: pickedA.modelId,
          modelLabel: pickedA.modelLabel,
          providerLabel: pickedA.providerLabel,
        },
        {
          providerId: pickedB.providerId,
          modelId: pickedB.modelId,
          modelLabel: pickedB.modelLabel,
          providerLabel: pickedB.providerLabel,
        },
      ],
      contextBlock: contextSummary?.block ?? '',
      history: [],
    })
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Compare models"
      description={
        current
          ? 'Each side runs in its own request. Stopping or retrying one side never affects the other.'
          : 'One prompt, two models, side by side. Runs only when you press Run.'
      }
      size="lg"
      footer={
        current ? (
          <>
            <span className="mr-auto hidden text-xs text-ink-faint sm:inline">
              {current.mode === 'live'
                ? 'Live — sides use your connected providers'
                : 'Demo — fixture responses, no provider contacted'}
              {current.contextIncluded ? ' · context included' : ''}
            </span>
            <Button variant="ghost" onClick={close}>
              Close
            </Button>
          </>
        ) : (
          <>
            {anyLive && (
              <p className="mr-auto max-w-[16rem] text-left text-[11px] leading-snug text-warning">
                Live models are selected — running sends up to two requests and may incur both
                providers' charges.
              </p>
            )}
            <Button variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!canRun} onClick={run}>
              <Play size={14} />
              Run comparison
            </Button>
          </>
        )
      }
    >
      {!current ? (
        <div className="flex flex-col gap-4">
          {modelOptions.length === 0 ? (
            <p className="text-sm leading-relaxed text-ink-soft">
              No models are configured yet. Add a provider in Settings to compare real models;
              demo profiles can be compared without a key.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <ModelPicker
                label="Model A"
                options={modelOptions}
                value={slotA}
                onChange={setSlotA}
              />
              <ModelPicker
                label="Model B"
                options={modelOptions}
                value={slotB}
                onChange={setSlotB}
              />
            </div>
          )}

          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Prompt
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              rows={4}
              className="w-full resize-none rounded-control border border-line bg-raised p-3 text-sm font-normal leading-relaxed text-ink focus:border-accent focus:outline-none"
              placeholder="The one prompt both models will answer"
            />
          </label>

          {contextSummary ? (
            <p className="rounded-control bg-subtle px-3 py-2 text-xs leading-relaxed text-ink-soft">
              Context: {contextSummary.count} item
              {contextSummary.count === 1 ? '' : 's'} ·{' '}
              {contextSummary.characters.toLocaleString()} characters from this conversation will
              be included with live requests. Review them in the Context inspector.
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-ink-faint">
              No context is selected for this conversation, so only the prompt itself is sent.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {([0, 1] as const).map((slotIndex) => {
            const slot = current.slots[slotIndex]
            const result = current.results[slotIndex]
            return (
              <section
                key={slotIndex}
                aria-label={`Result from ${slot.modelLabel}`}
                className="flex min-w-0 flex-col rounded-group border border-line bg-raised"
              >
                <header className="flex items-center gap-2 border-b border-line px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-ink">
                      {slot.modelLabel}
                    </p>
                    <p className="truncate text-[11px] text-ink-faint">
                      {slot.providerLabel}
                      {current.mode === 'live' ? ' · live' : ' · demo fixture'}
                    </p>
                  </div>
                  {result.status === 'running' ? (
                    <Button variant="ghost" size="sm" onClick={() => stopSlot(slotIndex)}>
                      <Square size={13} />
                      Stop
                    </Button>
                  ) : result.status === 'error' ? (
                    <Tooltip label="Run this side again with the same prompt">
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Retry ${slot.modelLabel}`}
                        onClick={() => {
                          startComparison({
                            prompt: current.prompt,
                            slots: current.slots,
                            contextBlock: contextSummary?.block ?? '',
                            history: [],
                          })
                        }}
                      >
                        <RotateCcw size={13} />
                        Retry
                      </Button>
                    </Tooltip>
                  ) : null}
                </header>
                <div className="min-h-[8rem] max-h-72 overflow-y-auto px-3 py-2.5">
                  {result.status === 'idle' && <p className="text-xs text-ink-faint">Waiting…</p>}
                  {result.status === 'error' && (
                    <p role="alert" className="text-xs leading-relaxed text-danger">
                      {result.error ?? 'The request failed.'}
                    </p>
                  )}
                  {result.status === 'stopped' && result.content.length === 0 && (
                    <p className="text-xs text-ink-faint">Stopped before any output.</p>
                  )}
                  {result.content.length > 0 && (
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
                      {result.content}
                      {result.status === 'running' && (
                        <span
                          aria-hidden="true"
                          className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-accent align-text-bottom motion-reduce:animate-none"
                        />
                      )}
                    </p>
                  )}
                </div>
                <footer className="flex items-center gap-1.5 border-t border-line px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-[11px] text-ink-faint">
                    {result.status === 'running'
                      ? 'Streaming…'
                      : result.endedAt && result.startedAt
                        ? `Finished in ${((result.endedAt - result.startedAt) / 1000).toFixed(1)}s`
                        : result.status}
                  </span>
                  {result.content.length > 0 && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Copy result from ${slot.modelLabel}`}
                        onClick={() => {
                          void navigator.clipboard
                            .writeText(result.content)
                            .then(() => showToast('Result copied'))
                            .catch(() => showToast('Clipboard unavailable in this browser'))
                        }}
                      >
                        <Copy size={13} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const id = importComparisonResult({
                            prompt: current.prompt,
                            response: result.content,
                            modelLabel: slot.modelLabel,
                            providerLabel: slot.providerLabel,
                          })
                          close()
                          navigate(`/c/${id}`)
                        }}
                      >
                        <ArrowRight size={13} />
                        Continue in chat
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const id = addArtifact({
                            title: `Comparison — ${current.prompt.slice(0, 50)}`,
                            kind: 'document',
                            markdown: `# Comparison — ${slot.modelLabel}\n\n**Prompt:** ${current.prompt}\n\n## Response (${slot.modelLabel} via ${slot.providerLabel})\n\n${result.content}\n`,
                            provenance: 'model-output',
                          })
                          openInspector({ tab: 'canvas', artifactId: id })
                        }}
                      >
                        <FileText size={13} />
                        Save to Canvas
                      </Button>
                    </>
                  )}
                </footer>
              </section>
            )
          })}
        </div>
      )}
    </Dialog>
  )
}

function ModelPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: { value: string; modelLabel: string; providerLabel: string; live: boolean }[]
  value: string | null
  onChange: (value: string | null) => void
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium text-ink">
      {label}
      <select
        aria-label={`${label} selection`}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
        className="w-full min-w-0 rounded-control border border-line bg-raised px-2.5 py-2 text-sm font-normal text-ink focus:border-accent focus:outline-none"
      >
        <option value="">Choose a model…</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.modelLabel} — {option.providerLabel}
            {option.live ? ' (live)' : ''}
          </option>
        ))}
      </select>
    </label>
  )
}
