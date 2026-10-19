import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { shouldSubmit } from '@/features/chat/sendKey'
import { useAppStore } from '@/state/store'
import { loadThreadDraft, saveThreadDraft } from './threadDrafts'

export interface ThreadComposerAction {
  id: string
  label: string
  icon?: ReactNode
  /** Invoked when the quick action is pressed (inserts text, opens UI…). */
  onRun: () => void
}

export interface ThreadComposerHandle {
  focus: () => void
  setText: (text: string) => void
}

export interface ThreadComposerProps {
  /** Draft key — drafts are preserved per thread and per mode. */
  draftKey: string
  textareaId: string
  ariaLabel: string
  placeholder: string
  /** Honest status line under the composer (aria-live). */
  statusLabel: ReactNode
  onSend: (text: string) => void
  /** When set, renders Stop instead of Send. */
  busy?: boolean
  onStop?: () => void
  /** Quick actions (employee commands, work affordances). */
  actions?: ThreadComposerAction[]
  /** Slot for plugin chips / pickers (plugins milestone). */
  leadingSlot?: ReactNode
  disabled?: boolean
  disabledHint?: string
}

/**
 * Purpose-aware composer for Work and employee threads — the same visual
 * language and key handling as the chat composer, but bound to the surface
 * that owns it. Drafts persist per thread key and survive mode switches.
 */
export const ThreadComposer = forwardRef<ThreadComposerHandle, ThreadComposerProps>(
  function ThreadComposer(
    {
      draftKey,
      textareaId,
      ariaLabel,
      placeholder,
      statusLabel,
      onSend,
      busy = false,
      onStop,
      actions,
      leadingSlot,
      disabled = false,
      disabledHint,
    },
    ref,
  ) {
    const sendKey = useAppStore((state) => state.preferences.sendKey)
    const [text, setText] = useState(() => loadThreadDraft(draftKey))
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const textRef = useRef(text)
    const draftKeyRef = useRef(draftKey)

    useEffect(() => {
      textRef.current = text
    }, [text])

    // Save the outgoing draft when the thread changes; load the incoming
    // thread's own draft. Drafts never mix across threads or modes.
    useEffect(() => {
      if (draftKeyRef.current === draftKey) return
      saveThreadDraft(draftKeyRef.current, textRef.current)
      draftKeyRef.current = draftKey
      const next = loadThreadDraft(draftKey)
      textRef.current = next
      setText(next)
    }, [draftKey])

    // Persist on unmount so a draft survives navigation.
    useEffect(() => {
      return () => {
        saveThreadDraft(draftKeyRef.current, textRef.current)
      }
    }, [])

    // Auto-grow up to a comfortable maximum.
    useEffect(() => {
      const element = textareaRef.current
      if (!element) return
      element.style.height = '0px'
      element.style.height = `${Math.min(element.scrollHeight, 220)}px`
    }, [text])

    useImperativeHandle(ref, () => ({
      focus: () => textareaRef.current?.focus(),
      setText: (value: string) => {
        setText(value)
        textareaRef.current?.focus()
      },
    }))

    const canSend = text.trim().length > 0 && !busy && !disabled

    function handleSend() {
      if (!canSend) return
      const submitted = text
      // Sync the ref before state so an unmounting composer cannot save the
      // just-submitted text back as a draft (same discipline as chat).
      textRef.current = ''
      setText('')
      saveThreadDraft(draftKey, '')
      onSend(submitted)
    }

    function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
      if (shouldSubmit(event.nativeEvent, sendKey)) {
        event.preventDefault()
        handleSend()
      }
    }

    return (
      <div className="mx-auto w-full max-w-column px-3 pb-[max(var(--pad-compose),env(safe-area-inset-bottom,0px))] pt-1 sm:px-4">
        {actions && actions.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5" aria-label="Quick actions">
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                onClick={action.onRun}
                className="min-touch inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-3 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-subtle hover:text-ink"
              >
                {action.icon}
                {action.label}
              </button>
            ))}
          </div>
        )}

        <div
          className={`rounded-composer border bg-raised shadow-[var(--shadow-composer)] transition-[border-color,box-shadow] duration-[var(--motion-fast)] focus-within:border-accent focus-within:shadow-composer focus-within:ring-[3px] focus-within:ring-[var(--c-focus-ring)] ${
            disabled ? 'border-line opacity-70' : 'border-line'
          }`}
        >
          <label htmlFor={textareaId} className="sr-only">
            {ariaLabel}
          </label>
          <textarea
            id={textareaId}
            ref={textareaRef}
            rows={1}
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? disabledHint ?? placeholder : placeholder}
            disabled={disabled}
            aria-label={ariaLabel}
            className="block max-h-[220px] w-full resize-none bg-transparent px-5 pb-2.5 pt-4 text-[16.5px] leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none disabled:cursor-not-allowed"
          />

          <div className="flex items-center gap-1 border-t border-line/60 px-3.5 pb-3 pt-2.5">
            {leadingSlot}
            <div className="flex-1" />
            {busy ? (
              <button
                type="button"
                aria-label="Stop"
                title="Stop"
                onClick={onStop}
                className="press min-touch inline-flex h-10 w-10 items-center justify-center rounded-full bg-inverse text-ink-inverse transition-opacity hover:opacity-90"
              >
                <Square size={13} fill="currentColor" />
              </button>
            ) : (
              <button
                type="button"
                aria-label="Send"
                title="Send"
                disabled={!canSend}
                onClick={handleSend}
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

        <p className="mt-2 text-center text-[12px] leading-relaxed text-ink-faint" aria-live="polite">
          {statusLabel}
        </p>
      </div>
    )
  },
)
