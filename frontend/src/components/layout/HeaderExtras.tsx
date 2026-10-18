import { Link } from 'react-router-dom'
import { Activity, Maximize2, Minimize2 } from 'lucide-react'
import { Tooltip } from '@/components/ui/Tooltip'
import { useWorkStore } from '@/state/workStore'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'

/**
 * Shared header extras — the controls every destination's header carries so
 * the shell stays consistent: an honest activity indicator (only when tasks
 * actually exist locally) and the focus-mode toggle.
 */

export function ActivityChip() {
  const activeCount = useWorkStore((state) => {
    let count = 0
    for (const task of Object.values(state.tasks)) {
      if (
        task.status === 'running' ||
        task.status === 'queued' ||
        task.status === 'paused' ||
        task.status === 'needs_input'
      ) {
        count += 1
      }
    }
    return count
  })

  if (activeCount === 0) return null

  return (
    <Tooltip label="Local demo tasks that are running, paused, or waiting for your input">
      <Link
        to="/work"
        className="inline-flex min-touch items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1 text-xs font-medium text-ink-soft transition-colors duration-[var(--motion-fast)] hover:border-line-strong hover:text-ink"
      >
        <span
          aria-hidden="true"
          className="relative flex h-[7px] w-[7px]"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-[7px] w-[7px] rounded-full bg-accent" />
        </span>
        {activeCount} active {activeCount === 1 ? 'task' : 'tasks'}
      </Link>
    </Tooltip>
  )
}

export function FocusModeToggle() {
  const focusMode = useWorkspaceUiStore((state) => state.focusMode)
  const toggleFocusMode = useWorkspaceUiStore((state) => state.toggleFocusMode)

  return (
    <Tooltip
      label={
        focusMode
          ? 'Exit focus mode (Esc)'
          : 'Focus mode — collapse the sidebar and secondary controls'
      }
    >
      <button
        type="button"
        aria-pressed={focusMode}
        aria-label={focusMode ? 'Exit focus mode' : 'Enter focus mode'}
        onClick={toggleFocusMode}
        className="inline-flex h-8 w-8 items-center justify-center rounded-control text-ink-soft transition-colors duration-[var(--motion-fast)] hover:bg-[var(--c-hover-wash)] hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-focus-ring)]"
      >
        {focusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
      </button>
    </Tooltip>
  )
}

/** One compact cluster: activity (real tasks only) + focus toggle. */
export function HeaderExtras() {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <ActivityChip />
      <FocusModeToggle />
    </div>
  )
}

/** Compact activity row for the sidebar footer. */
export function SidebarActivityRow({ onNavigate }: { onNavigate: () => void }) {
  const activeCount = useWorkStore((state) => {
    let count = 0
    for (const task of Object.values(state.tasks)) {
      if (
        task.status === 'running' ||
        task.status === 'queued' ||
        task.status === 'paused' ||
        task.status === 'needs_input'
      ) {
        count += 1
      }
    }
    return count
  })

  if (activeCount === 0) return null

  return (
    <button
      type="button"
      onClick={onNavigate}
      className="flex min-touch w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-[13px] text-ink-soft transition-colors duration-[var(--motion-fast)] hover:bg-[var(--c-hover-wash)] hover:text-ink"
    >
      <Activity size={15} className="shrink-0 text-accent" />
      <span className="min-w-0 flex-1 truncate">
        {activeCount} active {activeCount === 1 ? 'task' : 'tasks'} — local demo runs
      </span>
    </button>
  )
}
