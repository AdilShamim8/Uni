import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check,
  ChevronDown,
  Download,
  FolderPlus,
  MoreHorizontal,
  PencilLine,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useWorkStore } from '@/state/workStore'
import { useAgentsStore } from '@/state/agentsStore'
import { useLibraryStore } from '@/state/libraryStore'
import { useAppStore } from '@/state/store'
import { Button } from '@/components/ui/Button'
import { StatusPill } from '@/components/ui/StatusPill'
import { PageToolbar } from '@/components/layout/PageToolbar'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Markdown } from '@/features/chat/Markdown'
import { downloadText, slugifyTitle } from '@/features/chat/exportUtils'
import { ThreadView } from '@/features/conversation/ThreadView'
import { ThreadComposer } from '@/features/conversation/ThreadComposer'
import { projectWorkThread } from '@/features/conversation/threadModel'
import { TASK_STATUS_LABELS, TASK_STATUS_TONES } from '@/domain/taskMachine'
import { TASK_TEMPLATES } from './taskTemplates'
import type { WorkTask } from '@/domain/workspaceTypes'

/**
 * The message-first task workspace (milestone 06): the thread IS the task
 * page. Brief / Activity / Outputs move into a compact inspector (desktop
 * right column, mobile bottom sheet), and the composer sends follow-ups
 * that drive real runs.
 */
