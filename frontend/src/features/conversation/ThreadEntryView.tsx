import { useState } from 'react'
import { AlertTriangle, Check, Copy, Info } from 'lucide-react'
import { Markdown } from '@/features/chat/Markdown'
import { MessageItem } from '@/features/chat/MessageItem'
import { UniMark } from '@/components/layout/UniMark'
import { Spinner } from '@/components/ui/Spinner'
import { formatFullTimestamp } from '@/domain/timestamps'
import { variantInfoFor } from '@/domain/conversationTree'
import type { ThreadEntry, StatusNoteEntry, WorkMessageEntry } from './threadModel'
import { ActivityCard } from './cards/ActivityCard'
import { TaskCard } from './cards/TaskCard'
import { ClarifyCard } from './cards/ClarifyCard'
import { OutputCard } from './cards/OutputCard'
import { PluginReceipt } from './cards/PluginReceipt'

/* ------------------------------------------------------------------ */
/* Work-thread message bubble (mirrors the chat message markup)         */
/* ------------------------------------------------------------------ */

function CopyButton({ content }: { content: string }) {
  const [copied, setCopied] = useState(false)
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable — ignore */
    }
  }
  return (
    <button
      type="button"
      aria-label={copied ? 'Copied' : 'Copy message'}
      onClick={() => void handleCopy()}
      className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
    >
      {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
    </button>
  )
}

function WorkUserMessage({ message }: { message: WorkMessageEntry['message'] }) {
  return (
    <div className="message-in group flex flex-col items-end" title={formatFullTimestamp(message.at)}>
      <div className="max-w-[85%] rounded-[20px] bg-subtle px-4 py-3">
        <p className="whitespace-pre-wrap text-[16px] leading-relaxed text-ink">
          {message.content}
        </p>
      </div>
      <div className="mt-1 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
        <CopyButton content={message.content} />
      </div>
    </div>
  )
}

function WorkAssistantMessage({ message }: { message: WorkMessageEntry['message'] }) {
  const streaming = message.status === 'streaming'
  return (
    <div className="message-in group flex gap-3.5" title={formatFullTimestamp(message.at)}>
      <UniMark size={24} className="mt-0.5 shrink-0 text-ink" />
      <div className="min-w-0 flex-1">
        {message.statusPrefix && (
          <p className="mb-2 text-xs font-medium text-ink-faint">{message.statusPrefix}</p>
        )}
        {streaming && message.content === '' ? (
          <div className="flex items-center gap-2 text-sm text-ink-faint">
            <Spinner size={14} />
            Working…
          </div>
        ) : (
          <>
            <Markdown content={message.content} />
            {streaming && <span className="streaming-caret" aria-hidden="true" />}
          </>
        )}
        {message.status === 'stopped' && (
          <p className="mt-2 text-xs text-ink-faint">
            Generation stopped — partial content preserved.
          </p>
        )}
        {message.status === 'error' && (
          <p role="alert" className="mt-2 text-xs leading-relaxed text-danger">
            <strong className="font-semibold">Request failed.</strong> {message.error}
          </p>
        )}
        {!streaming && (
          <div className="mt-1 flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100">
            <CopyButton content={message.content} />
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Status note                                                         */
/* ------------------------------------------------------------------ */

const NOTE_STYLES: Record<StatusNoteEntry['tone'], { icon: React.ReactNode; className: string }> = {
  info: {
    icon: <Info size={13} />,
    className: 'border-line bg-raised text-ink-soft',
  },
  warning: {
    icon: <AlertTriangle size={13} />,
    className: 'border-warning/40 bg-warning-soft/60 text-ink-soft',
  },
  error: {
    icon: <AlertTriangle size={13} />,
    className: 'border-danger/40 bg-danger-soft/60 text-ink-soft',
  },
  success: {
    icon: <Check size={13} />,
    className: 'border-success/30 bg-success-soft/50 text-ink-soft',
  },
}

function StatusNote({ entry }: { entry: StatusNoteEntry }) {
  const style = NOTE_STYLES[entry.tone]
  return (
    <div
      className={`flex items-start gap-2.5 rounded-group border px-4 py-2.5 ${style.className}`}
    >
      <span className="mt-0.5 shrink-0 opacity-70" aria-hidden="true">
        {style.icon}
      </span>
      <p className="min-w-0 flex-1">
        <span className="block text-[13px] leading-snug text-ink">{entry.label}</span>
        {entry.detail && (
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-faint">
            {entry.detail}
          </span>
        )}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Entry switch                                                        */
/* ------------------------------------------------------------------ */

export interface ThreadEntryViewProps {
  entry: ThreadEntry
  isLast: boolean
  /** Answer a pending clarification (Work threads). */
  onAnswerClarify?: (answer: string) => void
}

export function ThreadEntryView({ entry, isLast, onAnswerClarify }: ThreadEntryViewProps) {
  switch (entry.kind) {
    case 'chat_message':
      // Employee threads render the real chat node through the same
      // component the Chat surface uses — identical markup and actions.
      // Variant index/count come from the one-pass domain map so the
      // memoized MessageItem receives stable primitive props.
      {
        const variant = variantInfoFor(entry.conversation, entry.node.id)
        return (
          <MessageItem
            node={entry.node}
            conversationId={entry.conversation.id}
            isLast={isLast}
            variantIndex={variant?.index ?? 0}
            variantCount={variant?.count ?? 1}
          />
        )
      }
    case 'work_message':
      return entry.message.role === 'user' ? (
        <WorkUserMessage message={entry.message} />
      ) : (
        <WorkAssistantMessage message={entry.message} />
      )
    case 'task_card':
      return <TaskCard entry={entry} />
    case 'clarify':
      return onAnswerClarify ? (
        <ClarifyCard entry={entry} onAnswer={onAnswerClarify} />
      ) : (
        <StatusNote
          entry={{
            kind: 'status_note',
            entryId: entry.entryId,
            at: entry.at,
            tone: 'warning',
            label: entry.question,
          }}
        />
      )
    case 'activity':
      return <ActivityCard entry={entry} />
    case 'output_card':
      return <OutputCard entry={entry} />
    case 'plugin':
      return <PluginReceipt entry={entry} />
    case 'status_note':
      return <StatusNote entry={entry} />
    default:
      return null
  }
}
