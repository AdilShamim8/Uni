import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Briefcase, Plus } from 'lucide-react'
import { useWorkStore } from '@/state/workStore'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { TASK_STATUS_LABELS, TASK_STATUS_TONES } from '@/domain/taskMachine'
import { StatusPill } from '@/components/ui/StatusPill'
import type { TaskDeliverable } from '@/domain/workspaceTypes'

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

/**
 * Work — the outcome destination. Lists tasks with honest status and
 * provenance; the task workspace lives at /work/:taskId.
 */
export function WorkPage() {
  const { taskId } = useParams()
  const navigate = useNavigate()
  const tasks = useWorkStore((state) => state.tasks)

  const ordered = useMemo(
    () => Object.values(tasks).sort((a, b) => b.updatedAt - a.updatedAt),
    [tasks],
  )

  if (taskId) {
    if (taskId === 'new') {
      return <NewTaskForm />
    }
    // Unknown ids recover to the Work home instead of a dead end.
    if (!tasks[taskId]) {
      navigate('/work', { replace: true })
    }
    return <TaskWorkspaceLoader taskId={taskId} />
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="material safe-left safe-right sticky top-0 z-30 flex h-13 shrink-0 items-center gap-2 border-b border-line bg-mat-header px-2 sm:px-4">
        <h1 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Briefcase size={16} className="text-ink-faint" />
          Work
        </h1>
        <span className="text-xs text-ink-faint">Local demo execution</span>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-column px-3 py-6 sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-ink">Tasks</h2>
              <p className="mt-0.5 text-sm text-ink-soft">
                Describe an outcome, run it as a local demo, review the output.
              </p>
            </div>
          </div>

          {ordered.length === 0 ? (
            <div className="mt-8 rounded-group border border-line bg-raised px-6 py-10 text-center">
              <Briefcase size={28} className="mx-auto text-ink-faint" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-ink">No tasks yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-soft">
                Create a task from a template — Research brief, Data review, or Email
                draft — and run it as a clearly-labeled local simulation.
              </p>
              <div className="mt-5 flex justify-center">
                <Button variant="primary" onClick={() => navigate('/work/new')}>
                  <Plus size={16} />
                  New task
                </Button>
              </div>
            </div>
          ) : (
            <ul className="mt-5 flex flex-col gap-2">
              {ordered.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/work/${task.id}`)}
                    className="flex w-full items-center gap-3 rounded-group border border-line bg-raised px-4 py-3 text-left transition-colors hover:bg-subtle"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {task.title}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-faint">
                        {task.goal || 'No goal described'}
                        {' · '}
                        {formatRelativeTime(task.updatedAt)}
                      </span>
                    </span>
                    <StatusPill
                      label={TASK_STATUS_LABELS[task.status]}
                      tone={TASK_STATUS_TONES[task.status]}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}

/** Minimal brief form — the full workspace UI follows in the next change. */
function NewTaskForm() {
  const navigate = useNavigate()
  const createTask = useWorkStore((state) => state.createTask)
  const [title, setTitle] = useState('')
  const [goal, setGoal] = useState('')
  const [deliverable, setDeliverable] = useState<TaskDeliverable>('research-report')

  const templates: { id: TaskDeliverable; label: string }[] = [
    { id: 'research-report', label: 'Research brief' },
    { id: 'data-review', label: 'Data review' },
    { id: 'email-draft', label: 'Email draft' },
  ]

  function handleCreate() {
    const id = createTask({ title, goal, deliverable })
    navigate(`/work/${id}`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="material safe-left safe-right sticky top-0 z-30 flex h-13 shrink-0 items-center gap-2 border-b border-line bg-mat-header px-2 sm:px-4">
        <h1 className="text-sm font-semibold text-ink">New task</h1>
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-column px-3 py-6 sm:px-4">
          <div className="flex flex-col gap-4 rounded-group border border-line bg-raised p-4">
            <TextField
              label="Title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="e.g. Compare two routers"
            />
            <TextField
              label="Goal"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="What outcome do you want?"
            />
            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-ink">Template</legend>
              <div className="flex flex-wrap gap-2">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setDeliverable(template.id)}
                    aria-pressed={deliverable === template.id}
                    className={`min-touch rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                      deliverable === template.id
                        ? 'border-accent bg-accent-soft font-medium text-accent'
                        : 'border-line text-ink hover:bg-subtle'
                    }`}
                  >
                    {template.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="text-xs leading-relaxed text-ink-faint">
              Execution is a local demo simulation — no external service is contacted,
              and no API key is required to try it.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => navigate('/work')}>
                Cancel
              </Button>
              <Button variant="primary" disabled={!title.trim()} onClick={handleCreate}>
                Create task
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Placeholder boundary — replaced by the full workspace in the next change. */
function TaskWorkspaceLoader({ taskId }: { taskId: string }) {
  const task = useWorkStore((state) => state.tasks[taskId])
  if (!task) return null
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="material safe-left safe-right sticky top-0 z-30 flex h-13 shrink-0 items-center gap-2 border-b border-line bg-mat-header px-2 sm:px-4">
        <h1 className="min-w-0 truncate text-sm font-semibold text-ink">{task.title}</h1>
        <StatusPill
          label={TASK_STATUS_LABELS[task.status]}
          tone={TASK_STATUS_TONES[task.status]}
        />
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-column px-3 py-6 sm:px-4">
          <p className="text-sm text-ink-soft">{task.goal}</p>
        </div>
      </div>
    </div>
  )
}
