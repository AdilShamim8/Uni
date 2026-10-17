import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { activePath } from '@/domain/conversationTree'
import type { MessageNode } from '@/domain/types'
import { useAppStore } from '@/state/store'
import { TopBar } from './TopBar'
import { EmptyState } from './EmptyState'
import { Composer, type ComposerHandle } from './Composer'

/**
 * Plain-text transcript used while the rich message renderer lands in the
 * next commits. Replaced by the full MessageList.
 */
function SimpleTranscript({ path }: { path: MessageNode[] }) {
  return (
    <div className="mx-auto w-full max-w-column px-4 py-6">
      {path.map((node) => (
        <div key={node.id} className="border-b border-line py-4 last:border-b-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            {node.role === 'user' ? 'You' : 'Universe (demo)'}
          </p>
          <p className="mt-1.5 whitespace-pre-wrap leading-relaxed text-ink">
            {node.content || (node.status === 'streaming' ? '…' : '')}
          </p>
        </div>
      ))}
    </div>
  )
}

export function ChatPage() {
  const { conversationId } = useParams()
  const navigate = useNavigate()
  const conversations = useAppStore((state) => state.conversations)
  const selectConversation = useAppStore((state) => state.selectConversation)

  const conversation = conversationId ? conversations[conversationId] : null
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

  const path = useMemo(() => (conversation ? activePath(conversation) : []), [conversation])

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
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {path.length === 0 ? (
            <EmptyState
              onSuggestion={(text) => {
                composerRef.current?.setText(text)
              }}
            />
          ) : (
            <SimpleTranscript path={path} />
          )}
        </div>
        <Composer ref={composerRef} />

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
