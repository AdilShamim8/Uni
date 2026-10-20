import type { PluginRunReceipt, PluginThreadRef } from '@/domain/pluginTypes'
import { findPlugin } from './registry'
import type { PluginEntry } from '@/features/conversation/threadModel'

/** Convert persisted receipts into thread entries (stable ids by run). */
export function receiptsToEntries(receipts: PluginRunReceipt[]): PluginEntry[] {
  return receipts.map((receipt) => ({
    kind: 'plugin' as const,
    entryId: `plugin:${receipt.id}`,
    at: receipt.at,
    runId: receipt.id,
    pluginId: receipt.pluginId,
    pluginName: findPlugin(receipt.pluginId)?.name ?? receipt.pluginId,
    actionLabel: receipt.actionLabel,
    status: receipt.status,
    summary: receipt.summary,
    detail: receipt.detail ?? receipt.error,
    artifactId: receipt.artifactId ?? null,
  }))
}

/** Pure filter — the store method and thread pages share one rule. */
export function filterReceiptsForThread(
  receipts: PluginRunReceipt[],
  thread: PluginThreadRef,
): PluginRunReceipt[] {
  return receipts
    .filter((receipt) => {
      if (!receipt.thread) return false
      if (receipt.thread.kind !== thread.kind) return false
      if (receipt.thread.kind === 'work' && thread.kind === 'work') {
        return receipt.thread.taskId === thread.taskId
      }
      if (receipt.thread.kind === 'agent' && thread.kind === 'agent') {
        return receipt.thread.conversationId === thread.conversationId
      }
      if (receipt.thread.kind === 'chat' && thread.kind === 'chat') {
        return receipt.thread.conversationId === thread.conversationId
      }
      return false
    })
    .sort((a, b) => a.at - b.at)
}
