import { describe, expect, it } from 'vitest'
import type { PluginRunReceipt } from '@/domain/pluginTypes'
import { filterReceiptsForThread, receiptsToEntries } from '@/features/plugins/receiptEntries'

function receipt(overrides: Partial<PluginRunReceipt>): PluginRunReceipt {
  return {
    id: 'run_1',
    pluginId: 'documents',
    capability: 'documents.create',
    actionLabel: 'Create Canvas document',
    status: 'success',
    at: 3,
    finishedAt: 4,
    summary: 'Created the document.',
    detail: null as unknown as string | undefined,
    artifactId: null,
    thread: null,
    ...overrides,
  }
}

/** Persisted receipts become thread entries — an honest history, never a success badge. */
describe('receiptsToEntries', () => {
  it('derives stable entry ids and resolves the plugin name from the catalog', () => {
    const [entry] = receiptsToEntries([receipt({})])
    expect(entry).toMatchObject({
      kind: 'plugin',
      entryId: 'plugin:run_1',
      runId: 'run_1',
      pluginId: 'documents',
      pluginName: 'Documents',
      status: 'success',
    })
  })

  it('an unknown plugin id falls back to the raw id, never a blank name', () => {
    const [entry] = receiptsToEntries([receipt({ pluginId: 'future-plugin' })])
    expect(entry.pluginName).toBe('future-plugin')
  })

  it('the detail falls back to the error when there is no detail', () => {
    const [failed] = receiptsToEntries([
      receipt({ status: 'error', detail: undefined, error: 'The file was locked.' }),
    ])
    expect(failed.detail).toBe('The file was locked.')
  })
})

describe('filterReceiptsForThread', () => {
  it('keeps only receipts for the same thread kind and id', () => {
    const receipts = [
      receipt({ id: 'a', thread: { kind: 'chat', conversationId: 'cv_1', temporary: false } }),
      receipt({ id: 'b', thread: { kind: 'chat', conversationId: 'cv_2', temporary: false } }),
      receipt({ id: 'c', thread: { kind: 'work', taskId: 'task_1' } }),
      receipt({ id: 'd', thread: null }),
    ]
    const kept = filterReceiptsForThread(receipts, { kind: 'chat', conversationId: 'cv_1', temporary: false })
    expect(kept.map((entry) => entry.id)).toEqual(['a'])
  })

  it('work threads match by task id, agent and chat threads by conversation id', () => {
    const receipts = [
      receipt({ id: 'w1', thread: { kind: 'work', taskId: 'task_9' } }),
      receipt({ id: 'g1', thread: { kind: 'agent', agentId: 'ag_1', conversationId: 'cv_9' } }),
    ]
    expect(filterReceiptsForThread(receipts, { kind: 'work', taskId: 'task_9' }).map((r) => r.id)).toEqual(['w1'])
    expect(
      filterReceiptsForThread(receipts, { kind: 'agent', agentId: 'ag_2', conversationId: 'cv_9' }).map((r) => r.id),
    ).toEqual(['g1'])
  })

  it('sorts the kept receipts oldest first', () => {
    const receipts = [
      receipt({ id: 'late', at: 30, thread: { kind: 'chat', conversationId: 'cv_1', temporary: false } }),
      receipt({ id: 'early', at: 10, thread: { kind: 'chat', conversationId: 'cv_1', temporary: false } }),
    ]
    expect(filterReceiptsForThread(receipts, { kind: 'chat', conversationId: 'cv_1', temporary: false }).map((r) => r.id)).toEqual([
      'early',
      'late',
    ])
  })
})
