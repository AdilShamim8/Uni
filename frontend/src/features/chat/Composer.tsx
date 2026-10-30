import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import { ArrowUp, FileText, FolderKanban, Paperclip, Square, X } from 'lucide-react'
import type { AttachmentMeta, ToolId } from '@/domain/types'
import { selectActiveModel, useAppStore } from '@/state/store'
import { useContextStore } from '@/state/contextStore'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'
import { IconButton } from '@/components/ui/IconButton'
import { Tooltip } from '@/components/ui/Tooltip'
import {
  humanSize,
  MAX_FILES,
  toAttachmentMeta,
  toPendingAttachment,
  validateFile,
  type PendingAttachment,
} from './attachments'
import {
  loadDraft,
  markUnmountFocused,
  saveDraft,
  takeUnmountWasFocused,
} from './composerDrafts'
import { shouldSubmit } from './sendKey'
import { ToolPicker } from './ToolPicker'
import { TOOL_REGISTRY } from './toolRegistry'

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

  // Honest status line: reflects whether this turn goes to a real endpoint
  // or the local demo adapter, and whether the chat is temporary.
  const isLive = useAppStore((state) => {
    const credential = state.activeProviderId
      ? state.credentials[state.activeProviderId]
      : undefined
    return (
      !!state.activeModelId &&
      credential?.status === 'connected' &&
      !!credential.apiKey
    )
  })
  const isTemporary = useAppStore((state) => {
    const conversation = state.activeConversationId
      ? state.conversations[state.activeConversationId]
      : null
    return conversation?.temporary ?? false
  })

  // Selected context count for the active conversation — the badge that
  // makes the Context button answer "what will this chat see?".
  const activeConversationId = useAppStore((state) => state.activeConversationId)
  const contextCount = useContextStore(
    (state) =>
      activeConversationId ? (state.selections[activeConversationId] ?? []).length : 0,
  )

  const isStreaming = useAppStore((state) => {
    const conversation = state.activeConversationId
      ? state.conversations[state.activeConversationId]
      : null
    const leaf = conversation?.activeLeafId
      ? conversation.nodes[conversation.activeLeafId]
      : null
    return leaf?.role === 'assistant' && leaf.status === 'streaming'
  })

  // Initialize from the draft map so a remount (e.g. the empty-state
  // composition ↔ conversation transition) restores the same draft
  // instead of silently clearing it.
  const [text, setText] = useState(() => loadDraft(useAppStore.getState().activeConversationId ?? 'new').text)
  const [pending, setPending] = useState<PendingAttachment[]>(
    () => loadDraft(useAppStore.getState().activeConversationId ?? 'new').pending,
  )
  const [errors, setErrors] = useState<string[]>([])
  const [tools, setTools] = useState<ToolId[]>(() =>
    loadDraft(useAppStore.getState().activeConversationId ?? 'new').tools,
  )
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingRef = useRef<PendingAttachment[]>([])
  const toolsRef = useRef<ToolId[]>([])
  const textRef = useRef('')

  // Which conversation this composer is currently writing into. '/' shows
  // the store's active conversation, so derive the key from whichever
  // conversation is actually being displayed.
  const draftKey = useAppStore((state) => state.activeConversationId ?? 'new')
  const draftKeyRef = useRef(draftKey)

  useEffect(() => {
    pendingRef.current = pending
  }, [pending])
  useEffect(() => {
    toolsRef.current = tools
  }, [tools])
  useEffect(() => {
    textRef.current = text
  }, [text])

  // Save the outgoing draft when the target conversation changes, then
  // load the incoming conversation's own draft. Drafts never mix.
  useEffect(() => {
    if (draftKeyRef.current === draftKey) return
    saveDraft(draftKeyRef.current, {
      text: textRef.current,
      tools: toolsRef.current,
      pending: pendingRef.current,
    })
    const next = loadDraft(draftKey)
    draftKeyRef.current = draftKey
    setText(next.text)
    setTools(next.tools)
    setPending(next.pending)
    setErrors([])
  }, [draftKey])

  // When the composer unmounts (e.g. navigating to Work), keep the draft
  // alive so it comes back on return. Only pruned entries lose their URLs.
  useEffect(() => {
    return () => {
      saveDraft(draftKeyRef.current, {
        text: textRef.current,
        tools: toolsRef.current,
        pending: pendingRef.current,
      })
    }
  }, [])

  // Focus continuity: capture whether the textarea was focused, restore it
  // on the next mount if it was (empty-state ↔ conversation transition).
  const focusedRef = useRef(false)
  useEffect(() => {
    if (takeUnmountWasFocused()) {
      textareaRef.current?.focus({ preventScroll: true })
    }
    const textarea = textareaRef.current
    const markFocused = () => {
      focusedRef.current = true
    }
    const markBlurred = () => {
      focusedRef.current = false
    }
    textarea?.addEventListener('focus', markFocused)
    textarea?.addEventListener('blur', markBlurred)
    return () => {
      textarea?.removeEventListener('focus', markFocused)
      textarea?.removeEventListener('blur', markBlurred)
      markUnmountFocused(focusedRef.current)
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
    // Snapshot exactly what is being submitted, then clear the composer
    // immediately. Clearing must never wait for the stream to finish —
    // anything typed while the reply streams belongs to the NEXT message
    // and must survive the turn's completion (audit D2).
    const submittedText = text
    const submittedPending = pending
    const submittedTools = tools
    const attachments: AttachmentMeta[] = submittedPending.map(toAttachmentMeta)
    setText('')
    setPending([])
    setErrors([])
    // Sync refs immediately: the empty-state → conversation transition can
    // unmount this composer before the text-sync effect runs, and the
    // unmount handler must not save the just-submitted text as a draft.
    textRef.current = ''
    pendingRef.current = []
    try {
      await sendMessage({ text: submittedText, attachments, tools: submittedTools })
    } finally {
      // Revoke only the object URLs that belonged to the submitted
      // payload — later drafts keep theirs.
      for (const attachment of submittedPending) {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
      }
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (shouldSubmit(event.nativeEvent, sendKey)) {
      event.preventDefault()
      void handleSend()
    }
  }

  return (
    <div className="mx-auto w-full max-w-column px-3 pb-[max(var(--pad-compose),env(safe-area-inset-bottom,0px))] pt-1 sm:px-4">
      {/* Attachment chips — with the honest capability statement (F12):
          general chat attachments are described by NAME ONLY; the model
          never receives their contents. The local CSV analyzer is the
          exception and reads the file on this device. */}
      {pending.length > 0 && (
        <div className="mb-2">
          <ul className="flex flex-wrap gap-2" aria-label="Attachments">
            {pending.map((attachment) => (
              <li
                key={attachment.id}
                className="relative flex items-center gap-2 rounded-group border border-line bg-raised py-1.5 pl-1.5 pr-7"
              >
                {attachment.previewUrl ? (
                  <img
                    src={attachment.previewUrl}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-[10px] object-cover"
                  />
                ) : (
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-subtle text-ink-faint">
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
          <p className="mt-1 text-[11px] leading-relaxed text-ink-faint">
            Names and sizes only — file contents are not sent to the model in this
            build. CSV analysis is the exception: it reads the selected file locally
            on this device.
          </p>
        </div>
      )}

      {/* Validation errors */}
      {errors.length > 0 && (
        <div
          role="alert"
          className="mb-2 flex items-start justify-between gap-3 rounded-group border border-danger bg-danger-soft px-3 py-2"
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

      {/* Input surface — solid, high-legibility, gently elevated. Focus
          strengthens the edge gently (border + soft ring); no layout shift. */}
      <div className="rounded-composer border border-line bg-raised shadow-[var(--shadow-composer)] transition-[border-color,box-shadow] duration-[var(--motion-fast)] focus-within:border-accent focus-within:shadow-composer focus-within:ring-[3px] focus-within:ring-[var(--c-focus-ring)]">
        {/* Selected tools */}
        {tools.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-5 pb-1 pt-4">
            {tools.map((tool) => {
              const definition = TOOL_REGISTRY.find((entry) => entry.id === tool)
              return (
                <span
                  key={tool}
                  className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-1 pl-2.5 pr-1 text-xs font-medium text-accent"
                >
                  {definition?.icon}
                  {definition?.label ?? tool}
                  <button
                    type="button"
                    aria-label={`Remove ${definition?.label ?? tool} tool`}
                    onClick={() => toggleTool(tool)}
                    className="rounded-full p-0.5 transition-colors hover:bg-accent/15"
                  >
                    <X size={11} />
                  </button>
                </span>
              )
            })}
          </div>
        )}

        <label htmlFor="composer-input" className="sr-only">
          Message Uni
        </label>
        <textarea
          id="composer-input"
          ref={textareaRef}
          rows={1}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Message Uni…"
          className="block max-h-[220px] w-full resize-none bg-transparent px-5 pb-2.5 pt-4 text-[16.5px] leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none"
        />

        {/* Action row — visually distinct from the writing area */}
        <div className="flex items-center gap-1 border-t border-line/60 px-3.5 pb-3 pt-2.5">
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
          <Tooltip label="Attach images or files (kept local)">
            <IconButton label="Attach files" onClick={() => fileInputRef.current?.click()}>
              <Paperclip size={17} />
            </IconButton>
          </Tooltip>

          <Tooltip label="Context — choose what this chat can see">
            <IconButton
              label="Context — choose what this chat can see"
              onClick={() =>
                useWorkspaceUiStore.getState().openInspector({ tab: 'context' })
              }
            >
              <span className="relative flex items-center justify-center">
                <FolderKanban size={17} />
                {contextCount > 0 && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-1.5 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-[3px] text-[9px] font-semibold leading-none text-accent-contrast"
                  >
                    {contextCount}
                  </span>
                )}
              </span>
            </IconButton>
          </Tooltip>

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
              className="press min-touch inline-flex h-10 w-10 items-center justify-center rounded-full bg-inverse text-ink-inverse transition-opacity hover:opacity-90"
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
              className={`press min-touch inline-flex h-10 w-10 items-center justify-center rounded-full transition-[background-color,color,opacity,transform] duration-[var(--motion-press)] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${
                canSend
                  ? 'bg-accent text-accent-contrast shadow-soft hover:bg-accent-strong'
                  : 'bg-subtle text-ink-faint'
              }`}
            >
              <ArrowUp size={18} />
            </button>
          )}
        </div>
      </div>

      <p
        className="mt-2 text-center text-[12px] leading-relaxed text-ink-faint"
        aria-live="polite"
      >
        {isTemporary && (
          <>
            Temporary chat — not saved to your history.
            {isLive && activeModel && (
              <> Chatting live with {activeModel.model.label}.</>
            )}
          </>
        )}
        {!isTemporary && isLive && activeModel && (
          <>
            Chatting live with <span className="font-medium text-ink-soft">{activeModel.model.label}</span>{' '}
            via {activeModel.provider.label} — your API key stays in this browser.
          </>
        )}
        {!isTemporary && !isLive && (
          <>
            Local demo — responses are simulated on this device and no provider is
            contacted. Configure your own in Settings.
          </>
        )}
      </p>
    </div>
  )
})
