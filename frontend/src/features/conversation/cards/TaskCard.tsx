import { useNavigate } from 'react-router-dom'
import { Briefcase } from 'lucide-react'
import { useWorkStore } from '@/state/workStore'
import { TASK_STATUS_LABELS, TASK_STATUS_TONES } from '@/domain/taskMachine'
import { StatusPill } from '@/components/ui/StatusPill'
import type { TaskCardEntry } from '../threadModel'

/**
 * Compact card linking to the canonical Work task. Status and mode are
 * read live from the work store — opening the task from here opens the
 * same task and thread, never a second run or a copied history.
 */
export function TaskCard({ entry }: { entry: TaskCardEntry }) {
  const navigate = useNavigate()
  const task = useWorkStore((state) => state.tasks[entry.taskId])

  return (
    <button
      type="button"
      onClick={() => navigate(`/work/${entry.taskId}`)}
      className="group flex w-full items-center gap-3 rounded-group border border-line bg-raised px-4 py-3 text-left transition-colors hover:bg-subtle"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
        <Briefcase size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">
          {task?.title ?? entry.title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-ink-faint">
          {(task?.goal || entry.goal || 'No goal described').slice(0, 120)}
        </span>
      </span>
      {task ? (
        <StatusPill
          label={TASK_STATUS_LABELS[task.status]}
          tone={TASK_STATUS_TONES[task.status]}
          dot={task.status === 'running'}
        />
      ) : (
        <StatusPill label="Removed" tone="neutral" />
      )}
    </button>
  )
}
