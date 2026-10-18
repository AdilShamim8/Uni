import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Briefcase, FileText, FolderKanban } from 'lucide-react'
import { useWorkStore } from '@/state/workStore'
import { useLibraryStore } from '@/state/libraryStore'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'

/**
 * Below-the-composer recents on an empty chat — only real local data,
 * never seeded activity. A few recent tasks, documents, and projects the
 * user actually created, each linking to its real destination.
 */

interface RecentItem {
  key: string
  icon: React.ReactNode
  title: string
  note: string
  onClick: (navigate: (path: string) => void) => void
}

const TASK_STATUS_NOTES: Record<string, string> = {
  draft: 'Draft',
  queued: 'Queued',
  running: 'Running — local demo',
  needs_input: 'Waiting for your input',
  ready_for_review: 'Ready for review',
  completed: 'Completed',
  paused: 'Paused',
  cancelled: 'Cancelled',
  failed: 'Failed',
}

export function EmptyRecents() {
  const navigate = useNavigate()
  const tasks = useWorkStore((state) => state.tasks)
  const artifacts = useLibraryStore((state) => state.artifacts)
  const projects = useLibraryStore((state) => state.projects)
  const openInspector = useWorkspaceUiStore((state) => state.openInspector)

  const items = useMemo<RecentItem[]>(() => {
    const collected: (RecentItem & { updatedAt: number })[] = []

    for (const task of Object.values(tasks)) {
      collected.push({
        key: `task-${task.id}`,
        icon: <Briefcase size={15} />,
        title: task.title,
        note: TASK_STATUS_NOTES[task.status] ?? task.status,
        onClick: (go) => go(`/work/${task.id}`),
        updatedAt: task.updatedAt,
      })
    }
    for (const artifact of Object.values(artifacts)) {
      collected.push({
        key: `artifact-${artifact.id}`,
        icon: <FileText size={15} />,
        title: artifact.title,
        note: artifact.provenance === 'demo-simulation' ? 'Demo output' : 'Saved locally',
        onClick: () => openInspector({ tab: 'canvas', artifactId: artifact.id }),
        updatedAt: artifact.updatedAt,
      })
    }
    for (const project of Object.values(projects)) {
      collected.push({
        key: `project-${project.id}`,
        icon: <FolderKanban size={15} />,
        title: project.name,
        note: 'Project',
        onClick: (go) => go(`/library?project=${project.id}`),
        updatedAt: project.createdAt,
      })
    }

    return collected.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4)
  }, [tasks, artifacts, projects, openInspector])

  if (items.length === 0) return null

  return (
    <section aria-label="Recent work" className="mt-8">
      <p className="text-left text-[12px] font-medium text-ink-faint">
        Continue where you left off
      </p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.key}>
            <button
              type="button"
              onClick={() => item.onClick(navigate)}
              className="min-touch flex w-full items-center gap-3 rounded-control border border-line/70 bg-raised/50 px-3.5 py-2.5 text-left transition-[background-color,border-color] duration-[var(--motion-fast)] hover:border-line-strong hover:bg-raised"
            >
              <span aria-hidden="true" className="shrink-0 text-ink-faint">
                {item.icon}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-medium text-ink">
                  {item.title}
                </span>
                <span className="block truncate text-[12px] text-ink-faint">{item.note}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
