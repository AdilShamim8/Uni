import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Briefcase,
  Download,
  FileText,
  MoreHorizontal,
  Settings2,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { useWorkStore } from '@/state/workStore'
import { useAgentsStore } from '@/state/agentsStore'
import { useAppStore } from '@/state/store'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { StatusPill } from '@/components/ui/StatusPill'
import { HeaderExtras } from '@/components/layout/HeaderExtras'
import { PageToolbar } from '@/components/layout/PageToolbar'
import { MobileMenuButton } from '@/components/layout/MobileMenuButton'
import { downloadText, slugifyTitle } from '@/features/chat/exportUtils'
import { ThreadComposer } from '@/features/conversation/ThreadComposer'
import { TaskThread } from './TaskThread'
import { TASK_TEMPLATES, inferDeliverable } from './taskTemplates'
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
  taskMatchesFilter,
  type TaskFilter,
} from '@/domain/taskMachine'
import type { AiDraftModel, TaskDeliverable, WorkTaskMode } from '@/domain/workspaceTypes'

/* ------------------------------------------------------------------ */
/* Shared bits                                                         */
/* ------------------------------------------------------------------ */

function formatRelativeTime(timestamp: number): string {
  const delta = Date.now() - timestamp
  const minutes = Math.floor(delta / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(timestamp).toLocaleDateString()
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export function WorkPage() {
  const { taskId } = useParams()

  if (taskId === 'new') {
    return <NewTaskForm />
  }
  if (taskId) {
    return <TaskThread taskId={taskId} />
  }
  return <WorkHome />
}

/* ------------------------------------------------------------------ */
/* Work home — a goal composer plus recent and active work             */
/* ------------------------------------------------------------------ */

const FILTERS: { id: TaskFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'needs-input', label: 'Needs input' },
  { id: 'ready-for-review', label: 'Ready for review' },
  { id: 'completed', label: 'Completed' },
]

function WorkHome() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<TaskFilter>('all')
  const tasks = useWorkStore((state) => state.tasks)
  const agents = useAgentsStore((state) => state.agents)

  const ordered = useMemo(
    () => Object.values(tasks).sort((a, b) => b.updatedAt - a.updatedAt),
    [tasks],
  )
  const filtered = useMemo(
    () => ordered.filter((task) => taskMatchesFilter(task.status, filter)),
    [ordered, filter],
  )

  function startTask(goal: string, mode: WorkTaskMode, model: AiDraftModel | null) {
    const trimmed = goal.trim()
    if (!trimmed) return
    const createTask = useWorkStore.getState().createTask
    const title = trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed
    const id = createTask({
      title,
      goal: trimmed,
      deliverable: inferDeliverable(trimmed),
      mode,
      draftConfig:
        mode === 'ai-draft' && model
          ? { model, instructions: '', contextText: '' }
          : null,
    })
    // Demo tasks run immediately — that is the point of typing a goal.
    // AI-draft tasks wait for the explicit "Generate draft" in the thread.
    // The goal itself is the thread's opening message (projected), so the
    // acknowledgment is the only stored message at creation.
    if (mode === 'demo') {
      useWorkStore.getState().appendTaskMessage(id, {
        role: 'assistant',
        content:
          'Got it — starting a local demo run. Steps and the example output are simulated on this device; nothing is sent anywhere.',
        statusPrefix: 'Starting demo run',
        provenance: 'demo',
      })
      useWorkStore.getState().runTask(id)
    } else {
      useWorkStore.getState().appendTaskMessage(id, {
        role: 'assistant',
        content: `Task ready — generate the draft whenever you're ready. One live request to ${model?.modelLabel ?? 'the connected model'}; your key stays in this browser.`,
        statusPrefix: 'AI draft task',
      })
    }
    navigate(`/work/${id}`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageToolbar>
        <div className="lg:hidden">
          <MobileMenuButton />
        </div>
        <h1 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
          <Briefcase size={16} className="text-ink-faint" />
          Work
        </h1>
        <StatusPill label="Demo execution" tone="neutral" />
        <div className="flex-1" />
        <HeaderExtras />
      </PageToolbar>

      <div className="flex-1 overflow-y-auto welcome-wash">
        <div className="mx-auto w-full max-w-column px-3 py-8 sm:px-4">
          {/* Goal composer — typing an outcome starts a task, no form. */}
          <h2 className="text-center text-[28px] font-semibold tracking-tight text-ink sm:text-[32px]">
            What needs doing?
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-center text-sm leading-relaxed text-ink-soft">
            Describe an outcome. Uni starts a task you can run as a local demo or draft with a
            connected model — then refine it by messaging the thread.
          </p>
          <div className="mt-5">
            <GoalComposer onSend={startTask} />
          </div>

          {/* Expanded brief — for precise setup, never a required step. */}
          <p className="mt-3 text-center text-xs text-ink-faint">
            Need precise setup?{' '}
            <button
              type="button"
              onClick={() => navigate('/work/new')}
              className="inline-flex min-touch items-center font-medium text-accent transition-colors hover:text-accent-strong"
            >
              Use the expanded brief
            </button>
          </p>

          {/* Recent & active work */}
          <div className="mt-10 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[15px] font-semibold tracking-tight text-ink">
              {ordered.length === 0 ? 'Your tasks will appear here' : 'Recent work'}
            </h3>
          </div>

          {ordered.length > 0 && (
            <div
              role="tablist"
              aria-label="Filter tasks"
              className="mt-3 flex flex-wrap gap-1.5"
            >
              {FILTERS.map((entry) => {
                const active = filter === entry.id
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setFilter(entry.id)}
                    className={`min-touch shrink-0 rounded-full border px-3 py-1 text-[13px] transition-colors ${
                      active
                        ? 'border-accent bg-accent-soft font-medium text-accent'
                        : 'border-line text-ink-soft hover:bg-subtle'
                    }`}
                  >
                    {entry.label}
                  </button>
                )
              })}
            </div>
          )}

          {ordered.length === 0 ? (
            <ul className="mt-3 grid gap-2 sm:grid-cols-3" aria-label="Task examples">
              {TASK_TEMPLATES.map((template) => (
                <li key={template.id}>
                  <div className="flex h-full flex-col gap-1.5 rounded-group border border-line bg-raised p-3.5">
                    <span className="flex items-center gap-2 text-ink">
                      <span className="text-accent">{template.icon}</span>
                      <span className="text-sm font-medium">{template.label}</span>
                    </span>
                    <span className="text-xs leading-relaxed text-ink-soft">{template.blurb}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : filtered.length === 0 ? (
            <div className="mt-3 rounded-group border border-line bg-raised px-6 py-8 text-center">
              <p className="text-sm font-medium text-ink">No tasks in this view</p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-soft">
                Try a different filter, or describe a new outcome above.
              </p>
            </div>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {filtered.map((task) => {
                const agent = task.agentId ? agents[task.agentId] : null
                return (
                  <li key={task.id}>
                    <div className="group flex items-stretch rounded-group border border-line bg-raised transition-colors hover:bg-subtle">
                      <button
                        type="button"
                        onClick={() => navigate(`/work/${task.id}`)}
                        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">
                            {task.title}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-ink-faint">
                            {agent ? `${agent.name} · ` : ''}
                            {TASK_TEMPLATES.find((t) => t.id === task.deliverable)?.label ??
                              task.deliverable}
                            {' · '}
                            {formatRelativeTime(task.updatedAt)}
                          </span>
                        </span>
                        <StatusPill
                          label={TASK_STATUS_LABELS[task.status]}
                          tone={TASK_STATUS_TONES[task.status]}
                          dot={task.status === 'running'}
                        />
                      </button>
                      <TaskRowMenu taskId={task.id} />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Goal composer with an execution-mode selector                       */
/* ------------------------------------------------------------------ */

function GoalComposer({
  onSend,
}: {
  onSend: (goal: string, mode: WorkTaskMode, model: AiDraftModel | null) => void
}) {
  const providers = useAppStore((state) => state.providers)
  const credentials = useAppStore((state) => state.credentials)
  const setUi = useAppStore((state) => state.setUi)
  const [mode, setMode] = useState<WorkTaskMode>('demo')
  const [modelKey, setModelKey] = useState('')

  const connectedModels = useMemo(() => {
    const options: AiDraftModel[] = []
    for (const provider of providers) {
      const credential = credentials[provider.id]
      if (credential?.status !== 'connected') continue
      for (const model of provider.models) {
        options.push({
          providerId: provider.id,
          modelId: model.id,
          providerLabel: provider.label,
          modelLabel: model.label,
        })
      }
    }
    return options
  }, [providers, credentials])

  const selected =
    connectedModels.find((entry) => `${entry.providerId}:${entry.modelId}` === modelKey) ??
    connectedModels[0] ??
    null

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5" role="radiogroup" aria-label="Execution mode">
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'demo'}
          onClick={() => setMode('demo')}
          className={`min-touch rounded-full border px-3.5 py-1.5 text-[13px] transition-colors ${
            mode === 'demo'
              ? 'border-accent bg-accent-soft font-medium text-accent'
              : 'border-line bg-raised text-ink-soft hover:bg-subtle'
          }`}
        >
          Demo
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={mode === 'ai-draft'}
          onClick={() => setMode('ai-draft')}
          disabled={connectedModels.length === 0}
          title={
            connectedModels.length === 0
              ? 'Connect a provider in Settings to draft with a live model'
              : undefined
          }
          className={`min-touch rounded-full border px-3.5 py-1.5 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            mode === 'ai-draft'
              ? 'border-accent bg-accent-soft font-medium text-accent'
              : 'border-line bg-raised text-ink-soft hover:bg-subtle'
          }`}
        >
          AI draft
        </button>
        {mode === 'ai-draft' && connectedModels.length > 0 && (
          <select
            aria-label="Draft model"
            value={selected ? `${selected.providerId}:${selected.modelId}` : ''}
            onChange={(event) => setModelKey(event.target.value)}
            className="min-touch max-w-[14rem] rounded-full border border-line bg-raised px-3 py-1.5 text-[13px] text-ink focus:border-accent focus:outline-none"
          >
            {connectedModels.map((model) => (
              <option key={`${model.providerId}:${model.modelId}`} value={`${model.providerId}:${model.modelId}`}>
                {model.modelLabel}
              </option>
            ))}
          </select>
        )}
        {mode === 'ai-draft' && connectedModels.length === 0 && (
          <button
            type="button"
            onClick={() => setUi({ settingsOpen: true, settingsSection: 'providers' })}
            className="min-touch rounded-full px-2 py-1.5 text-[13px] font-medium text-accent transition-colors hover:text-accent-strong"
          >
            Connect a provider
          </button>
        )}
      </div>
      <ThreadComposer
        draftKey="work:new"
        textareaId="work-goal-composer"
        ariaLabel="Describe an outcome"
        placeholder="e.g. Draft a launch update from these notes…"
        statusLabel={
          mode === 'ai-draft' && selected
            ? `AI draft with ${selected.modelLabel} — the send button creates the task; the live request happens only when you press “Generate draft”.`
            : 'Demo execution — sending starts a local run with simulated steps and an example output.'
        }
        onSend={(goal) => onSend(goal, mode, selected)}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Task row menu                                                       */
/* ------------------------------------------------------------------ */

function TaskRowMenu({ taskId }: { taskId: string }) {
  const navigate = useNavigate()
  const deleteTask = useWorkStore((state) => state.deleteTask)
  const task = useWorkStore((state) => state.tasks[taskId])
  const showToast = useAppStore((state) => state.showToast)
  if (!task) return null

  function handleDownload() {
    if (!task.report) return
    downloadText(`uni-task-${slugifyTitle(task.title)}.md`, task.report.markdown)
    showToast('Task report downloaded as Markdown')
  }

  return (
    <div className="flex items-center pr-1.5">
      <Menu
        label="Task actions"
        trigger={
          <button
            type="button"
            aria-label={`Actions for ${task.title}`}
            className="min-touch rounded-control p-1.5 text-ink-faint transition-colors hover:bg-[var(--c-hover-wash)] hover:text-ink"
          >
            <MoreHorizontal size={16} />
          </button>
        }
      >
        <MenuItem icon={<FileText size={15} />} onClick={() => navigate(`/work/${taskId}`)}>
          Open
        </MenuItem>
        {task.report && (
          <MenuItem icon={<Download size={15} />} onClick={handleDownload}>
            Download report
          </MenuItem>
        )}
        <MenuItem
          icon={<Trash2 size={15} />}
          danger
          onClick={() => {
            deleteTask(taskId)
            showToast('Task deleted')
          }}
        >
          Delete
        </MenuItem>
      </Menu>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Expanded brief — precise setup, also edits existing draft tasks     */
/* ------------------------------------------------------------------ */

function NewTaskForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const createTask = useWorkStore((state) => state.createTask)
  const agents = useAgentsStore((state) => state.agents)
  const providers = useAppStore((state) => state.providers)
  const credentials = useAppStore((state) => state.credentials)
  const setUi = useAppStore((state) => state.setUi)

  // Editing an existing (draft) task arrives as ?edit=<taskId>.
  const editId = searchParams.get('edit')
  const editingTask = editId ? useWorkStore.getState().tasks[editId] : undefined

  const [title, setTitle] = useState(editingTask?.title ?? '')
  const [goal, setGoal] = useState(editingTask?.goal ?? '')
  const [mode, setMode] = useState<WorkTaskMode>(editingTask?.mode ?? 'demo')
  const [modelKey, setModelKey] = useState<string>(
    editingTask?.draftConfig
      ? `${editingTask.draftConfig.model.providerId}:${editingTask.draftConfig.model.modelId}`
      : '',
  )
  const [instructions, setInstructions] = useState(editingTask?.draftConfig?.instructions ?? '')
  const [contextText, setContextText] = useState(editingTask?.draftConfig?.contextText ?? '')
  const [deliverable, setDeliverable] = useState<TaskDeliverable>(
    editingTask?.deliverable ??
      (() => {
        const requested = searchParams.get('template') as TaskDeliverable | null
        return TASK_TEMPLATES.some((t) => t.id === requested)
          ? (requested as TaskDeliverable)
          : 'research-report'
      })(),
  )
  // Preselect an agent when arriving via “Assign task” on a profile.
  const [agentId, setAgentId] = useState<string | null>(
    editingTask?.agentId ??
      (() => {
        const requested = searchParams.get('agent')
        return requested && useAgentsStore.getState().agents[requested] ? requested : null
      })(),
  )
  const [error, setError] = useState<string | null>(null)

  const activeAgents = useMemo(
    () =>
      Object.values(agents)
        .filter((agent) => !agent.archived)
        .sort((a, b) => a.createdAt - b.createdAt),
    [agents],
  )

  /** Only models on providers with a connected key can be selected. */
  const connectedModels = useMemo(() => {
    const options: AiDraftModel[] = []
    for (const provider of providers) {
      const credential = credentials[provider.id]
      if (credential?.status !== 'connected') continue
      for (const model of provider.models) {
        options.push({
          providerId: provider.id,
          modelId: model.id,
          providerLabel: provider.label,
          modelLabel: model.label,
        })
      }
    }
    return options
  }, [providers, credentials])

  // Keep a valid selection as connections change (or when switching into
  // AI-draft mode): default to the first connected model.
  useEffect(() => {
    if (mode !== 'ai-draft') return
    if (modelKey && connectedModels.some((m) => `${m.providerId}:${m.modelId}` === modelKey)) {
      return
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- guards a store-derived selection against connection changes; the early-return shape keeps the invariant readable
    setModelKey(connectedModels[0] ? `${connectedModels[0].providerId}:${connectedModels[0].modelId}` : '')
  }, [mode, modelKey, connectedModels])

  function handleCreate() {
    const trimmed = title.trim()
    if (!trimmed) {
      setError('Give the task a title first.')
      return
    }
    if (mode === 'ai-draft' && !modelKey) {
      setError('Connect a provider in Settings first — AI drafts need a connected model.')
      return
    }
    const selected = connectedModels.find((m) => `${m.providerId}:${m.modelId}` === modelKey)
    if (editingTask) {
      useWorkStore.getState().updateTask(editingTask.id, {
        title: trimmed,
        goal: goal.trim(),
        deliverable,
        agentId,
      })
      if (mode === 'ai-draft' && selected && editingTask.status === 'draft') {
        useWorkStore.getState().updateDraftConfig(editingTask.id, {
          model: selected,
          instructions: instructions.trim(),
          contextText: contextText.trim(),
        })
      }
      navigate(`/work/${editingTask.id}`)
      return
    }
    const id = createTask({
      title: trimmed,
      goal: goal.trim(),
      deliverable,
      agentId,
      mode,
      draftConfig:
        mode === 'ai-draft' && selected
          ? {
              model: selected,
              instructions: instructions.trim(),
              contextText: contextText.trim(),
            }
          : null,
    })
    navigate(`/work/${id}`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageToolbar>
        <button
          type="button"
          onClick={() => navigate('/work')}
          className="min-touch -ml-1 flex items-center gap-1 rounded-control px-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <Settings2 size={15} className="rotate-180" aria-hidden="true" />
          Work
        </button>
        <h1 className="text-[15px] font-semibold tracking-tight text-ink">
          {editingTask ? 'Edit task' : 'Expanded brief'}
        </h1>
      </PageToolbar>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-column px-3 py-6 sm:px-4">
          <div className="flex flex-col gap-4 rounded-group border border-line bg-raised p-4 sm:p-5">
            <div>
              <TextField
                label="Title"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value)
                  setError(null)
                }}
                placeholder="e.g. Compare two routers for the new apartment"
              />
              {error && (
                <p role="alert" className="mt-1 text-xs text-danger">
                  {error}
                </p>
              )}
            </div>
            <TextField
              label="Goal"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="What outcome do you want completed?"
            />

            {/* Execution mode — Demo stays an explicit alternative; the
                AI draft is a single live BYOK request, never autonomous. */}
            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-ink">Execution</legend>
              <div role="radiogroup" aria-label="Execution mode" className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === 'demo'}
                  onClick={() => setMode('demo')}
                  className={`min-touch rounded-control border p-3 text-left transition-colors ${
                    mode === 'demo'
                      ? 'border-accent bg-accent-soft'
                      : 'border-line bg-raised hover:bg-subtle'
                  }`}
                >
                  <span className="block text-sm font-medium text-ink">Demo</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
                    Simulated steps and example output — local, no key, free.
                  </span>
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === 'ai-draft'}
                  onClick={() => setMode('ai-draft')}
                  className={`min-touch rounded-control border p-3 text-left transition-colors ${
                    mode === 'ai-draft'
                      ? 'border-accent bg-accent-soft'
                      : 'border-line bg-raised hover:bg-subtle'
                  }`}
                >
                  <span className="block text-sm font-medium text-ink">AI draft</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
                    One live drafting request to a connected model you pick.
                  </span>
                </button>
              </div>
            </fieldset>

            {mode === 'ai-draft' && (
              <div className="flex flex-col gap-3.5 rounded-[12px] border border-accent/30 bg-accent-soft/40 p-3.5">
                <div>
                  <label htmlFor="draft-model" className="mb-1.5 block text-sm font-medium text-ink">
                    Connected model
                  </label>
                  {connectedModels.length === 0 ? (
                    <p className="text-sm leading-relaxed text-ink-soft">
                      No provider is connected yet.{' '}
                      <button
                        type="button"
                        onClick={() => setUi({ settingsOpen: true, settingsSection: 'providers' })}
                        className="inline-flex min-touch items-center font-medium text-accent hover:text-accent-strong"
                      >
                        Connect one in Settings
                      </button>{' '}
                      — the draft request uses your own key, straight from this browser.
                    </p>
                  ) : (
                    <select
                      id="draft-model"
                      value={modelKey}
                      onChange={(event) => setModelKey(event.target.value)}
                      className="min-touch w-full rounded-control border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
                    >
                      {connectedModels.map((model) => (
                        <option key={`${model.providerId}:${model.modelId}`} value={`${model.providerId}:${model.modelId}`}>
                          {model.modelLabel} — {model.providerLabel}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label htmlFor="draft-instructions" className="mb-1.5 block text-sm font-medium text-ink">
                    Additional instructions{' '}
                    <span className="font-normal text-ink-faint">(optional)</span>
                  </label>
                  <textarea
                    id="draft-instructions"
                    value={instructions}
                    onChange={(event) => setInstructions(event.target.value)}
                    rows={3}
                    placeholder="Tone, length, structure — anything beyond the goal."
                    className="w-full resize-y rounded-control border border-line bg-panel px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
                  />
                </div>

                <div>
                  <label htmlFor="draft-context" className="mb-1.5 block text-sm font-medium text-ink">
                    Context to include <span className="font-normal text-ink-faint">(optional)</span>
                  </label>
                  <textarea
                    id="draft-context"
                    value={contextText}
                    onChange={(event) => setContextText(event.target.value)}
                    rows={4}
                    placeholder="Paste the exact text the model should work from. Only what you put here is sent."
                    className="w-full resize-y rounded-control border border-line bg-panel px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
                  />
                  <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">
                    Explicitly selected context only — no files, history, or browsing are attached
                    automatically.
                  </p>
                </div>

                <p className="text-xs leading-relaxed text-ink-soft">
                  <strong className="font-medium text-ink">Live request:</strong> generating sends
                  the goal, instructions, and selected context to the provider behind the chosen
                  model. The provider may charge for this request — nothing is sent until you
                  explicitly press “Generate draft”.
                </p>
              </div>
            )}

            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-ink">Deliverable</legend>
              <div className="flex flex-wrap gap-2">
                {TASK_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setDeliverable(template.id)}
                    aria-pressed={deliverable === template.id}
                    className={`min-touch flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                      deliverable === template.id
                        ? 'border-accent bg-accent-soft font-medium text-accent'
                        : 'border-line text-ink hover:bg-subtle'
                    }`}
                  >
                    <span aria-hidden="true" className="hidden sm:inline">
                      {template.icon}
                    </span>
                    {template.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-ink">Agent (optional)</legend>
              <select
                aria-label="Agent"
                value={agentId ?? ''}
                onChange={(event) => setAgentId(event.target.value || null)}
                className="min-touch w-full rounded-control border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
              >
                <option value="">No agent — run with default instructions</option>
                {activeAgents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                    {agent.category === 'personal' ? ' (personal assistant)' : ''}
                  </option>
                ))}
              </select>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">
                {mode === 'demo'
                  ? 'The agent’s instructions are attached to this task’s demo run. Nothing is sent anywhere — execution stays local.'
                  : 'The agent’s instructions are included in the drafting request when you generate it.'}
              </p>
            </fieldset>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => navigate('/work')}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreate}>
                <Sparkles size={15} />
                {editingTask ? 'Save changes' : 'Create task'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