export function TaskThread({ taskId }: { taskId: string }) {
  const navigate = useNavigate()
  const task = useWorkStore((state) => state.tasks[taskId])
  const hydrated = useWorkStore((state) => state.hydrated)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [inspectorTab, setInspectorTab] = useState<'brief' | 'activity' | 'outputs'>('brief')
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Unknown or deleted id → recover to the Work home — but only after
  // hydration, or a direct load would redirect before tasks exist.
  useEffect(() => {
    if (!hydrated) return
    if (!task) navigate('/work', { replace: true })
  }, [task, hydrated, navigate])

  const entries = useMemo(() => (task ? projectWorkThread(task) : []), [task])
  const busy = task?.status === 'running' || task?.status === 'queued'

  if (!task) return null

  const agent = task.agentId ? useAgentsStore.getState().agents[task.agentId] : null
  const sendFollowUp = useWorkStore.getState().sendFollowUp
  const answerInput = useWorkStore.getState().answerInput

  const statusLabel = taskComposerStatus(task, agent?.name ?? null)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageToolbar>
        <button
          type="button"
          onClick={() => navigate('/work')}
          aria-label="Back to Work"
          className="min-touch -ml-1 rounded-control p-1.5 text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronDown size={16} className="rotate-90" aria-hidden="true" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-ink">
          {task.title}
        </h1>
        <StatusPill
          label={TASK_STATUS_LABELS[task.status]}
          tone={TASK_STATUS_TONES[task.status]}
          dot={task.status === 'running'}
        />
        <StatusPill
          label={task.mode === 'ai-draft' ? 'AI draft' : 'Demo'}
          tone={task.mode === 'ai-draft' ? 'accent' : 'neutral'}
        />
        <button
          type="button"
          onClick={() => {
            setInspectorOpen((value) => !value)
            if (!inspectorOpen) setInspectorTab('brief')
          }}
          aria-expanded={inspectorOpen}
          className="min-touch rounded-control px-2 py-1 text-[13px] font-medium text-ink-soft transition-colors hover:bg-subtle hover:text-ink"
        >
          {inspectorOpen ? 'Hide details' : 'Details'}
        </button>
        <Menu
          label="Task actions"
          trigger={
            <button
              type="button"
              aria-label="Task actions"
              className="min-touch rounded-control p-1.5 text-ink-soft transition-colors hover:bg-[var(--c-hover-wash)] hover:text-ink"
            >
              <MoreHorizontal size={17} />
            </button>
          }
        >
          {task.report && (
            <MenuItem
              icon={<Download size={15} />}
              onClick={() => {
                downloadText(`uni-task-${slugifyTitle(task.title)}.md`, task.report!.markdown)
                useAppStore.getState().showToast('Task report downloaded as Markdown')
              }}
            >
              Download report
            </MenuItem>
          )}
          {(task.status === 'completed' || task.status === 'cancelled') && (
            <MenuItem
              icon={<Undo2 size={15} />}
              onClick={() => useWorkStore.getState().reopenTask(taskId)}
            >
              Reopen as draft
            </MenuItem>
          )}
          {task.status === 'failed' && (
            <MenuItem
              icon={<RotateCcw size={15} />}
              onClick={() => useWorkStore.getState().retryTask(taskId)}
            >
              Retry run
            </MenuItem>
          )}
          <MenuItem icon={<Trash2 size={15} />} danger onClick={() => setDeleteOpen(true)}>
            Delete
          </MenuItem>
        </Menu>
      </PageToolbar>

      {/* The thread */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ThreadView
          entries={entries}
          ariaLabel={`Thread for ${task.title}`}
          onAnswerClarify={(answer) => answerInput(taskId, answer)}
        />
        <TaskRunStrip taskId={taskId} />
        <ThreadComposer
          draftKey={`work:${taskId}`}
          textareaId={`work-composer-${taskId}`}
          ariaLabel="Send a follow-up about this task"
          placeholder={
            task.status === 'completed' || task.status === 'cancelled'
              ? 'Saved with history — reopen the task to revise…'
              : busy
                ? 'Add guidance for the next run…'
                : 'Send a follow-up or ask for a revision…'
          }
          statusLabel={statusLabel}
          busy={busy}
          onStop={() => useWorkStore.getState().pauseTask(taskId)}
          onSend={(text) => sendFollowUp(taskId, text)}
        />
      </div>

      {/* Inspector — one panel, responsive: a bottom sheet on phones, a
          docked right panel on larger screens. A single instance keeps
          labels and queries unambiguous. */}
      {inspectorOpen && (
        <div className="fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-scrim lg:hidden"
            onClick={() => setInspectorOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Task details"
            className="safe-left safe-right absolute bottom-0 left-0 right-0 flex max-h-[80dvh] flex-col overflow-hidden rounded-t-[22px] border border-line/70 bg-mat-sidebar shadow-float lg:bottom-3 lg:left-auto lg:right-3 lg:top-3 lg:max-h-none lg:w-[21rem] lg:rounded-[22px]"
          >
            <div className="flex items-center justify-between px-4 pb-1 pt-3">
              <p className="text-[13px] font-semibold text-ink">Details</p>
              <button
                type="button"
                aria-label="Close details"
                onClick={() => setInspectorOpen(false)}
                className="min-touch rounded-full p-1.5 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
              >
                <ChevronDown size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
              <TaskInspector taskId={taskId} tab={inspectorTab} onTab={setInspectorTab} />
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete task?"
        body={`“${task.title}” and its thread history will be removed from this device. This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          useWorkStore.getState().deleteTask(taskId)
          navigate('/work')
        }}
      />
    </div>
  )
}

function taskComposerStatus(task: WorkTask, agentName: string | null): React.ReactNode {
  if (task.status === 'running' || task.status === 'queued') {
    return task.mode === 'ai-draft'
      ? `Streaming from ${task.draftConfig?.model.modelLabel ?? 'the connected model'} — one live request; stop preserves the partial draft.`
      : 'Demo run in progress — steps and output are simulated on this device.'
  }
  if (task.mode === 'ai-draft' && task.draftConfig) {
    return (
      <>
        AI draft · {task.draftConfig.model.modelLabel} via{' '}
        {task.draftConfig.model.providerLabel} — follow-ups send one new live request that
        includes the previous draft{agentName ? ` · agent: ${agentName}` : ''}. Your key stays
        in this browser.
      </>
    )
  }
  return (
    <>
      Demo execution — steps and output are simulated locally; follow-ups rerun the demo with
      your guidance{agentName ? ` · agent: ${agentName}` : ''}.
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Compact run strip (status + controls tied to the current run)       */
/* ------------------------------------------------------------------ */

function TaskRunStrip({ taskId }: { taskId: string }) {
  const task = useWorkStore((state) => state.tasks[taskId])
  if (!task) return null
  const store = useWorkStore.getState()

  const wrap = (children: React.ReactNode) => (
    <div className="mx-auto w-full max-w-column px-3 pt-1 sm:px-4" role="status">
      <div className="rounded-group border border-line bg-raised px-4 py-2.5">{children}</div>
    </div>
  )

  if (task.status === 'needs_input') return null // the clarify card in the thread handles it

  if (task.status === 'draft' && task.mode === 'demo') {
    return wrap(
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ink-soft">
          Ready when you are — the demo run is simulated locally.
        </p>
        <Button variant="secondary" size="sm" onClick={() => store.runTask(taskId)}>
          <Play size={13} />
          Run demo
        </Button>
      </div>,
    )
  }

  if (task.status === 'draft' && task.mode === 'ai-draft') {
    return wrap(
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] leading-relaxed text-ink-soft">
            One live drafting request to{' '}
            <span className="font-medium text-ink">
              {task.draftConfig?.model.modelLabel ?? 'the connected model'}
            </span>{' '}
            — never sent automatically.
          </p>
          <Button
            variant="primary"
            size="sm"
            disabled={!task.draftConfig}
            onClick={() => store.runTask(taskId)}
          >
            <Sparkles size={13} />
            Generate draft
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-warning">
          The provider may charge for this request. Your key stays in this browser.
        </p>
      </div>,
    )
  }

  if (task.status === 'running' || task.status === 'queued') {
    return wrap(
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[13px] font-medium text-ink">
          <span className="h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden="true" />
          {task.mode === 'ai-draft'
            ? `Generating from ${task.draftConfig?.model.modelLabel ?? 'provider'}…`
            : 'Running (demo)…'}
        </p>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => store.pauseTask(taskId)}>
            <Square size={12} />
            {task.mode === 'ai-draft' ? 'Stop' : 'Pause'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => store.cancelTask(taskId)}>
            Cancel
          </Button>
        </div>
      </div>,
    )
  }

  if (task.status === 'paused') {
    return wrap(
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-ink">
            {task.interrupted ? 'Paused — interrupted by a reload' : 'Paused'}
          </p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => store.resumeTask(taskId)}>
              <Play size={12} />
              {task.mode === 'ai-draft' ? 'Generate again' : 'Resume'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => store.cancelTask(taskId)}>
              Cancel
            </Button>
          </div>
        </div>
        {task.interrupted && (
          <p className="text-xs leading-relaxed text-warning">
            {task.mode === 'ai-draft'
              ? 'The request did not continue in the background — a reload ended it. Any partial draft is preserved; generating again starts a new request.'
              : 'The app does not keep working while closed. Resume continues from where the run stopped.'}
          </p>
        )}
      </div>,
    )
  }

  if (task.status === 'failed') {
    return wrap(
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-medium text-danger">Failed</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => store.retryTask(taskId)}>
              <RotateCcw size={12} />
              Retry
            </Button>
            <Button variant="ghost" size="sm" onClick={() => store.reopenTask(taskId)}>
              Reopen as draft
            </Button>
          </div>
        </div>
        {task.error && <p className="text-xs leading-relaxed text-ink-soft">{task.error}</p>}
      </div>,
    )
  }

  if (task.status === 'ready_for_review') {
    return wrap(
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ink-soft">
          Output ready — review it in Details → Outputs, then mark complete.
        </p>
        <Button variant="primary" size="sm" onClick={() => store.completeTask(taskId)}>
          <Check size={13} />
          Mark complete
        </Button>
      </div>,
    )
  }

  if (task.status === 'completed' || task.status === 'cancelled') {
    return wrap(
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-ink-soft">
          {task.status === 'completed'
            ? 'Completed — the output stays in the Library and this thread keeps its history.'
            : 'Cancelled — late events from that run were rejected.'}
        </p>
        <Button variant="ghost" size="sm" onClick={() => store.reopenTask(taskId)}>
          <Undo2 size={12} />
          Reopen as draft
        </Button>
      </div>,
    )
  }

  return null
}

/* ------------------------------------------------------------------ */
/* Inspector — Brief / Activity / Outputs                              */
/* ------------------------------------------------------------------ */

function TaskInspector({
  taskId,
  tab,
  onTab,
}: {
  taskId: string
  tab: 'brief' | 'activity' | 'outputs'
  onTab: (tab: 'brief' | 'activity' | 'outputs') => void
}) {
  const tabs: { id: 'brief' | 'activity' | 'outputs'; label: string }[] = [
    { id: 'brief', label: 'Brief' },
    { id: 'activity', label: 'Activity' },
    { id: 'outputs', label: 'Outputs' },
  ]
  return (
    <div className="px-3 py-3">
      <div className="flex gap-1" role="tablist" aria-label="Task sections">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => onTab(entry.id)}
            className={`min-touch flex-1 rounded-control px-2 py-1 text-[13px] font-medium transition-colors ${
              tab === entry.id ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-subtle'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="mt-3">
        {tab === 'brief' && <BriefPanel taskId={taskId} />}
        {tab === 'activity' && <ActivityPanel taskId={taskId} />}
        {tab === 'outputs' && <OutputsPanel taskId={taskId} />}
      </div>
    </div>
  )
}

function BriefPanel({ taskId }: { taskId: string }) {
  const task = useWorkStore((state) => state.tasks[taskId])
  const agents = useAgentsStore((state) => state.agents)
  const navigate = useNavigate()
  if (!task) return null
  const agent = task.agentId ? agents[task.agentId] : null
  const template = TASK_TEMPLATES.find((entry) => entry.id === task.deliverable)

  const included: string[] = ['Goal']
  if (task.mode === 'ai-draft' && task.draftConfig) {
    if (agent) included.push(`Agent instructions (${agent.name})`)
    if (task.draftConfig.instructions.trim()) included.push('Additional instructions')
    if (task.draftConfig.contextText.trim()) included.push('Selected context')
    included.push(`Follow-up thread (${task.messages.length} messages, bounded)`)
    if (task.report && task.report.markdown.trim()) included.push('Previous draft (on revision)')
  }

  return (
    <section aria-label="Task brief" className="flex flex-col gap-3">
      <div className="rounded-group border border-line bg-raised p-3.5">
        <h2 className="text-[12px] font-medium text-ink-faint">Goal</h2>
        <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
          {task.goal || <span className="text-ink-faint">No goal described.</span>}
        </p>
        <dl className="mt-3 flex flex-col gap-1.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-faint">Deliverable</dt>
            <dd className="font-medium text-ink">{template?.label ?? task.deliverable}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-faint">Agent</dt>
            <dd className="font-medium text-ink">{agent ? agent.name : 'None'}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-ink-faint">Mode</dt>
            <dd className="font-medium text-ink">
              {task.mode === 'ai-draft' && task.draftConfig
                ? `AI draft — ${task.draftConfig.model.modelLabel}`
                : 'Local demo'}
            </dd>
          </div>
        </dl>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2.5"
          onClick={() => navigate(`/work/new?edit=${taskId}`)}
        >
          <PencilLine size={13} />
          Edit in expanded brief
        </Button>
      </div>

      {task.mode === 'ai-draft' && (
        <div className="rounded-group border border-line bg-raised p-3.5">
          <h2 className="text-[12px] font-medium text-ink-faint">Included in the next request</h2>
          <ul className="mt-1.5 flex flex-col gap-1">
            {included.map((item) => (
              <li key={item} className="flex items-start gap-1.5 text-xs leading-relaxed text-ink-soft">
                <Check size={12} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            Nothing else is attached — no files, history, or browsing join the request
            automatically.
          </p>
        </div>
      )}
    </section>
  )
}

function ActivityPanel({ taskId }: { taskId: string }) {
  const task = useWorkStore((state) => state.tasks[taskId])
  if (!task) return null
  const events = [...task.events].sort((a, b) => a.at - b.at)
  return (
    <section aria-label="Full activity log" className="rounded-group border border-line bg-raised p-3.5">
      {events.length === 0 ? (
        <p className="text-xs text-ink-faint">No activity yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {events.map((event) => (
            <li key={event.id} className="flex items-baseline justify-between gap-2">
              <span className="min-w-0">
                <span className="block text-xs leading-snug text-ink">{event.label}</span>
                {event.detail && (
                  <span className="mt-0.5 block text-[11px] text-ink-faint">{event.detail}</span>
                )}
              </span>
              <span className="shrink-0 text-[10px] tabular-nums text-ink-faint/80">
                {new Date(event.at).toLocaleTimeString([], {
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

function OutputsPanel({ taskId }: { taskId: string }) {
  const navigate = useNavigate()
  const task = useWorkStore((state) => state.tasks[taskId])
  const updateReport = useWorkStore((state) => state.updateReport)
  const attachArtifactToReport = useWorkStore((state) => state.attachArtifactToReport)
  const showToast = useAppStore((state) => state.showToast)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  if (!task) return null

  function handleSaveToLibrary() {
    const report = task!.report!
    const library = useLibraryStore.getState()
    const kind =
      report.template === 'email'
        ? 'email'
        : report.template === 'data'
          ? 'data'
          : report.template === 'draft'
            ? 'document'
            : 'report'
    const aiGenerated =
      report.provenance === 'provider-generated'
        ? { provenance: 'provider-generated' as const, generatedBy: report.generatedBy }
        : { provenance: 'demo-simulation' as const, generatedBy: null }
    if (report.artifactId && library.artifacts[report.artifactId]) {
      library.renameArtifact(report.artifactId, task!.title)
      library.updateArtifact(report.artifactId, report.markdown)
      showToast('Library copy updated')
      return
    }
    const artifactId = library.addArtifact({
      title: task!.title,
      kind,
      markdown: report.markdown,
      taskId,
      ...aiGenerated,
    })
    attachArtifactToReport(taskId, artifactId)
    showToast('Saved to Library', {
      actionLabel: 'Open',
      onAction: () => navigate('/library'),
    })
  }

  return (
    <section aria-label="Outputs" className="flex flex-col gap-3">
      {task.previousReports.length > 0 && (
        <div className="rounded-group border border-line/70 bg-subtle/50 p-3.5">
          <h2 className="text-[12px] font-medium text-ink-faint">
            Previous outputs ({task.previousReports.length})
          </h2>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {task.previousReports.map((previous, index) => (
              <li
                key={previous.savedAt}
                className="flex items-center justify-between gap-2 text-xs text-ink-soft"
              >
                <span className="min-w-0 truncate">
                  Version {task.previousReports.length - index} ·{' '}
                  {previous.provenance === 'provider-generated'
                    ? 'provider-generated'
                    : 'simulated'}
                </span>
                <button
                  type="button"
                  aria-label={`Download previous output ${index + 1}`}
                  onClick={() =>
                    downloadText(
                      `uni-task-${slugifyTitle(task!.title)}-v${task.previousReports.length - index}.md`,
                      previous.markdown,
                    )
                  }
                  className="min-touch shrink-0 rounded-control p-1 text-ink-faint transition-colors hover:bg-raised hover:text-ink"
                >
                  <Download size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {task.report ? (
        <div className="rounded-group border border-line bg-raised p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[12px] font-medium text-ink-faint">
              {task.report.provenance === 'provider-generated'
                ? 'Output — provider-generated draft'
                : 'Output — ready for review'}
              {task.report.stoppedPartial && (
                <span className="ml-1 font-medium text-warning">(partial)</span>
              )}
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {editing ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEditing(false)
                      setDraft('')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      updateReport(taskId, draft)
                      setEditing(false)
                      showToast('Report updated')
                    }}
                  >
                    <Check size={13} />
                    Save
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDraft(task.report?.markdown ?? '')
                      setEditing(true)
                    }}
                  >
                    <PencilLine size={13} />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      downloadText(
                        `uni-task-${slugifyTitle(task.title)}.md`,
                        task.report!.markdown,
                      )
                      showToast('Task report downloaded as Markdown')
                    }}
                  >
                    <Download size={13} />
                    Download
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleSaveToLibrary}>
                    <FolderPlus size={13} />
                    {task.report.artifactId ? 'Update library copy' : 'Save to Library'}
                  </Button>
                </>
              )}
            </div>
          </div>
          {editing ? (
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={14}
              aria-label="Edit report markdown"
              className="mt-2.5 w-full resize-y rounded-[12px] border border-line bg-panel px-3 py-2.5 font-mono text-[12.5px] leading-relaxed text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
            />
          ) : (
            <div className="mt-2.5 max-h-[50dvh] overflow-y-auto rounded-[12px] bg-subtle/60 px-3.5 py-2.5">
              <Markdown content={task.report.markdown} />
            </div>
          )}
          <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
            {task.report.provenance === 'provider-generated'
              ? 'Provider-generated — verify before use; no external sources were retrieved.'
              : 'Example content — simulated output. Edits are saved locally and included in the download.'}
          </p>
        </div>
      ) : (
        <div className="rounded-group border border-line bg-raised px-3.5 py-6 text-center">
          <p className="text-xs text-ink-faint">
            No output yet — it appears here as soon as a run produces one.
          </p>
        </div>
      )}
    </section>
  )
}

