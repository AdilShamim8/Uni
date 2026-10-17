import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Briefcase,
  Check,
  ChevronDown,
  ClipboardList,
  Download,
  FileText,
  FolderPlus,
  MessageSquareWarning,
  MoreHorizontal,
  PencilLine,
  Play,
  Plus,
  RotateCcw,
  Square,
  Telescope,
  Trash2,
  Undo2,
} from 'lucide-react'
import { useWorkStore } from '@/state/workStore'
import { useAgentsStore } from '@/state/agentsStore'
import { useLibraryStore } from '@/state/libraryStore'
import { useAppStore } from '@/state/store'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { StatusPill } from '@/components/ui/StatusPill'
import { Markdown } from '@/features/chat/Markdown'
import { downloadText, slugifyTitle } from '@/features/chat/exportUtils'
import { TASK_TEMPLATES } from './taskTemplates'
import {
  TASK_STATUS_LABELS,
  TASK_STATUS_TONES,
  taskMatchesFilter,
  type TaskFilter,
} from '@/domain/taskMachine'
import type { TaskDeliverable, WorkTask } from '@/domain/workspaceTypes'

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

function formatClock(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

/* ------------------------------------------------------------------ */
/* Work home                                                           */
/* ------------------------------------------------------------------ */

const FILTERS: { id: TaskFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'needs-input', label: 'Needs input' },
  { id: 'ready-for-review', label: 'Ready for review' },
  { id: 'completed', label: 'Completed' },
]

