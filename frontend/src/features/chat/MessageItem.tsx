import { useState } from 'react'
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  Pencil,
  RotateCcw,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react'
import type { Conversation, MessageNode } from '@/domain/types'
import { siblingsOf } from '@/domain/conversationTree'
import { formatFullTimestamp } from '@/domain/timestamps'
import { useAppStore } from '@/state/store'
import { UniverseMark } from '@/components/layout/UniverseMark'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Spinner } from '@/components/ui/Spinner'
import { Markdown } from './Markdown'
import { TOOL_REGISTRY } from './toolRegistry'

export interface MessageItemProps {
  node: MessageNode
  conversation: Conversation
  isLast: boolean
}

export function MessageItem({ node, conversation, isLast }: MessageItemProps) {
  if (node.role === 'user') {
    return <UserMessage node={node} conversation={conversation} />
  }
  return <AssistantMessage node={node} conversation={conversation} isLast={isLast} />
}

/* ------------------------------------------------------------------ */
/* Variant switcher                                                    */
/* ------------------------------------------------------------------ */

function VariantNav({
  index,
  count,
  onPrev,
  onNext,
}: {
  index: number
  count: number
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full border border-line bg-raised px-1 py-0.5 text-[11px] text-ink-soft">
      <button
        type="button"
        aria-label="Previous variant"
        disabled={index === 0}
        onClick={onPrev}
        className="rounded p-0.5 hover:text-ink disabled:opacity-30"
      >
        <ChevronLeft size={13} />
      </button>
      <span aria-live="polite">
        {index + 1}/{count}
      </span>
      <button
        type="button"
        aria-label="Next variant"
        disabled={index === count - 1}
        onClick={onNext}
        className="rounded p-0.5 hover:text-ink disabled:opacity-30"
      >
        <ChevronRight size={13} />
      </button>
    </span>
  )
}

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

