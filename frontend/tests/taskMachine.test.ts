import { describe, expect, it } from 'vitest'
import {
  canTransition,
  taskMatchesFilter,
  TASK_STATUS_LABELS,
} from '@/domain/taskMachine'
import type { TaskStatus } from '@/domain/workspaceTypes'

describe('task state machine', () => {
  it('allows the happy path draft → queued → running → review → completed', () => {
    expect(canTransition('draft', 'queued')).toBe(true)
    expect(canTransition('queued', 'running')).toBe(true)
    expect(canTransition('running', 'ready_for_review')).toBe(true)
    expect(canTransition('ready_for_review', 'completed')).toBe(true)
  })

  it('supports needs_input and paused with resume paths', () => {
    expect(canTransition('running', 'needs_input')).toBe(true)
    expect(canTransition('needs_input', 'running')).toBe(true)
    expect(canTransition('running', 'paused')).toBe(true)
    expect(canTransition('paused', 'running')).toBe(true)
  })

  it('never completes straight from cancelled or failed', () => {
    expect(canTransition('cancelled', 'completed')).toBe(false)
    expect(canTransition('failed', 'completed')).toBe(false)
    // Deliberate recovery paths instead:
    expect(canTransition('failed', 'queued')).toBe(true)
    expect(canTransition('cancelled', 'draft')).toBe(true)
  })

  it('blocks running directly from cancelled', () => {
    expect(canTransition('cancelled', 'running')).toBe(false)
  })

  it('labels every status', () => {
    const statuses: TaskStatus[] = [
      'draft', 'queued', 'running', 'needs_input', 'ready_for_review',
      'completed', 'paused', 'cancelled', 'failed',
    ]
    for (const status of statuses) {
      expect(TASK_STATUS_LABELS[status].length).toBeGreaterThan(0)
    }
  })
})

describe('task filters', () => {
  it('in-progress collects active statuses only', () => {
    expect(taskMatchesFilter('running', 'in-progress')).toBe(true)
    expect(taskMatchesFilter('queued', 'in-progress')).toBe(true)
    expect(taskMatchesFilter('paused', 'in-progress')).toBe(true)
    expect(taskMatchesFilter('needs_input', 'in-progress')).toBe(true)
    expect(taskMatchesFilter('draft', 'in-progress')).toBe(false)
    expect(taskMatchesFilter('completed', 'in-progress')).toBe(false)
    expect(taskMatchesFilter('cancelled', 'in-progress')).toBe(false)
  })

  it('ready-for-review matches only its own status', () => {
    expect(taskMatchesFilter('ready_for_review', 'ready-for-review')).toBe(true)
    expect(taskMatchesFilter('completed', 'ready-for-review')).toBe(false)
  })
})
