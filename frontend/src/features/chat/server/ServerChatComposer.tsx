import { useEffect, useRef, useState } from 'react'
import { ArrowUp, ShieldCheck, Square } from 'lucide-react'
import { useServerSessionStore } from '@/state/serverSessionStore'
import { useAppStore } from '@/state/store'
import { ServerDestinationPicker } from './ServerDestinationPicker'
import { shouldSubmit } from '../sendKey'

/**
 * The server-chat composer for the unified Chat surface (Phase B):
 * the same visual language as the local composer, wired to server
 * semantics — the explicit destination (N004) above the input, honest
 * unavailable states (never a silent fallback), Stop for the live run,
 * and the server-execution disclosure.
 */
export function ServerChatComposer({ conversationId }: { conversationId: string }) {
  const sendServerMessage = useServerSessionStore((state) => state.sendServerMessage)
  const stopActiveServerRun = useServerSessionStore((state) => state.stopActiveServerRun)
  const activeRun = useServerSessionStore((state) => state.activeRun)
  const runError = useServerSessionStore((state) => state.runError)
  const serverProviders = useServerSessionStore((state) => state.serverProviders)
  const sendKey = useAppStore((state) => state.preferences.sendKey)

  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const draftRef = useRef('')
  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  const runIsLive =
    activeRun !== null &&
    activeRun.conversationId === conversationId &&
    (activeRun.status === 'running' || activeRun.status === 'cancelling')

  // Auto-grow the textarea up to a comfortable maximum.
  useEffect(() => {
    const element = textareaRef.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${Math.min(element.scrollHeight, 220)}px`
  }, [draft])

  const canSend = draft.trim().length > 0 && !sending && !runIsLive

  async function send() {
    const text = draftRef.current.trim()
    if (!text || sending || runIsLive) return
    setSending(true)
    setDraft('')
    await sendServerMessage(text)
    setSending(false)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (shouldSubmit(event.nativeEvent, sendKey)) {
      event.preventDefault()
      void send()
    }
  }

  const usableProviders = serverProviders.filter(
    (provider) => provider.credential.present || provider.authMode === 'none',
  )

  return (
    <div className="mx-auto w-full max-w-column px-3 pb-[max(var(--pad-compose),env(safe-area-inset-bottom,0px))] pt-1 sm:px-4">
      {/* The explicit destination (N004/N010/N011) — same semantics as
          the Account surface, above the input it governs. */}
      <div className="mb-2">
        <ServerDestinationPicker disabled={runIsLive} />
      </div>

      <div className="rounded-composer border border-line bg-raised shadow-[var(--shadow-composer)] transition-[border-color,box-shadow] duration-[var(--motion-fast)] focus-within:border-accent focus-within:shadow-composer focus-within:ring-[3px] focus-within:ring-[var(--c-focus-ring)]">
        <label htmlFor="server-composer-input" className="sr-only">
          Message Uni on this server
        </label>
        <textarea
          id="server-composer-input"
          ref={textareaRef}
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            usableProviders.length === 0
              ? 'Add a server provider in Settings → Account first…'
              : 'Message runs on your Uni server…'
          }
          className="block max-h-[220px] w-full resize-none bg-transparent px-5 pb-2.5 pt-4 text-[16.5px] leading-relaxed text-ink placeholder:text-ink-faint focus:outline-none"
        />

        {/* Action row — visually distinct from the writing area */}
        <div className="flex items-center gap-1 border-t border-line/60 px-3.5 pb-3 pt-2.5">
          <span className="flex items-center gap-1.5 pl-1.5 text-[12px] text-ink-faint">
            <ShieldCheck size={14} aria-hidden="true" />
            Server execution
          </span>
          <div className="flex-1" />
          {runIsLive ? (
            <button
              type="button"
              aria-label="Stop generating"
              title="Stop generating"
              onClick={() => void stopActiveServerRun()}
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
              onClick={() => void send()}
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

      {runError && (
        <p
          role="alert"
          className="mt-2 rounded-control bg-danger/10 px-3 py-2 text-center text-[12.5px] text-danger"
        >
          {runError}
        </p>
      )}
    </div>
  )
}
