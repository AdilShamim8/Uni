import { describe, expect, it } from 'vitest'
import {
  dispatch,
  registerAdapter,
  resetAdaptersForTests,
  revokeAndCancelThreadRuns,
} from '@/services/plugins/dispatcher'
import { registerBuiltInAdapters } from '@/services/plugins/adapters'
import { usePluginsStore, resetPluginsStoreForTests } from '@/state/pluginsStore'
import { useLibraryStore } from '@/state/libraryStore'

/**
 * Milestone 07 regression suite (F05/F06): cancellation must stop the
 * correct work and its side effects.
 *
 * - Revoking thread A cancels only A's runs; B keeps going.
 * - An abort during a delayed async read writes NO Library artifact.
 * - Removing an employee's access cancels only that employee's runs.
 */

const THREAD_A = { kind: 'work' as const, taskId: 'task-a' }
const THREAD_B = { kind: 'work' as const, taskId: 'task-b' }

function grantEverywhere(pluginId = 'documents', agentId?: string) {
  const store = usePluginsStore.getState()
  store.enablePlugin(pluginId)
  store.grantThread('work:task-a', pluginId)
  store.grantThread('work:task-b', pluginId)
  if (agentId) store.setAgentAllowed(agentId, [pluginId])
}

describe('thread-scoped cancellation (F05)', () => {
  it('revoking thread A cancels only A; B succeeds', async () => {
    resetPluginsStoreForTests()
    resetAdaptersForTests()
    registerBuiltInAdapters()
    usePluginsStore.getState().initialize()
    grantEverywhere()

    let releaseA!: () => void
    let releaseB!: () => void
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve
    })
    const gateB = new Promise<void>((resolve) => {
      releaseB = resolve
    })

    registerAdapter('documents.create', async (_input, context) => {
      if (context.thread?.kind === 'work' && context.thread.taskId === 'task-a') {
        await gateA
      } else {
        await gateB
      }
      return { summary: 'done' }
    })

    const runA = dispatch(
      {
        pluginId: 'documents',
        capability: 'documents.create',
        actionLabel: 'Create',
        thread: THREAD_A,
        agentId: null,
      },
      {},
    )
    const runB = dispatch(
      {
        pluginId: 'documents',
        capability: 'documents.create',
        actionLabel: 'Create',
        thread: THREAD_B,
        agentId: null,
      },
      {},
    )

    // Revoke A while both runs are in flight.
    revokeAndCancelThreadRuns(THREAD_A, 'documents')
    releaseA()
    releaseB()

    const outcomeA = await runA
    const outcomeB = await runB
    expect(outcomeA.ok).toBe(false)
    expect(outcomeB.ok).toBe(true)

    const receipts = usePluginsStore.getState().receipts
    const receiptA = receipts.find((r) => r.thread?.kind === 'work' && r.thread.taskId === 'task-a')
    const receiptB = receipts.find((r) => r.thread?.kind === 'work' && r.thread.taskId === 'task-b')
    expect(receiptA?.status).toBe('revoked')
    expect(receiptB?.status).toBe('success')
  })
})

describe('no side effects after cancellation (F06)', () => {
  it('a revocation during the delayed CSV read writes no artifact', async () => {
    resetPluginsStoreForTests()
    resetAdaptersForTestsWithDelay()
    usePluginsStore.getState().initialize()
    grantEverywhere('data-analysis')

    const csv = 'name,score\na,1\nb,2\n'
    const file = new File([csv], 'delayed.csv', { type: 'text/csv' })

    const run = dispatch(
      {
        pluginId: 'data-analysis',
        capability: 'data.analyze',
        actionLabel: 'Analyze delayed.csv',
        thread: THREAD_A,
        agentId: null,
      },
      { file },
    )

    // Revoke while the FileReader is still resolving.
    await new Promise((resolve) => setTimeout(resolve, 30))
    revokeAndCancelThreadRuns(THREAD_A, 'data-analysis')

    const outcome = await run
    expect(outcome.ok).toBe(false)
    // The Library stays clean — no artifact from a cancelled run.
    const artifacts = Object.values(useLibraryStore.getState().artifacts)
    expect(artifacts.filter((artifact) => artifact.title.includes('delayed.csv'))).toHaveLength(0)
  })

  it('removing employee access cancels only that employee’s run', async () => {
    resetPluginsStoreForTests()
    resetAdaptersForTests()
    registerBuiltInAdapters()
    usePluginsStore.getState().initialize()
    grantEverywhere('documents', 'agent-1')
    grantEverywhere('documents', 'agent-2')
    // Employee threads need their own grants.
    usePluginsStore.getState().grantThread('agent:conv-1', 'documents')
    usePluginsStore.getState().grantThread('agent:conv-2', 'documents')

    let release1!: () => void
    let release2!: () => void
    const gate1 = new Promise<void>((resolve) => {
      release1 = resolve
    })
    const gate2 = new Promise<void>((resolve) => {
      release2 = resolve
    })
    registerAdapter('documents.create', async (_input, context) => {
      if (context.thread?.kind === 'agent' && context.thread.conversationId === 'conv-1') {
        await gate1
      } else {
        await gate2
      }
      return { summary: 'done' }
    })

    const run1 = dispatch(
      {
        pluginId: 'documents',
        capability: 'documents.create',
        actionLabel: 'Create',
        thread: { kind: 'agent', agentId: 'agent-1', conversationId: 'conv-1' },
        agentId: 'agent-1',
      },
      {},
    )
    const run2 = dispatch(
      {
        pluginId: 'documents',
        capability: 'documents.create',
        actionLabel: 'Create',
        thread: { kind: 'agent', agentId: 'agent-2', conversationId: 'conv-2' },
        agentId: 'agent-2',
      },
      {},
    )

    // Remove agent-1's access mid-run; agent-2 is untouched.
    usePluginsStore.getState().setAgentAllowed('agent-1', [])
    release1()
    release2()

    expect((await run1).ok).toBe(false)
    expect((await run2).ok).toBe(true)
  })
})

/**
 * Registers a data.analyze adapter that reads the file with a deliberate
 * delay, so a revocation can land mid-read (the F06 window).
 */
function resetAdaptersForTestsWithDelay(): void {
  resetAdaptersForTests()
  const original = readFileTextDelayed
  registerAdapter('data.analyze', async (input: { file: File | null }, context) => {
    const file = input?.file ?? null
    if (!file) throw new Error('No file was selected — nothing was analyzed.')
    const text = await original(file)
    if (context.signal.aborted) {
      throw new DOMException('The run was cancelled.', 'AbortError')
    }
    const { parseCsvText, profileColumns, summarizeColumn, summarizeToMarkdown } =
      await import('@/domain/csvAnalysis')
    const parsed = parseCsvText(text)
    const summaries = profileColumns(parsed).map((profile) =>
      summarizeColumn(profile, { type: 'auto' }),
    )
    const markdown = summarizeToMarkdown({ fileName: file.name, parsed, summaries, grouping: null })
    if (context.signal.aborted) {
      throw new DOMException('The run was cancelled.', 'AbortError')
    }
    const artifactId = useLibraryStore.getState().addArtifact({
      title: `Analysis — ${file.name}`,
      kind: 'data',
      markdown,
      provenance: 'local-computation',
      source: null,
    })
    return { summary: `Analyzed ${file.name}.`, artifactId }
  })
}

function readFileTextDelayed(file: File): Promise<string> {
  return new Promise((resolve) => {
    setTimeout(() => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result ?? ''))
      reader.readAsText(file)
    }, 60)
  })
}
