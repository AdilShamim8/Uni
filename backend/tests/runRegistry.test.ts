import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  activeRunIds,
  finishRun,
  getRunHandle,
  publishRunEvent,
  registerRun,
  subscribeToRun,
} from '../src/modules/runs/runRegistry.js'
import type { RunEvent } from '@uni/contracts'

/**
 * The in-process run registry (B03): idempotent handles, a per-run
 * event bus with a terminal sentinel, and subscriber isolation — a
 * throwing subscriber must never break the runner.
 */
const liveRuns: string[] = []

afterEach(() => {
  for (const runId of liveRuns.splice(0)) {
    finishRun(runId)
  }
})

function track(runId: string): string {
  liveRuns.push(runId)
  return runId
}

function event(sequence: number): RunEvent {
  return {
    eventId: `ev_${sequence}`,
    runId: 'run_x',
    sequence,
    type: 'delta',
    timestamp: 1,
    payload: { text: 'x' },
  }
}

describe('run handles', () => {
  it('registering the same run twice returns the same handle', () => {
    const runId = track('run-idem')
    const first = registerRun(runId)
    const second = registerRun(runId)
    expect(second).toBe(first)
    expect(activeRunIds()).toContain(runId)
  })

  it('an unknown run has no handle; finishing removes it', () => {
    expect(getRunHandle('run-ghost')).toBeNull()
    const runId = track('run-finish')
    registerRun(runId)
    finishRun(runId)
    expect(getRunHandle(runId)).toBeNull()
    expect(activeRunIds()).not.toContain(runId)
  })
})

describe('run event bus', () => {
  it('publishes persisted events to live subscribers', () => {
    const runId = track('run-pub')
    const seen: RunEvent[] = []
    const unsubscribe = subscribeToRun(runId, (e) => {
      if ('type' in e) seen.push(e)
    })
    publishRunEvent(runId, event(0))
    publishRunEvent(runId, event(1))
    expect(seen.map((e) => e.sequence)).toEqual([0, 1])
    unsubscribe()
  })

  it('a throwing subscriber never breaks the publisher', () => {
    const runId = track('run-badsub')
    const good = vi.fn()
    subscribeToRun(runId, () => {
      throw new Error('subscriber bug')
    })
    subscribeToRun(runId, good)
    expect(() => publishRunEvent(runId, event(0))).not.toThrow()
    expect(good).toHaveBeenCalledTimes(1)
  })

  it('finishRun sends the terminal sentinel and stops delivery', () => {
    const runId = track('run-terminal')
    const seen: Array<RunEvent | { terminal: true }> = []
    subscribeToRun(runId, (e) => seen.push(e))
    finishRun(runId)
    expect(seen).toEqual([{ terminal: true }])
    // After the sentinel, publishing is a no-op (no crash, no delivery).
    publishRunEvent(runId, event(0))
    expect(seen).toEqual([{ terminal: true }])
  })

  it('unsubscribing stops delivery and cleans the set', () => {
    const runId = track('run-unsub')
    const seen: RunEvent[] = []
    const unsubscribe = subscribeToRun(runId, (e) => {
      if ('type' in e) seen.push(e)
    })
    unsubscribe()
    publishRunEvent(runId, event(0))
    expect(seen).toEqual([])
    // A second unsubscribe is a safe no-op.
    expect(() => unsubscribe()).not.toThrow()
  })

  it('events for other runs never reach a different subscriber', () => {
    const runA = track('run-a')
    const runB = track('run-b')
    const seenByB: RunEvent[] = []
    subscribeToRun(runB, (e) => {
      if ('type' in e) seenByB.push(e)
    })
    publishRunEvent(runA, event(0))
    expect(seenByB).toEqual([])
  })
})

describe('registry cleanup', () => {
  it('a run with no subscribers finishes cleanly (no ghost sets)', () => {
    const runId = track('run-nosub')
    registerRun(runId)
    finishRun(runId)
    finishRun(runId) // second finish is a safe no-op
    expect(getRunHandle(runId)).toBeNull()
  })
})
