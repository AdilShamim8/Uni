import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { ArrowUp, FileText, Paperclip, Square, X } from 'lucide-react'
import type { AttachmentMeta, ToolId } from '@/domain/types'
import { selectActiveModel, useAppStore } from '@/state/store'
import { IconButton } from '@/components/ui/IconButton'
import {
  humanSize,
  MAX_FILES,
  toAttachmentMeta,
  toPendingAttachment,
  validateFile,
  type PendingAttachment,
} from './attachments'
import { shouldSubmit } from './sendKey'
import { ToolPicker } from './ToolPicker'

export interface ComposerHandle {
  addFiles: (files: File[]) => void
  focus: () => void
  setText: (text: string) => void
}

export const Composer = forwardRef<ComposerHandle>(function Composer(_props, ref) {
  const sendKey = useAppStore((state) => state.preferences.sendKey)
  const sendMessage = useAppStore((state) => state.sendMessage)
  const stopGeneration = useAppStore((state) => state.stopGeneration)
  const activeModel = useAppStore(selectActiveModel)

  const isStreaming = useAppStore((state) => {
    const conversation = state.activeConversationId
      ? state.conversations[state.activeConversationId]
      : null
    const leaf = conversation?.activeLeafId
      ? conversation.nodes[conversation.activeLeafId]
      : null
    return leaf?.role === 'assistant' && leaf.status === 'streaming'
  })

  const [text, setText] = useState('')
  const [pending, setPending] = useState<PendingAttachment[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [tools, setTools] = useState<ToolId[]>([])
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingRef = useRef<PendingAttachment[]>([])

  useEffect(() => {
    pendingRef.current = pending
  }, [pending])

  // Release object URLs when the composer unmounts.
  useEffect(() => {
    return () => {
      for (const attachment of pendingRef.current) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
      }
    }
  }, [])

  // Auto-grow the textarea up to a comfortable maximum.
  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`
  }, [text])

  useImperativeHandle(ref, () => ({
    addFiles: (files: File[]) => addFiles(files),
    focus: () => textareaRef.current?.focus(),
    setText: (value: string) => {
      setText(value)
      textareaRef.current?.focus()
    },
  }))

  const canSend = (text.trim().length > 0 || pending.length > 0) && !isStreaming

  function addFiles(files: File[]) {
    const nextErrors: string[] = []
    const accepted: PendingAttachment[] = []
    for (const file of files) {
      const reason = validateFile(file)
      if (reason) {
        nextErrors.push(`${file.name} — ${reason}`)
        continue
      }
      if (pending.length + accepted.length >= MAX_FILES) {
        nextErrors.push(`${file.name} — only ${MAX_FILES} attachments per message`)
        continue
      }
      accepted.push(toPendingAttachment(file))
    }
    if (accepted.length > 0) {
      setPending((previous) => [...previous, ...accepted])
    }
    setErrors(nextErrors)
  }

  function removeAttachment(id: string) {
    setPending((previous) => {
      const target = previous.find((attachment) => attachment.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return previous.filter((attachment) => attachment.id !== id)
    })
  }

  function toggleTool(tool: ToolId) {
    setTools((previous) =>
      previous.includes(tool) ? previous.filter((item) => item !== tool) : [...previous, tool],
    )
  }

  async function handleSend() {
    if (!canSend) return
    const attachments: AttachmentMeta[] = pending.map(toAttachmentMeta)
    try {
      await sendMessage({ text, attachments, tools })
    } finally {
      for (const attachment of pending) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
      }
      setText('')
      setPending([])
      setErrors([])
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (shouldSubmit(event.nativeEvent, sendKey)) {
      event.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="mx-auto w-full max-w-column px-3 pb-3 pt-1 sm:px-4 sm:pb-4">
      {/* Attachment chips */}
      {pending.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-2" aria-label="Attachments">
          {pending.map((attachment) => (
            <li
              key={attachment.id}
              className="relative flex items-center gap-2 rounded-xl border border-line bg-raised py-1.5 pl-1.5 pr-7"
            >
              {attachment.previewUrl ? (
                <img
                  src={attachment.previewUrl}
                  alt=""
                  className="h-9 w-9 shrink-0 rounded-lg object-cover"
                />
              ) : (
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-subtle text-ink-faint">
                  <FileText size={16} />
                </span>
              )}
              <span className="max-w-[9rem]">
                <span className="block truncate text-xs font-medium text-ink">
                  {attachment.name}
                </span>
                <span className="block text-[11px] text-ink-faint">
                  {humanSize(attachment.size)}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${attachment.name}`}
                onClick={() => removeAttachment(attachment.id)}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
              >
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Validation errors */}
      {errors.length > 0 && (
        <div
          role="alert"
          className="mb-2 flex items-start justify-between gap-3 rounded-xl border border-danger bg-danger-soft px-3 py-2"
        >
          <ul className="min-w-0">
            {errors.map((error) => (
              <li key={error} className="text-xs leading-relaxed text-danger">
                {error}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setErrors([])}
            className="shrink-0 rounded-md p-1 text-danger hover:opacity-70"
            aria-label="Dismiss attachment errors"
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Input area */}
      <div className="rounded-2xl border border-line bg-raised shadow-soft transition-colors focus-within:border-accent">
        <label htmlFor="composer-input" className="sr-only">
          Message Universe
        </label>
        <textarea
          id="composer-input"
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Universe…"
          className="block max-h-[220px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <div className="flex items-center gap-1.5 px-2.5 pb-2.5 pt-1">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".png,.jpg,.jpeg,.gif,.webp,.txt,.md,.csv,.json,.pdf"
            aria-label="Attach files"
            className="hidden"
            onChange={(event) => {
              addFiles(Array.from(event.target.files ?? []))
              event.target.value = ''
            }}
          />
          <IconButton label="Attach files" onClick={() => fileInputRef.current?.click()}>
            <Paperclip size={17} />
          </IconButton>

          <ToolPicker
            selected={tools}
            onToggle={toggleTool}
            capabilities={activeModel?.model.capabilities ?? ['chat']}
          />

          <div className="flex-1" />

          {isStreaming ? (
            <button
              type="button"
              aria-label="Stop generating"
              title="Stop generating"
              onClick={stopGeneration}
              className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] bg-inverse text-ink-inverse transition-opacity hover:opacity-90"
            >
              <Square size={13} fill="currentColor" />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Send message"
              title="Send message"
              disabled={!canSend}
              onClick={() => void handleSend()}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                canSend
                  ? 'bg-accent text-ink-inverse hover:bg-accent-strong'
                  : 'bg-subtle text-ink-faint'
              }`}
            >
              <ArrowUp size={17} />
            </button>
          )}
        </div>
      </div>

      <p className="mt-2 text-center text-[11px] leading-relaxed text-ink-faint">
        Local demo — responses are simulated on this device, attachments are not
        analyzed, and no provider is contacted.
      </p>
    </div>
  )
})
