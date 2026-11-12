import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Loader2, RefreshCw } from 'lucide-react'
import { useServerSessionStore } from '@/state/serverSessionStore'
import { ServerTranscript } from './ServerTranscript'
import { ServerChatComposer } from './ServerChatComposer'
import { IconButton } from '@/components/ui/IconButton'
import { Tooltip } from '@/components/ui/Tooltip'

/**
 * The unified Chat surface in server mode (Phase B): the signed-in
 * account's server conversations — server-owned trees, server-side
 * runs, streamed replies — inside the same shell as local chats.
 *
 * The Account section keeps its full B02–B03 journey (providers,
 * import, read-only list); this surface is the everyday reading and
 * writing experience for an already-signed-in session. Honest states
 * throughout: signed-out prompts sign-in, no conversations prompts the
 * first one, load failures offer a retry.
 */
export function ServerChatPage() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const status = useServerSessionStore((state) => state.status)
  const conversations = useServerSessionStore((state) => state.conversations)
  const conversationsLoading = useServerSessionStore((state) => state.conversationsLoading)
  const openConversation = useServerSessionStore((state) => state.openConversation)
  const openConversationId = useServerSessionStore((state) => state.openConversationId)
  const openConversationLoading = useServerSessionStore(
    (state) => state.openConversationLoading,
  )
  const error = useServerSessionStore((state) => state.error)
  const loadConversations = useServerSessionStore((state) => state.loadConversations)
  const openServerConversation = useServerSessionStore((state) => state.openServerConversation)
  const newServerConversation = useServerSessionStore((state) => state.newServerConversation)
  const [creating, setCreating] = useState(false)

  // Load the conversation list and the server providers (the
  // destination picker's data — N004) when the session is signed in.
  const loadServerProviders = useServerSessionStore((state) => state.loadServerProviders)
  useEffect(() => {
    if (status === 'signed-in') {
      void loadConversations()
      void loadServerProviders()
    }
  }, [status, loadConversations, loadServerProviders])

  // Route → open conversation. A URL with an unknown id falls back to
  // the index view (never an automatic fallback to another account's
  // data — the fetch is workspace-scoped and 404s honestly).
  useEffect(() => {
    if (status !== 'signed-in') return
    if (conversationId && conversationId !== openConversationId) {
      void openServerConversation(conversationId)
    }
    if (!conversationId && openConversationId) {
      void openServerConversation(null)
    }
  }, [conversationId, openConversationId, status, openServerConversation])

  const serverConversationId = openConversation?.id ?? null
  useEffect(() => {
    // After the detail loads, normalize the URL so reload/share works.
    if (conversationId && serverConversationId && conversationId === serverConversationId) {
      if (window.location.pathname !== `/sc/${serverConversationId}`) {
        navigate(`/sc/${serverConversationId}`, { replace: true })
      }
    }
  }, [conversationId, serverConversationId, navigate])

  const hasConversations = useMemo(
    () => conversations.length > 0,
    [conversations],
  )

  /* ---------------- Signed out ---------------- */
  if (status !== 'signed-in') {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h2 className="text-[17px] font-semibold text-ink">Server chats need an account</h2>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
            Sign in to run chats on your Uni server: the conversation tree, provider
            credentials, and model runs live server-side. Your local chats and keys stay
            in this browser — switching to the Local tab keeps them untouched.
          </p>
          <button
            type="button"
            onClick={() => useServerSessionStore.getState().initialize()}
            className="press mt-4 inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2 text-[14px] font-medium text-accent-contrast hover:bg-accent-strong"
          >
            Check again
          </button>
        </div>
      </div>
    )
  }

  /* ---------------- Index (no conversation selected) ---------------- */
  if (!openConversation) {
    return (
      <div className="flex h-full min-h-0 flex-col overflow-y-auto">
        <div className="mx-auto w-full max-w-column px-3.5 py-10 sm:px-4">
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">
            Server chats
          </h1>
          <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
            Conversations that execute on your Uni server — the tree, provider keys, and
            runs are stored server-side and stream back to this page.
          </p>

          {conversationsLoading && (
            <p className="mt-6 flex items-center gap-2 text-[14px] text-ink-faint">
              <Loader2 size={15} className="animate-spin" aria-hidden="true" />
              Loading your conversations…
            </p>
          )}

          {!conversationsLoading && !hasConversations && (
            <div className="mt-6 rounded-group border border-line bg-panel p-5 text-center">
              <p className="text-[14px] text-ink-soft">No server conversations yet.</p>
              <button
                type="button"
                disabled={creating}
                onClick={async () => {
                  setCreating(true)
                  const id = await newServerConversation('Server chat')
                  setCreating(false)
                  if (id) navigate(`/sc/${id}`)
                }}
                className="press mt-3 inline-flex items-center gap-2 rounded-control bg-accent px-4 py-2 text-[14px] font-medium text-accent-contrast hover:bg-accent-strong disabled:opacity-60"
              >
                {creating ? 'Creating…' : 'Start the first one'}
              </button>
            </div>
          )}

          {!conversationsLoading && hasConversations && (
            <ul className="mt-5 flex flex-col gap-1" aria-label="Server conversations">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/sc/${conversation.id}`)}
                    className="flex min-touch w-full items-center gap-2.5 rounded-control px-3 py-2.5 text-left transition-colors hover:bg-[var(--c-hover-wash)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">
                        {conversation.title}
                      </span>
                      <span className="block text-[12px] text-ink-faint">
                        {conversation.messageCount} messages
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <p role="alert" className="mt-4 rounded-control bg-danger/10 px-3 py-2 text-[13px] text-danger">
              {error}
            </p>
          )}
        </div>
      </div>
    )
  }

  /* ---------------- Open conversation ---------------- */
  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Slim thread header: title + honest refresh */}
      <div className="mx-auto flex w-full max-w-column items-center gap-2 px-3.5 pb-1 pt-3 sm:px-4">
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-ink">
          {openConversation.title}
        </h1>
        <Tooltip label="Reload this conversation from the server">
          <IconButton
            label="Reload conversation"
            onClick={() => void openServerConversation(openConversation.id)}
          >
            <RefreshCw size={16} className={openConversationLoading ? 'animate-spin' : undefined} />
          </IconButton>
        </Tooltip>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <ServerTranscript detail={openConversation} />
      </div>

      <ServerChatComposer conversationId={openConversation.id} />
    </div>
  )
}
