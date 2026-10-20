import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppStore } from '@/state/store'
import { TopBar } from './TopBar'
import { WelcomeHeading, StarterRow, ProviderHint } from './EmptyState'
import { EmptyRecents } from './EmptyRecents'
import { MessageList } from './MessageList'
import { Composer, type ComposerHandle } from './Composer'
import { ThreadPluginBar } from '@/features/plugins/ThreadPluginBar'
import { ChatReceiptStrip } from '@/features/plugins/ChatReceiptStrip'
import type { PluginThreadRef } from '@/domain/pluginTypes'

export function ChatPage() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const conversations = useAppStore((state) => state.conversations)
  const selectConversation = useAppStore((state) => state.selectConversation)
  const storeActiveConversation = useAppStore((state) =>
    state.activeConversationId ? state.conversations[state.activeConversationId] : null,
  )

  // Display priority: the routed conversation when one is selected;
  // otherwise the store's active conversation (so sending from "/" shows
  // the transcript without a URL change, and browser Back still works).
  const conversation = conversationId
    ? (conversations[conversationId] ?? null)
    : storeActiveConversation
  const composerRef = useRef<ComposerHandle>(null)
  const [dragging, setDragging] = useState(false)

  // Route drives store selection (sidebar highlight, composer target).
  useEffect(() => {
    if (conversationId) {
      if (conversations[conversationId]) {
        if (useAppStore.getState().activeConversationId !== conversationId) {
          selectConversation(conversationId)
        }
      } else {
        navigate('/', { replace: true })
      }
    }
    // When the route is "/", the store keeps its current selection so the
    // sidebar highlight survives; ChatPage simply renders the empty state.
  }, [conversationId, conversations, navigate, selectConversation])

  const hasMessages = useMemo(
    () => !!conversation && Object.keys(conversation.nodes).length > 0,
    [conversation],
  )

  // Plugin scope for this surface (m07/F09): ordinary chats get a
  // conversation-scoped thread; an employee conversation opened through
  // a chat route keeps its agent identity, access rules, and receipts.
  const pluginThread = useMemo<PluginThreadRef | null>(() => {
    if (!conversation) return null
    if (conversation.agentId) {
      return { kind: 'agent', agentId: conversation.agentId, conversationId: conversation.id }
    }
    return { kind: 'chat', conversationId: conversation.id, temporary: conversation.temporary }
  }, [conversation])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar />
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('Files')) {
            event.preventDefault()
            setDragging(true)
          }
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setDragging(false)
          }
        }}
        onDrop={(event) => {
          if (event.dataTransfer.files.length > 0) {
            event.preventDefault()
            composerRef.current?.addFiles(Array.from(event.dataTransfer.files))
          }
          setDragging(false)
        }}
      >
        {/* One composer instance, position-stable via key: the empty chat
            scrolls greeting → composer → starters → recents as a single
            centered composition; a populated conversation pins the composer
            below the transcript. The textarea never remounts, so focus,
            IME composition, and drafts survive the transition. The static
            welcome wash renders only in the empty state — it disappears
            entirely in reading views. */}
        <div
          className={`flex min-h-0 flex-1 flex-col ${
            hasMessages ? 'overflow-hidden' : 'welcome-wash overflow-y-auto'
          }`}
        >
          {!hasMessages && (
            <div key="empty" className="mx-auto w-full max-w-column px-3.5 sm:px-4">
              <WelcomeHeading />
            </div>
          )}
          {hasMessages && conversation && (
            <MessageList key={conversation.id} conversation={conversation} />
          )}
          <Composer key="composer" ref={composerRef} />
          {pluginThread && (
            <div className="pb-1">
              <ChatReceiptStrip thread={pluginThread} />
              <ThreadPluginBar
                thread={pluginThread}
                agentId={conversation?.agentId ?? null}
              />
            </div>
          )}
          {!hasMessages && (
            <div key="starters" className="mx-auto w-full max-w-column px-3.5 pb-10 sm:px-4">
              <StarterRow
                onSuggestion={(text) => {
                  composerRef.current?.setText(text)
                }}
              />
              <ProviderHint />
              <EmptyRecents />
            </div>
          )}
        </div>

        {dragging && (
          <div
            className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent bg-accent-soft"
            aria-hidden="true"
          >
            <p className="rounded-xl bg-raised px-4 py-2 text-sm font-medium text-accent shadow-soft">
              Drop files to attach (kept local, not analyzed)
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
