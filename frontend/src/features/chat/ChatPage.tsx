import { useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { activePath } from '@/domain/conversationTree'
import type { MessageNode } from '@/domain/types'
import { useAppStore } from '@/state/store'
import { TopBar } from './TopBar'
import { EmptyState } from './EmptyState'

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
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {path.length === 0 ? (
          <EmptyState />
        ) : (
          <SimpleTranscript path={path} />
        )}
      </div>
    </div>
  )
}
