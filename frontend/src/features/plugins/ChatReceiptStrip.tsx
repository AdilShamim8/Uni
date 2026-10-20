import { useMemo } from 'react'
import { CheckCircle2, CircleSlash, Loader2, XCircle } from 'lucide-react'
import type { PluginThreadRef } from '@/domain/pluginTypes'
import { usePluginsStore } from '@/state/pluginsStore'
import { useLibraryStore } from '@/state/libraryStore'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'

/**
 * Compact receipt history for ordinary chat threads (m07/F09): every
 * plugin action in THIS conversation — success, denial, cancellation,
 * error — stays inspectable right where it happened, without reworking
 * the message list. Temporary chats show receipts for the session only
 * (they are never persisted).
 */

const STATUS_META = {
  running: { icon: Loader2, className: 'animate-spin text-ink-faint' },
  success: { icon: CheckCircle2, className: 'text-accent' },
  error: { icon: XCircle, className: 'text-danger' },
  cancelled: { icon: CircleSlash, className: 'text-ink-faint' },
  revoked: { icon: CircleSlash, className: 'text-ink-faint' },
  proposed: { icon: CircleSlash, className: 'text-ink-faint' },
} as const

export function ChatReceiptStrip({ thread }: { thread: PluginThreadRef }) {
  const receipts = usePluginsStore((state) => state.receipts)
  const artifacts = useLibraryStore((state) => state.artifacts)
  const openInspector = useWorkspaceUiStore((state) => state.openInspector)

  const mine = useMemo(
    () =>
      receipts
        .filter((receipt) => {
          if (!receipt.thread || receipt.thread.kind !== thread.kind) return false
          if (thread.kind === 'chat' && receipt.thread.kind === 'chat') {
            return receipt.thread.conversationId === thread.conversationId
          }
          if (thread.kind === 'agent' && receipt.thread.kind === 'agent') {
            return receipt.thread.conversationId === thread.conversationId
          }
          return false
        })
        .sort((a, b) => b.at - a.at)
        .slice(0, 3),
    [receipts, thread],
  )

  if (mine.length === 0) return null

  return (
    <ul
      aria-label="Plugin activity in this chat"
      className="mx-auto flex w-full max-w-column flex-col gap-1 px-3 sm:px-4"
    >
      {mine.map((receipt) => {
        const meta = STATUS_META[receipt.status]
        const Icon = meta.icon
        const artifact = receipt.artifactId ? artifacts[receipt.artifactId] : undefined
        return (
          <li
            key={receipt.id}
            className="flex items-start gap-2 rounded-[12px] border border-line/70 bg-raised px-3 py-2 text-xs text-ink-soft"
          >
            <Icon size={13} className={`mt-0.5 shrink-0 ${meta.className}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 leading-relaxed">
              <span className="font-medium text-ink">{receipt.actionLabel}</span>
              {receipt.summary || receipt.error ? ` — ${receipt.summary ?? receipt.error}` : ''}
              {artifact && (
                <>
                  {' '}
                  <button
                    type="button"
                    onClick={() =>
                      openInspector({ tab: 'canvas', artifactId: artifact.id })
                    }
                    className="font-medium text-accent underline-offset-2 hover:underline"
                  >
                    Open “{artifact.title}”
                  </button>
                </>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