export function WorkPage() {
  const { taskId } = useParams()

  if (taskId === 'new') {
    return <NewTaskForm />
  }
  if (taskId) {
    return <TaskWorkspace taskId={taskId} />
  }
  return <WorkHome />
}

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

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="material safe-left safe-right sticky top-0 z-30 flex h-13 shrink-0 items-center gap-2 border-b border-line bg-mat-header px-2 sm:px-4">
        <h1 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Briefcase size={16} className="text-ink-faint" />
          Work
        </h1>
        <StatusPill label="Demo execution" tone="neutral" />
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-column px-3 py-6 sm:px-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-ink">Tasks</h2>
              <p className="mt-0.5 text-sm text-ink-soft">
                Describe an outcome, run it as a local demo, review the output.
              </p>
            </div>
            <Button variant="primary" onClick={() => navigate('/work/new')}>
              <Plus size={16} />
              New task
            </Button>
          </div>

          {/* Starter templates */}
          <ul className="mt-5 grid gap-2 sm:grid-cols-3" aria-label="Task templates">
            {TASK_TEMPLATES.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/work/new?template=${template.id}`)}
                  className="flex h-full w-full flex-col gap-1.5 rounded-group border border-line bg-raised p-3.5 text-left transition-colors hover:bg-subtle"
                >
                  <span className="flex items-center gap-2 text-ink">
                    <span className="text-accent">{template.icon}</span>
                    <span className="text-sm font-medium">{template.label}</span>
                  </span>
                  <span className="text-xs leading-relaxed text-ink-soft">{template.blurb}</span>
                  <span className="mt-auto pt-1 text-[11px] text-ink-faint">
                    Local simulation — no key needed
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {/* Filters */}
          <div
            role="tablist"
            aria-label="Filter tasks"
            className="mt-6 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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

          {/* Task list */}
          {filtered.length === 0 ? (
            <div className="mt-4 rounded-group border border-line bg-raised px-6 py-10 text-center">
              <Briefcase size={28} className="mx-auto text-ink-faint" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-ink">
                {ordered.length === 0 ? 'No tasks yet' : 'No tasks in this view'}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-soft">
                {ordered.length === 0
                  ? 'Start from a template above — the run and its output stay on this device.'
                  : 'Try a different filter, or create a new task.'}
              </p>
            </div>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
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

function TaskRowMenu({ taskId }: { taskId: string }) {
  const navigate = useNavigate()
  const deleteTask = useWorkStore((state) => state.deleteTask)
  const task = useWorkStore((state) => state.tasks[taskId])
  const showToast = useAppStore((state) => state.showToast)
  if (!task) return null

  function handleDownload() {
    if (!task.report) return
    downloadText(`universe-task-${slugifyTitle(task.title)}.md`, task.report.markdown)
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
/* New task brief                                                      */
/* ------------------------------------------------------------------ */

function NewTaskForm() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const createTask = useWorkStore((state) => state.createTask)
  const agents = useAgentsStore((state) => state.agents)

  const [title, setTitle] = useState('')
  const [goal, setGoal] = useState('')
  const [deliverable, setDeliverable] = useState<TaskDeliverable>(
    () => {
      const requested = searchParams.get('template') as TaskDeliverable | null
      return TASK_TEMPLATES.some((t) => t.id === requested) ? (requested as TaskDeliverable) : 'research-report'
    },
  )
  // Preselect an agent when arriving via “Assign task” on a profile.
  const [agentId, setAgentId] = useState<string | null>(() => {
    const requested = searchParams.get('agent')
    return requested && useAgentsStore.getState().agents[requested] ? requested : null
  })
  const [error, setError] = useState<string | null>(null)

  const activeAgents = useMemo(
    () =>
      Object.values(agents)
        .filter((agent) => !agent.archived)
        .sort((a, b) => a.createdAt - b.createdAt),
    [agents],
  )

  function handleCreate() {
    const trimmed = title.trim()
    if (!trimmed) {
      setError('Give the task a title first.')
      return
    }
    const id = createTask({ title: trimmed, goal: goal.trim(), deliverable, agentId })
    navigate(`/work/${id}`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="material safe-left safe-right sticky top-0 z-30 flex h-13 shrink-0 items-center gap-2 border-b border-line bg-mat-header px-2 sm:px-4">
        <button
          type="button"
          onClick={() => navigate('/work')}
          className="min-touch -ml-1 flex items-center gap-1 rounded-control px-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronDown size={15} className="rotate-90" aria-hidden="true" />
          Work
        </button>
        <h1 className="text-sm font-semibold text-ink">New task</h1>
      </header>

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
                The agent’s instructions are attached to this task’s demo run. Nothing is
                sent anywhere — execution stays local.
              </p>
            </fieldset>

            <div className="rounded-[12px] bg-subtle px-3.5 py-2.5">
              <p className="text-xs leading-relaxed text-ink-soft">
                <strong className="font-medium text-ink">Demo execution:</strong> steps,
                tool activity, and the example report are simulated on this device. No
                provider is contacted and no API key is required. You can edit and
                download the output.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => navigate('/work')}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleCreate}>
                Create task
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Task workspace                                                      */
/* ------------------------------------------------------------------ */

type WorkspaceTab = 'overview' | 'activity' | 'outputs'

function TaskWorkspace({ taskId }: { taskId: string }) {
  const navigate = useNavigate()
  const task = useWorkStore((state) => state.tasks[taskId])
  const hydrated = useWorkStore((state) => state.hydrated)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [tab, setTab] = useState<WorkspaceTab>('overview')

  // Unknown or deleted id → recover to the Work home — but only after
  // hydration, or a direct load would redirect before tasks exist
  // (audit R3).
  useEffect(() => {
    if (!hydrated) return
    if (!task) navigate('/work', { replace: true })
  }, [task, hydrated, navigate])

  if (!task) return null

  const tabs: { id: WorkspaceTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'activity', label: 'Activity' },
    { id: 'outputs', label: 'Outputs' },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="material safe-left safe-right sticky top-0 z-30 flex h-13 shrink-0 items-center gap-2 border-b border-line bg-mat-header px-2 sm:px-4">
        <button
          type="button"
          onClick={() => navigate('/work')}
          aria-label="Back to Work"
          className="min-touch -ml-1 rounded-control p-1.5 text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronDown size={16} className="rotate-90" aria-hidden="true" />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{task.title}</h1>
        <StatusPill
          label={TASK_STATUS_LABELS[task.status]}
          tone={TASK_STATUS_TONES[task.status]}
          dot={task.status === 'running'}
        />
        <StatusPill label="Demo" tone="neutral" />
        <WorkspaceMenu taskId={taskId} onDelete={() => setDeleteOpen(true)} />
      </header>

      {/* Mobile tabs */}
      <div className="flex gap-1 border-b border-line px-2 py-1.5 lg:hidden" role="tablist" aria-label="Task sections">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={`min-touch flex-1 rounded-control px-2 py-1 text-[13px] font-medium transition-colors ${
              tab === entry.id ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-subtle'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Main column — brief, run state, and outputs. On mobile each
            section lands in its tab; on desktop everything shows at once. */}
        <div
          className={`min-h-0 flex-1 overflow-y-auto ${
            tab === 'activity' ? 'hidden lg:block' : ''
          }`}
        >
          <div className="mx-auto w-full max-w-column px-3 py-5 sm:px-4">
            <div className={tab === 'outputs' ? 'hidden lg:block' : ''}>
              <BriefSection taskId={taskId} />
            </div>
            <RunSection taskId={taskId} />
            <div className={tab === 'overview' ? 'hidden lg:block' : ''}>
              <ReportSection taskId={taskId} />
            </div>
          </div>
        </div>

        {/* Activity panel — desktop right column, mobile tab */}
        <aside
          className={`min-h-0 w-[19rem] shrink-0 overflow-y-auto border-l border-line bg-mat-sidebar/60 ${
            tab === 'activity' ? '' : 'hidden lg:block'
          }`}
          aria-label="Activity"
        >
          <div className="px-3 py-4">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Activity
            </p>
            <ActivityTimeline task={task} />
          </div>
        </aside>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete task?"
        body={`“${task.title}” and its activity log will be removed from this device. This cannot be undone.`}
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

function WorkspaceMenu({ taskId, onDelete }: { taskId: string; onDelete: () => void }) {
  const task = useWorkStore((state) => state.tasks[taskId])
  const showToast = useAppStore((state) => state.showToast)
  if (!task) return null

  function handleDownload() {
    if (!task.report) return
    downloadText(`universe-task-${slugifyTitle(task.title)}.md`, task.report.markdown)
    showToast('Task report downloaded as Markdown')
  }

  return (
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
        <MenuItem icon={<Download size={15} />} onClick={handleDownload}>
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
      <MenuItem icon={<Trash2 size={15} />} danger onClick={onDelete}>
        Delete
      </MenuItem>
    </Menu>
  )
}

/* ------------------------------------------------------------------ */
/* Brief                                                               */
/* ------------------------------------------------------------------ */

function BriefSection({ taskId }: { taskId: string }) {
  const task = useWorkStore((state) => state.tasks[taskId])
  const agents = useAgentsStore((state) => state.agents)
  const updateTask = useWorkStore((state) => state.updateTask)
  const [editing, setEditing] = useState(false)
  const [draftGoal, setDraftGoal] = useState('')
  if (!task) return null

  const agent = task.agentId ? agents[task.agentId] : null
  const template = TASK_TEMPLATES.find((t) => t.id === task.deliverable)
  const editable = task.status === 'draft'

  return (
    <section
      aria-label="Task brief"
      className="rounded-group border border-line bg-raised p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Brief
        </h2>
        {editable && !editing && (
          <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
            <PencilLine size={14} />
            Edit
          </Button>
        )}
      </div>

      {editing ? (
        <div className="mt-3 flex flex-col gap-3">
          <TextField
            label="Goal"
            value={draftGoal}
            onChange={(event) => setDraftGoal(event.target.value)}
            placeholder="What outcome do you want?"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditing(false)
                setDraftGoal('')
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                updateTask(taskId, { goal: draftGoal.trim() })
                setEditing(false)
              }}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-2.5">
          <p className="text-[15px] leading-relaxed text-ink">
            {task.goal || <span className="text-ink-faint">No goal described.</span>}
          </p>
          <dl className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-ink-soft">
            <div className="flex items-center gap-1.5">
              <dt className="text-ink-faint">Deliverable</dt>
              <dd className="font-medium text-ink">{template?.label ?? task.deliverable}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="text-ink-faint">Agent</dt>
              <dd className="font-medium text-ink">
                {agent ? agent.name : 'None'}
              </dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dt className="text-ink-faint">Mode</dt>
              <dd className="font-medium text-ink">Local demo</dd>
            </div>
          </dl>
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Run controls + input requests                                       */
/* ------------------------------------------------------------------ */

function RunSection({ taskId }: { taskId: string }) {
  const task = useWorkStore((state) => state.tasks[taskId])
  if (!task) return null
  const store = useWorkStore.getState()

  return (
    <section aria-label="Execution" className="mt-4">
      {task.status === 'needs_input' && task.inputRequest && (
        <div className="rounded-group border border-warning/40 bg-warning-soft p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-warning">
            <MessageSquareWarning size={16} aria-hidden="true" />
            The run needs your answer
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink">{task.inputRequest.question}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {task.inputRequest.options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => store.answerInput(taskId, option)}
                className="min-touch rounded-full border border-line bg-raised px-3.5 py-1.5 text-sm text-ink transition-colors hover:bg-subtle"
              >
                {option}
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-xs text-ink-faint">
            Answering continues the simulated run — nothing is sent anywhere.
          </p>
        </div>
      )}

      {task.status === 'draft' && (
        <div className="rounded-group border border-line bg-raised p-4">
          <p className="text-sm leading-relaxed text-ink-soft">
            This task has not run yet. Start a <strong className="font-medium text-ink">demo
            run</strong> to watch the plan, tool activity, and example output being
            produced locally.
          </p>
          <div className="mt-3">
            <Button variant="primary" onClick={() => store.runTask(taskId)}>
              <Play size={15} />
              Run demo
            </Button>
          </div>
        </div>
      )}

      {(task.status === 'running' || task.status === 'queued') && (
        <div className="rounded-group border border-line bg-raised p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <span
              className="h-2 w-2 animate-pulse rounded-full bg-accent"
              aria-hidden="true"
            />
            Running (demo)…
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            Steps and results are simulated on this device.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => store.pauseTask(taskId)}>
              <Square size={14} />
              Pause
            </Button>
            <Button variant="ghost" onClick={() => store.cancelTask(taskId)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {task.status === 'paused' && (
        <div className="rounded-group border border-line bg-raised p-4">
          <p className="text-sm font-medium text-ink">Paused</p>
          {task.interrupted && (
            <p className="mt-1 text-xs leading-relaxed text-warning">
              This run was interrupted by a reload — the app does not keep working while
              closed. Resume to continue from where it stopped.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Button variant="primary" onClick={() => store.resumeTask(taskId)}>
              <Play size={14} />
              Resume
            </Button>
            <Button variant="ghost" onClick={() => store.cancelTask(taskId)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {task.status === 'cancelled' && (
        <div className="rounded-group border border-line bg-raised p-4">
          <p className="text-sm font-medium text-ink">Cancelled</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            Late events from the cancelled run are rejected. Reopen the task as a draft
            to plan it again.
          </p>
          <div className="mt-3">
            <Button variant="secondary" onClick={() => store.reopenTask(taskId)}>
              <Undo2 size={14} />
              Reopen as draft
            </Button>
          </div>
        </div>
      )}

      {task.status === 'failed' && (
        <div className="rounded-group border border-danger/40 bg-danger-soft p-4">
          <p className="text-sm font-medium text-danger">Failed</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            The demo run failed. Retry from the beginning, or reopen as a draft.
          </p>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" onClick={() => store.retryTask(taskId)}>
              <RotateCcw size={14} />
              Retry
            </Button>
            <Button variant="ghost" onClick={() => store.reopenTask(taskId)}>
              Reopen as draft
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Report / outputs                                                    */
/* ------------------------------------------------------------------ */

function ReportSection({ taskId }: { taskId: string }) {
  const navigate = useNavigate()
  const task = useWorkStore((state) => state.tasks[taskId])
  const updateReport = useWorkStore((state) => state.updateReport)
  const attachArtifactToReport = useWorkStore((state) => state.attachArtifactToReport)
  const completeTask = useWorkStore((state) => state.completeTask)
  const showToast = useAppStore((state) => state.showToast)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  if (!task?.report) return null

  function handleDownload() {
    // The download always matches the CURRENT (possibly edited) report.
    downloadText(`universe-task-${slugifyTitle(task!.title)}.md`, task!.report!.markdown)
    showToast('Task report downloaded as Markdown')
  }

  /** Save the current report content into the shared Library. */
  function handleSaveToLibrary() {
    const report = task!.report!
    const library = useLibraryStore.getState()
    const kind =
      report.template === 'email' ? 'email' : report.template === 'data' ? 'data' : 'report'
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
      provenance: 'demo-simulation',
    })
    attachArtifactToReport(taskId, artifactId)
    showToast('Saved to Library', {
      actionLabel: 'Open',
      onAction: () => navigate('/library'),
    })
  }

  return (
    <section
      aria-label="Output report"
      className="mt-4 rounded-group border border-line bg-raised p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Output — ready for review
        </h2>
        <div className="flex gap-2">
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
                <Check size={14} />
                Save changes
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
                <PencilLine size={14} />
                Edit
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDownload}>
                <Download size={14} />
                Download
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSaveToLibrary}>
                <FolderPlus size={14} />
                {task.report.artifactId ? 'Update library copy' : 'Save to Library'}
              </Button>
              {task.status === 'ready_for_review' && (
                <Button variant="primary" size="sm" onClick={() => completeTask(taskId)}>
                  <Check size={14} />
                  Mark complete
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={16}
          aria-label="Edit report markdown"
          className="mt-3 w-full resize-y rounded-[12px] border border-line bg-panel px-3.5 py-3 font-mono text-[13px] leading-relaxed text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
        />
      ) : (
        <div className="mt-3 rounded-[12px] bg-subtle/60 px-4 py-3">
          <Markdown content={task.report.markdown} />
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-ink-faint">
        Example content — simulated output. Edits are saved locally and included in the
        download; they never claim an external action was performed.
      </p>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Activity timeline                                                   */
/* ------------------------------------------------------------------ */

const EVENT_ICONS: Record<string, React.ReactNode> = {
  created: <ClipboardList size={13} />,
  status: <Check size={13} />,
  plan: <ClipboardList size={13} />,
  tool: <Telescope size={13} />,
  info: <FileText size={13} />,
  input_request: <MessageSquareWarning size={13} />,
  input_response: <Check size={13} />,
  output: <FileText size={13} />,
  note: <FileText size={13} />,
}

function ActivityTimeline({ task }: { task: WorkTask }) {
  const events = useMemo(
    () => [...task.events].sort((a, b) => a.at - b.at),
    [task.events],
  )

  return (
    <ol className="mt-2 flex flex-col">
      {events.map((event, index) => (
        <li key={event.id} className="flex gap-2.5">
          <div className="flex flex-col items-center">
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                event.kind === 'input_request'
                  ? 'bg-warning-soft text-warning'
                  : event.kind === 'input_response' || event.kind === 'output'
                    ? 'bg-success-soft text-success'
                    : 'bg-subtle text-ink-faint'
              }`}
            >
              {EVENT_ICONS[event.kind] ?? <FileText size={13} />}
            </span>
            {index < events.length - 1 && (
              <span aria-hidden="true" className="w-px flex-1 bg-line" />
            )}
          </div>
          <div className="min-w-0 flex-1 pb-4">
            <p className="text-[13px] leading-snug text-ink">{event.label}</p>
            {event.detail && (
              <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">{event.detail}</p>
            )}
            <p className="mt-0.5 text-[11px] text-ink-faint/80">{formatClock(event.at)}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
