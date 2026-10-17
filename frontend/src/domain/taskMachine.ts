import type { TaskStatus } from './workspaceTypes'

/**
 * Valid transitions of the Work task state machine (see workspaceTypes).
 *
 * Invariants enforced here:
 * - `completed` is only reachable from `ready_for_review` — a cancelled or
 *   failed task must go back through `queued` (retry) or `draft` (re-plan).
 * - `running` is reachable from `queued`, `needs_input` (answer received),
 *   and `paused` (resume) — never directly from `cancelled`/`failed`.
 */
const TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  draft: ['queued', 'cancelled'],
  queued: ['running', 'paused', 'cancelled'],
  running: ['needs_input', 'ready_for_review', 'paused', 'failed', 'cancelled'],
  needs_input: ['running', 'cancelled'],
  ready_for_review: ['completed', 'running', 'cancelled'],
  paused: ['running', 'cancelled', 'failed'],
  cancelled: ['draft'],
  failed: ['queued', 'draft', 'cancelled'],
  completed: ['draft'],
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

/** Short human labels for status pills. */
export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  draft: 'Draft',
  queued: 'Queued',
  running: 'Running',
  needs_input: 'Needs input',
  ready_for_review: 'Ready for review',
  completed: 'Completed',
  paused: 'Paused',
  cancelled: 'Cancelled',
  failed: 'Failed',
}

/** Tone mapping for status pills (shared component renders the pill). */
export const TASK_STATUS_TONES: Record<
  TaskStatus,
  'neutral' | 'accent' | 'success' | 'warning' | 'danger'
> = {
  draft: 'neutral',
  queued: 'neutral',
  running: 'accent',
  needs_input: 'warning',
  ready_for_review: 'accent',
  completed: 'success',
  paused: 'neutral',
  cancelled: 'neutral',
  failed: 'danger',
}

/**
 * Work-home filter buckets. `needs-input`, `ready-for-review` map straight
 * onto statuses; `in-progress` collects the active trio.
 */
export type TaskFilter = 'all' | 'in-progress' | 'needs-input' | 'ready-for-review' | 'completed'

export function taskMatchesFilter(status: TaskStatus, filter: TaskFilter): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'in-progress':
      return status === 'queued' || status === 'running' || status === 'paused' || status === 'needs_input'
    case 'needs-input':
      return status === 'needs_input'
    case 'ready-for-review':
      return status === 'ready_for_review'
    case 'completed':
      return status === 'completed'
  }
}
