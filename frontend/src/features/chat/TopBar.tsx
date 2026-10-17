import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  Check,
  ChevronDown,
  Ghost,
  Link2,
  Menu as MenuIcon,
  MoreHorizontal,
  PencilLine,
  Pin,
  PinOff,
  Trash2,
  Download,
  Zap,
} from 'lucide-react'
import { useAppStore, selectActiveConversation, selectActiveModel } from '@/state/store'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { IconButton } from '@/components/ui/IconButton'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { TextField } from '@/components/ui/TextField'
import { Badge, Tooltip } from '@/components/ui/Tooltip'
import { conversationToMarkdown, downloadText, slugifyTitle } from './exportUtils'

export function TopBar() {
  const navigate = useNavigate()
  const conversation = useAppStore(selectActiveConversation)
  const activeModel = useAppStore(selectActiveModel)
  const providers = useAppStore((state) => state.providers)
  const activeProviderId = useAppStore((state) => state.activeProviderId)
  const activeModelId = useAppStore((state) => state.activeModelId)
  const credentials = useAppStore((state) => state.credentials)
  const liveProviderIds = new Set(
    Object.entries(credentials)
      .filter(([, credential]) => credential.status === 'connected')
      .map(([id]) => id),
  )
  const liveActive = !!activeProviderId && liveProviderIds.has(activeProviderId)
  const setActiveModel = useAppStore((state) => state.setActiveModel)
  const setUi = useAppStore((state) => state.setUi)
  const setTemporary = useAppStore((state) => state.setTemporary)
  const renameConversation = useAppStore((state) => state.renameConversation)
  const togglePin = useAppStore((state) => state.togglePin)
  const toggleArchive = useAppStore((state) => state.toggleArchive)
  const deleteConversation = useAppStore((state) => state.deleteConversation)
  const showToast = useAppStore((state) => state.showToast)

  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')

  function handleTemporaryToggle() {
    const state = useAppStore.getState()
    const id = state.activeConversationId
    if (!id || !state.conversations[id]) {
      const newId = state.newConversation({ temporary: true })
      navigate(`/c/${newId}`)
      return
    }
    setTemporary(id, !state.conversations[id].temporary)
  }

  function handleExport() {
    if (!conversation) return
    downloadText(
      `universe-${slugifyTitle(conversation.title)}.md`,
      conversationToMarkdown(conversation),
    )
    showToast('Conversation exported as Markdown')
  }

  function handleSharedLink() {
    showToast(
      'Shared links are unavailable in this local prototype — try “Export as Markdown” instead.',
    )
  }

  return (
    <header className="material safe-left safe-right sticky top-0 z-30 flex h-13 shrink-0 items-center gap-2 border-b border-line bg-mat-header px-2 sm:px-4">
      <div className="lg:hidden">
        <IconButton label="Open navigation" onClick={() => setUi({ mobileSidebarOpen: true })}>
          <MenuIcon size={18} />
        </IconButton>
      </div>

      {/* Provider / model picker — shows selection, provider context, and status */}
      <Menu
        width="w-72"
        label="Select provider and model"
        trigger={
          <button
            type="button"
            className="flex min-touch items-center gap-2 rounded-control px-2.5 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-[var(--c-hover-wash)]"
          >
            <span className="max-w-[9rem] truncate">
              {activeModel?.model.label ?? 'Select model'}
            </span>
            {activeModel && (
              <span className="hidden max-w-[8rem] truncate text-xs font-normal text-ink-faint sm:inline">
                {activeModel.provider.label}
              </span>
            )}
            <ChevronDown size={14} className="shrink-0 text-ink-faint" />
          </button>
        }
      >
        {providers.length === 0 && (
          <p className="px-2.5 py-2 text-sm text-ink-faint">
            No provider profiles configured yet.
          </p>
        )}
        {providers.map((provider) => {
          const connected = liveProviderIds.has(provider.id)
          return (
            <div key={provider.id}>
              <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                {connected && (
                  <span
                    aria-label="Connected"
                    className="inline-block h-[7px] w-[7px] shrink-0 rounded-full bg-success"
                  />
                )}
                {provider.label}
                {connected ? (
                  <span className="font-medium normal-case tracking-normal text-success">
                    · live
                  </span>
                ) : (
                  provider.demo && (
                    <span className="font-medium normal-case tracking-normal">· demo</span>
                  )
                )}
              </p>
              {provider.models.length === 0 && (
                <p className="px-2.5 py-1 text-xs text-ink-faint">No models</p>
              )}
              {provider.models.map((model) => {
                const isActive = provider.id === activeProviderId && model.id === activeModelId
                return (
                  <MenuItem
                    key={model.id}
                    icon={isActive ? <Check size={15} /> : undefined}
                    hint={connected ? 'Live' : model.demo ? 'Demo' : undefined}
                    selection="radio"
                    selected={isActive}
                    onClick={() => setActiveModel(provider.id, model.id)}
                  >
                    {model.label}
                  </MenuItem>
                )
              })}
            </div>
          )
        })}
        <div className="my-1 border-t border-line" />
        <MenuItem onClick={() => setUi({ settingsOpen: true })} hint="Connect your own">
          Manage providers…
        </MenuItem>
      </Menu>

      {/* Title + state */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <h1 className="min-w-0 truncate text-sm font-medium text-ink">
          {conversation?.title ?? ''}
        </h1>
        {conversation?.temporary && (
          <Tooltip label="In-memory only — disappears on reload">
            <Badge tone="accent">
              <Ghost size={10} /> Temporary
            </Badge>
          </Tooltip>
        )}
      </div>

      {liveActive ? (
        <Tooltip
          label={`Live — streaming from ${activeModel?.provider.label ?? 'your provider'} with your API key, straight from this browser`}
        >
          <Badge tone="success" className="hidden sm:inline-flex">
            <Zap size={10} /> Live
          </Badge>
        </Tooltip>
      ) : (
        <Tooltip label="Responses are simulated locally — no provider is contacted">
          <Badge tone="warning" className="hidden sm:inline-flex">
            Demo
          </Badge>
        </Tooltip>
      )}

      <Tooltip
        label={
          conversation?.temporary
            ? 'Temporary chat — not saved locally'
            : 'Make this conversation temporary (not saved)'
        }
      >
        <IconButton
          label="Toggle temporary chat"
          active={!!conversation?.temporary}
          onClick={handleTemporaryToggle}
        >
          <Ghost size={18} />
        </IconButton>
      </Tooltip>

      {/* Conversation actions */}
      <Menu
        label="Conversation actions"
        trigger={
          <IconButton label="Conversation actions" disabled={!conversation}>
            <MoreHorizontal size={18} />
          </IconButton>
        }
      >
        <MenuItem
          icon={<PencilLine size={15} />}
          disabled={!conversation}
          onClick={() => {
            setDraftTitle(conversation?.title ?? '')
            setRenameOpen(true)
          }}
        >
          Rename
        </MenuItem>
        <MenuItem
          icon={conversation?.pinned ? <PinOff size={15} /> : <Pin size={15} />}
          disabled={!conversation}
          onClick={() => conversation && togglePin(conversation.id)}
        >
          {conversation?.pinned ? 'Unpin' : 'Pin'}
        </MenuItem>
        <MenuItem
          icon={conversation?.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
          disabled={!conversation}
          onClick={() => conversation && toggleArchive(conversation.id)}
        >
          {conversation?.archived ? 'Unarchive' : 'Archive'}
        </MenuItem>
        <MenuItem icon={<Download size={15} />} disabled={!conversation} onClick={handleExport}>
          Export as Markdown
        </MenuItem>
        <MenuItem
          icon={<Link2 size={15} />}
          disabled
          hint="Unavailable"
          onClick={handleSharedLink}
        >
          Copy shared link
        </MenuItem>
        <MenuItem
          icon={<Trash2 size={15} />}
          danger
          disabled={!conversation}
          onClick={() => setDeleteOpen(true)}
        >
          Delete
        </MenuItem>
      </Menu>

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
                if (conversation) renameConversation(conversation.id, draftTitle)
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
        body={`“${conversation?.title ?? 'This conversation'}” will be removed from this device. You can undo for a few seconds afterwards.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (conversation) deleteConversation(conversation.id)
          navigate('/')
        }}
      />
    </header>
  )
}
