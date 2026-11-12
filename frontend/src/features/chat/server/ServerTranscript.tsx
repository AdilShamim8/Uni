import { useMemo } from 'react'
import { AlertCircle, Check, Loader2, Square } from 'lucide-react'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerConversationDetail } from '@/state/serverSessionStore'
import { activePathIds } from './serverThreadModel'

/**
 * The server conversation transcript for the unified Chat surface
 * (Phase B). Renders the server-owned message tree with the active
 * branch highlighted and sibling branches dimmed but preserved — the
 * same model contract the Account server thread established, at the
 * reading quality of the main chat surface.
 */

function nodeStatusSuffix(status: string): string {
  if (status === 'stopped') return ' · stopped'
  if (status === 'error') return ' · error'
  if (status === 'streaming') return ' · streaming…'
  return ''
}

export function ServerTranscript({ detail }: { detail: ServerConversationDetail }) {
  const activeRun = useServerSessionStore((state) => state.activeRun)

  const activePath = useMemo(() => activePathIds(detail), [detail])
  const runIsLive =
    activeRun !== null &&
    activeRun.conversationId === detail.id &&
    (activeRun.status === 'running' || activeRun.status === 'cancelling')

  return (
    <div
      className="mx-auto w-full max-w-column px-3.5 sm:px-4"
      aria-label={`Server conversation ${detail.title}`}
    >
      <ol className="flex flex-col gap-6 py-6">
        {detail.nodes.map((node) => {
          const onActiveBranch = activePath.has(node.id)
          return (
            <li
              key={node.id}
              className={onActiveBranch ? 'text-ink' : 'text-ink-faint opacity-60'}
            >
              <p className="mb-1 flex items-center gap-1.5 text-[12.5px] font-medium text-ink-soft">
                {node.role === 'user' ? 'You' : 'Uni'}
                {!onActiveBranch && (
                  <span className="text-ink-faint">· other branch</span>
                )}
                {onActiveBranch && nodeStatusSuffix(node.status) && (
                  <span className="text-ink-faint">{nodeStatusSuffix(node.status)}</span>
                )}
              </p>
              <div
                className={`whitespace-pre-wrap rounded-group px-3.5 py-2.5 text-[15px] leading-relaxed ${
                  onActiveBranch ? 'bg-subtle' : 'bg-subtle/50'
                }`}
              >
                {node.content}
              </div>
            </li>
          )
        })}

        {/* The live run streams below the persisted tree; it becomes a
            node on completion (the store reloads the detail). */}
        {activeRun && activeRun.conversationId === detail.id && (
          <li>
            <p className="mb-1 flex items-center gap-1.5 text-[12.5px] font-medium text-ink-soft">
              Uni
              {activeRun.status === 'running' && (
                <>
                  <Loader2 size={12} className="animate-spin" aria-hidden="true" />
                  <span className="text-ink-faint">streaming…</span>
                </>
              )}
              {activeRun.status === 'cancelling' && (
                <>
                  <Square size={11} aria-hidden="true" />
                  <span className="text-ink-faint">stopping…</span>
                </>
              )}
              {activeRun.status === 'stopped' && (
                <>
                  <Square size={11} aria-hidden="true" />
                  <span className="text-ink-faint">stopped</span>
                </>
              )}
              {activeRun.status === 'repetition_stopped' && (
                <>
                  <Square size={11} aria-hidden="true" />
                  <span className="text-ink-faint">stopped — repetitive output</span>
                </>
              )}
              {activeRun.status === 'complete' && (
                <>
                  <Check size={12} aria-hidden="true" />
                  <span className="text-ink-faint">complete</span>
                </>
              )}
              {activeRun.status === 'error' && (
                <>
                  <AlertCircle size={12} aria-hidden="true" />
                  <span className="text-danger">error</span>
                </>
              )}
            </p>
            <div className="whitespace-pre-wrap rounded-group bg-subtle px-3.5 py-2.5 text-[15px] leading-relaxed text-ink">
              {activeRun.text}
              {runIsLive && (
                <span
                  className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-accent"
                  aria-hidden="true"
                />
              )}
            </div>
            {activeRun.errorMessage && (
              <p role="alert" className="mt-1.5 text-[13px] text-danger">
                {activeRun.errorMessage}
              </p>
            )}
          </li>
        )}
      </ol>
    </div>
  )
}
