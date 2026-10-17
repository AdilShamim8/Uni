import { useState } from 'react'
import {
  Archive,
  ArchiveRestore,
  Download,
  MoreHorizontal,
  PencilLine,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react'
import type { Conversation } from '@/domain/types'
import { useAppStore } from '@/state/store'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { TextField } from '@/components/ui/TextField'
import { Badge, Tooltip } from '@/components/ui/Tooltip'
import { conversationToMarkdown, downloadText, slugifyTitle } from './exportUtils'

export interface ConversationListItemProps {
  conversation: Conversation
  active: boolean
  onSelect: (id: string) => void
}

export function ConversationListItem({ conversation, active, onSelect }: ConversationListItemProps) {
  const renameConversation = useAppStore((state) => state.renameConversation)
  const togglePin = useAppStore((state) => state.togglePin)
  const toggleArchive = useAppStore((state) => state.toggleArchive)
  const deleteConversation = useAppStore((state) => state.deleteConversation)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState(conversation.title)

  function handleExport() {
    downloadText(
      `universe-${slugifyTitle(conversation.title)}.md`,
      conversationToMarkdown(conversation),
    )
  }

  return (
    <div
      className={`group relative flex items-center rounded-[10px] ${
        active ? 'bg-accent-soft' : 'hover:bg-subtle'
      }`}
    >
      <button
        type="button"
        onClick={() => onSelect(conversation.id)}
        aria-current={active ? 'page' : undefined}
        className={`flex min-w-0 flex-1 items-center gap-2 py-[var(--pad-list-item)] pl-3 pr-1 text-left text-sm transition-colors ${
          active ? 'font-medium text-accent' : 'text-ink'
        }`}
      >
        <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
        {conversation.pinned && (
          <Pin size={12} aria-label="Pinned" className="shrink-0 text-ink-faint" />
        )}
        {conversation.temporary && (
          <Tooltip label="Temporary — not saved">
            <Badge tone="accent">Temp</Badge>
          </Tooltip>
        )}
      </button>

      <div className={`mr-1 shrink-0 ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'}`}>
        <Menu
          label={`${conversation.title} actions`}
          trigger={
            <IconButton label={`${conversation.title} — conversation actions`} size="sm">
              <MoreHorizontal size={15} />
            </IconButton>
          }
        >
          <MenuItem icon={<PencilLine size={15} />} onClick={() => {
            setDraftTitle(conversation.title)
            setRenameOpen(true)
          }}>
            Rename
          </MenuItem>
          <MenuItem
            icon={conversation.pinned ? <PinOff size={15} /> : <Pin size={15} />}
            onClick={() => togglePin(conversation.id)}
          >
            {conversation.pinned ? 'Unpin' : 'Pin'}
          </MenuItem>
          <MenuItem
            icon={conversation.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
            onClick={() => toggleArchive(conversation.id)}
          >
            {conversation.archived ? 'Unarchive' : 'Archive'}
          </MenuItem>
          <MenuItem icon={<Download size={15} />} onClick={handleExport}>
            Export as Markdown
          </MenuItem>
          <MenuItem
            icon={<Trash2 size={15} />}
            danger
            onClick={() => setDeleteOpen(true)}
          >
            Delete
          </MenuItem>
        </Menu>
      </div>

      <Dialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Rename conversation"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!draftTitle.trim()}
              onClick={() => {
                renameConversation(conversation.id, draftTitle)
                setRenameOpen(false)
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <TextField
          label="Title"
          value={draftTitle}
          onChange={(event) => setDraftTitle(event.target.value)}
          autoFocus
        />
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete conversation?"
        body={`“${conversation.title}” will be removed from this device. You can undo for a few seconds afterwards. Temporary conversations cannot be recovered once deleted.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteConversation(conversation.id)}
      />
    </div>
  )
}
