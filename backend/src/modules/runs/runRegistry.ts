import type { RunEvent } from '@uni/contracts'

/**
 * In-process registry of executing runs.
 *
 * Single-process by design for B03: the API server that creates a run
 * also executes it. The registry owns (a) the AbortController for each
 * live run so cancel can stop provider work, and (b) a per-run event
 * bus so SSE subscribers tail a run while it executes. Events are
 * persisted BEFORE they are published, so a subscriber that attaches
 * and then replays from the database can never miss or duplicate an
 * event (sequences are monotonic; the subscriber dedupes by sequence).
 *
 * Runs left 'running' by a process restart are not in the registry;
 * readers reconcile them honestly (interrupted, never silently
 * completed) via `reconcileStuckRuns` in the service.
 */

export interface RunHandle {
  controller: AbortController
  /** Resolves when execution has fully finalized (terminal event written). */
  done: Promise<void>
}

type Subscriber = (event: RunEvent | { terminal: true }) => void

const handles = new Map<string, RunHandle>()
const subscribers = new Map<string, Set<Subscriber>>()

export function registerRun(runId: string): RunHandle {
  const existing = handles.get(runId)
  if (existing) return existing
  const handle: RunHandle = {
    controller: new AbortController(),
    done: Promise.resolve(),
  }
  handles.set(runId, handle)
  return handle
}

export function getRunHandle(runId: string): RunHandle | null {
  return handles.get(runId) ?? null
}

export function finishRun(runId: string): void {
  handles.delete(runId)
  const pending = subscribers.get(runId)
  if (pending) {
    subscribers.delete(runId)
    // Sentinel: tells subscribers no further events will ever arrive.
    for (const subscriber of pending) {
      try {
        subscriber({ terminal: true })
      } catch {
        /* subscriber errors must never break the runner */
      }
    }
  }
}

/** Publish a persisted event to live subscribers. Never throws. */
export function publishRunEvent(runId: string, event: RunEvent): void {
  const pending = subscribers.get(runId)
  if (!pending) return
  for (const subscriber of pending) {
    try {
      subscriber(event)
    } catch {
      /* subscriber errors must never break the runner */
    }
  }
}

/**
 * Subscribe to live events for a run. Returns an unsubscribe function.
 * The `{ terminal: true }` sentinel (see finishRun) tells the subscriber
 * no further events will arrive — the SSE route closes the stream when
 * it sees the real terminal event or this sentinel.
 */
export function subscribeToRun(runId: string, subscriber: Subscriber): () => void {
  let set = subscribers.get(runId)
  if (!set) {
    set = new Set()
    subscribers.set(runId, set)
  }
  set.add(subscriber)
  return () => {
    const current = subscribers.get(runId)
    if (!current) return
    current.delete(subscriber)
    if (current.size === 0) subscribers.delete(runId)
  }
}

/** Test/observability: ids of runs currently executing in this process. */
export function activeRunIds(): string[] {
  return [...handles.keys()]
}