function ActionRow({ children, align = 'left' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <div
      className={`mt-1 flex items-center gap-0.5 opacity-0 transition-opacity duration-[var(--motion-fast)] focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100 ${
        align === 'right' ? 'justify-end' : ''
      }`}
    >
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* User message                                                        */
/* ------------------------------------------------------------------ */

function UserMessage({ node, conversation }: { node: MessageNode; conversation: Conversation }) {
  const editUserMessage = useAppStore((state) => state.editUserMessage)
  const switchSibling = useAppStore((state) => state.switchSibling)
  const deleteMessage = useAppStore((state) => state.deleteMessage)
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [draft, setDraft] = useState(node.content)

  const siblings = siblingsOf(conversation, node.id)
  const index = siblings.findIndex((sibling) => sibling.id === node.id)
  const variantCount = siblings.length

  if (editing) {
    return (
      <div className="flex flex-col items-end">
        <div className="w-full max-w-[85%] rounded-[18px] border border-accent bg-raised p-3 shadow-soft">
          <label className="sr-only" htmlFor={`edit-${node.id}`}>
            Edit message
          </label>
          <textarea
            id={`edit-${node.id}`}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={Math.min(8, Math.max(2, draft.split('\n').length))}
            className="w-full resize-y bg-transparent text-[16px] leading-relaxed text-ink focus:outline-none"
            autoFocus
          />
          <p className="mt-1 text-[11px] text-ink-faint">
            Saving creates a new branch — the original message and its replies stay
            available through the variant arrows.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={!draft.trim()}
              onClick={() => {
                setEditing(false)
                void editUserMessage(node.id, draft)
              }}
            >
              Save and resend
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="group flex flex-col items-end">
      <div
        className="max-w-[85%] rounded-[18px] bg-subtle px-4 py-2.5"
        title={formatFullTimestamp(node.createdAt)}
      >
        {node.tools && node.tools.length > 0 && (
          <div className="mb-1.5 flex flex-wrap gap-1">
            {node.tools.map((tool) => {
              const definition = TOOL_REGISTRY.find((entry) => entry.id === tool)
              return (
                <span
                  key={tool}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-canvas px-2 py-0.5 text-[11px] font-medium text-ink-soft"
                >
                  {definition?.icon}
                  {definition?.label ?? tool}
                </span>
              )
            })}
          </div>
        )}
        {node.attachments && node.attachments.length > 0 && (
          <ul className="mb-1.5 flex flex-wrap gap-1.5">
            {node.attachments.map((attachment) => (
              <li
                key={attachment.id}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-2 py-1 text-xs text-ink-soft"
              >
                <FileText size={12} className="shrink-0" />
                <span className="max-w-[10rem] truncate">{attachment.name}</span>
              </li>
            ))}
          </ul>
        )}
        {node.content && (
          <p className="whitespace-pre-wrap text-[16px] leading-relaxed text-ink">
            {node.content}
          </p>
        )}
      </div>

      <ActionRow align="right">
        {variantCount > 1 && (
          <VariantNav
            index={index}
            count={variantCount}
            onPrev={() => switchSibling(node.id, -1)}
            onNext={() => switchSibling(node.id, 1)}
          />
        )}
        <CopyButton content={node.content} />
        <button
          type="button"
          aria-label="Edit message"
          title="Edit message"
          onClick={() => {
            setDraft(node.content)
            setEditing(true)
          }}
          className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          aria-label="Delete message"
          title="Delete message and its replies in this branch"
          onClick={() => setConfirmingDelete(true)}
          className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-danger-soft hover:text-danger"
        >
          <Trash2 size={14} />
        </button>
      </ActionRow>

      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete this message?"
        body="This removes the message and everything that follows it in this branch. The rest of the conversation stays, and you can undo right after."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          setConfirmingDelete(false)
          deleteMessage(node.id)
        }}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Assistant message                                                   */
/* ------------------------------------------------------------------ */

function AssistantMessage({
  node,
  conversation,
  isLast,
}: {
  node: MessageNode
  conversation: Conversation
  isLast: boolean
}) {
  const regenerate = useAppStore((state) => state.regenerate)
  const switchSibling = useAppStore((state) => state.switchSibling)
  const setFeedback = useAppStore((state) => state.setFeedback)
  const deleteMessage = useAppStore((state) => state.deleteMessage)
  const [sourcesOpen, setSourcesOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const siblings = siblingsOf(conversation, node.id)
  const index = siblings.findIndex((sibling) => sibling.id === node.id)
  const variantCount = siblings.length
  const streaming = node.status === 'streaming'

  return (
    <div className="group flex gap-3" title={formatFullTimestamp(node.createdAt)}>
      <UniverseMark size={22} className="mt-0.5 shrink-0 text-ink" />
      <div className="min-w-0 flex-1">
        {node.statusPrefix && (
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-faint">
            <Globe size={12} aria-hidden="true" />
            {node.statusPrefix}
          </p>
        )}

        {streaming && node.content === '' ? (
          <div className="flex items-center gap-2 text-sm text-ink-faint">
            <Spinner size={14} />
            {node.statusPrefix ? 'Reading results…' : 'Thinking…'}
          </div>
        ) : (
          <>
            <Markdown content={node.content} />
            {streaming && <span className="streaming-caret" aria-hidden="true" />}
          </>
        )}

        {node.status === 'stopped' && (
          <p className="mt-2 text-xs text-ink-faint">Generation stopped.</p>
        )}

        {node.status === 'error' && (
          <div
            role="alert"
            className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger bg-danger-soft px-3.5 py-2.5"
          >
            <p className="text-xs leading-relaxed text-danger">
              <strong className="font-semibold">Generation failed.</strong> {node.error}
            </p>
            <Button variant="danger" size="sm" onClick={() => void regenerate(node.id)}>
              <RotateCcw size={13} />
              Retry
            </Button>
          </div>
        )}

        {node.sources && node.sources.length > 0 && !streaming && (
          <div className="mt-3">
            <button
              type="button"
              aria-expanded={sourcesOpen}
              onClick={() => setSourcesOpen((value) => !value)}
              className="flex items-center gap-1.5 text-xs font-medium text-ink-soft transition-colors hover:text-ink"
            >
              <BookOpen size={12} aria-hidden="true" />
              Sources ({node.sources.length}) — example fixtures
              <ChevronDown
                size={12}
                className={`transition-transform ${sourcesOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            {sourcesOpen && (
              <ul className="mt-2 space-y-2.5 rounded-xl border border-line bg-raised p-3">
                {node.sources.map((source) => (
                  <li key={source.id}>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                    >
                      {source.title}
                      <ExternalLink size={10} aria-hidden="true" />
                    </a>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                      {source.snippet}
                    </p>
                    {source.example && (
                      <span className="mt-0.5 block text-[10px] uppercase tracking-wide text-ink-faint">
                        Example source — reserved domain, fixture content
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <ActionRow>
          {variantCount > 1 && (
            <VariantNav
              index={index}
              count={variantCount}
              onPrev={() => switchSibling(node.id, -1)}
              onNext={() => switchSibling(node.id, 1)}
            />
          )}
          <CopyButton content={node.content} />
          <button
            type="button"
            aria-label="Good response"
            aria-pressed={node.feedback === 'up'}
            title="Good response (stored locally)"
            onClick={() => setFeedback(node.id, 'up')}
            className={`rounded-md p-1.5 transition-colors hover:bg-subtle ${
              node.feedback === 'up' ? 'text-accent' : 'text-ink-faint hover:text-ink'
            }`}
          >
            <ThumbsUp size={14} />
          </button>
          <button
            type="button"
            aria-label="Poor response"
            aria-pressed={node.feedback === 'down'}
            title="Poor response (stored locally)"
            onClick={() => setFeedback(node.id, 'down')}
            className={`rounded-md p-1.5 transition-colors hover:bg-subtle ${
              node.feedback === 'down' ? 'text-danger' : 'text-ink-faint hover:text-ink'
            }`}
          >
            <ThumbsDown size={14} />
          </button>
          {isLast && !streaming && (
            <button
              type="button"
              aria-label="Regenerate response"
              title="Regenerate response (creates a switchable variant)"
              onClick={() => void regenerate(node.id)}
              className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
            >
              <RotateCcw size={14} />
            </button>
          )}
          {!streaming && (
            <button
              type="button"
              aria-label="Delete response"
              title="Delete response and its replies in this branch"
              onClick={() => setConfirmingDelete(true)}
              className="rounded-md p-1.5 text-ink-faint transition-colors hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 size={14} />
            </button>
          )}
        </ActionRow>
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title="Delete this response?"
        body="This removes the response and everything that follows it in this branch. The rest of the conversation stays, and you can undo right after."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          setConfirmingDelete(false)
          deleteMessage(node.id)
        }}
      />
    </div>
  )
}
