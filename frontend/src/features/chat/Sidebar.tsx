import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Briefcase,
  ChevronDown,
  FolderKanban,
  Ghost,
  Image as ImageIcon,
  Mail,
  Mic,
  PanelLeftClose,
  PanelLeftOpen,
  PenTool,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  Telescope,
} from 'lucide-react'
import { groupConversations } from '@/domain/grouping'
import { useAppStore } from '@/state/store'
import { UniverseMark } from '@/components/layout/UniverseMark'
import { Badge } from '@/components/ui/Tooltip'
import { IconButton } from '@/components/ui/IconButton'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { Button } from '@/components/ui/Button'
import { ConversationListItem } from './ConversationListItem'

export interface SidebarProps {
  /** Mobile drawer renders the sidebar always-expanded. */
  forceExpanded?: boolean
}

export function Sidebar({ forceExpanded = false }: SidebarProps) {
  const navigate = useNavigate()
  const conversations = useAppStore((state) => state.conversations)
  const activeConversationId = useAppStore((state) => state.activeConversationId)
  const collapsedPreference = useAppStore((state) => state.preferences.sidebarCollapsed)
  const newConversation = useAppStore((state) => state.newConversation)
  const selectConversation = useAppStore((state) => state.selectConversation)
  const updatePreferences = useAppStore((state) => state.updatePreferences)
  const setUi = useAppStore((state) => state.setUi)
  const openPreview = useAppStore((state) => state.openPreview)

  const collapsed = forceExpanded ? false : collapsedPreference
  const [showArchived, setShowArchived] = useState(false)

  const visible = useMemo(
    () =>
      Object.values(conversations).filter(
        (conversation) => conversation.archived === showArchived,
      ),
    [conversations, showArchived],
  )
  const groups = useMemo(() => groupConversations(visible), [visible])
  const archivedCount = useMemo(
    () => Object.values(conversations).filter((conversation) => conversation.archived).length,
    [conversations],
  )

  function handleNewChat(temporary = false) {
    const id = newConversation({ temporary })
    navigate(`/c/${id}`)
  }

  function handleSelect(id: string) {
    selectConversation(id)
    navigate(`/c/${id}`)
  }

  if (collapsed) {
    return (
      <div className="flex h-full w-rail flex-col items-center gap-1 border-r border-line bg-panel py-3">
        <IconButton
          label="Expand sidebar"
          onClick={() => updatePreferences({ sidebarCollapsed: false })}
        >
          <PanelLeftOpen size={18} />
        </IconButton>
        <IconButton label="New chat" tone="accent" onClick={() => handleNewChat(false)}>
          <Plus size={18} />
        </IconButton>
        <IconButton label="New temporary chat" onClick={() => handleNewChat(true)}>
          <Ghost size={18} />
        </IconButton>
        <IconButton
          label="Search conversations"
          onClick={() => setUi({ searchOpen: true })}
        >
          <Search size={18} />
        </IconButton>
        <IconButton
          label="Projects (preview)"
          onClick={() => openPreview({ kind: 'projects' })}
        >
          <FolderKanban size={18} />
        </IconButton>
        <div className="flex-1" />
        <IconButton label="Settings" onClick={() => setUi({ settingsOpen: true })}>
          <SettingsIcon size={18} />
        </IconButton>
      </div>
    )
  }

  return (
    <div className="flex h-full w-sidebar flex-col border-r border-line bg-panel">
      {/* Identity */}
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 px-1">
          <UniverseMark size={22} className="shrink-0 text-ink" />
          <span className="truncate text-[15px] font-semibold tracking-tight text-ink">
            Universe
          </span>
          <Badge tone="warning">Demo</Badge>
        </div>
        {!forceExpanded && (
          <IconButton
            label="Collapse sidebar"
            onClick={() => updatePreferences({ sidebarCollapsed: true })}
          >
            <PanelLeftClose size={18} />
          </IconButton>
        )}
      </div>

      {/* Primary actions */}
      <div className="flex flex-col gap-1 px-2 pt-1">
        <Button variant="secondary" className="justify-start" onClick={() => handleNewChat(false)}>
          <Plus size={16} />
          New chat
        </Button>
        <Button variant="ghost" className="justify-start" onClick={() => handleNewChat(true)}>
          <Ghost size={16} />
          New temporary chat
        </Button>
        <Button
          variant="ghost"
          className="justify-start"
          onClick={() => setUi({ searchOpen: true })}
        >
          <Search size={16} />
          Search conversations
          <span className="ml-auto hidden text-[11px] text-ink-faint sm:inline">Ctrl K</span>
        </Button>
      </div>

      {/* Advanced workflow previews — labeled, local, honest */}
      <div className="mt-2 border-t border-line px-2 pt-2">
        <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          Previews
        </p>
        <Button
          variant="ghost"
          className="justify-start"
          onClick={() => openPreview({ kind: 'research' })}
        >
          <Telescope size={16} />
          Research
          <Badge className="ml-auto">Simulated</Badge>
        </Button>
        <Button
          variant="ghost"
          className="justify-start"
          onClick={() => openPreview({ kind: 'images' })}
        >
          <ImageIcon size={16} />
          Images
          <Badge className="ml-auto">Sample</Badge>
        </Button>
        <Button
          variant="ghost"
          className="justify-start"
          onClick={() => openPreview({ kind: 'voice' })}
        >
          <Mic size={16} />
          Voice
          <Badge className="ml-auto">Sample</Badge>
        </Button>
        <Button
          variant="ghost"
          className="justify-start"
          onClick={() => openPreview({ kind: 'canvas' })}
        >
          <PenTool size={16} />
          Canvas
          <Badge className="ml-auto">Local</Badge>
        </Button>
        <Button
          variant="ghost"
          className="justify-start"
          onClick={() => openPreview({ kind: 'data' })}
        >
          <BarChart3 size={16} />
          Data analysis
          <Badge className="ml-auto">Fixture</Badge>
        </Button>
        <Button
          variant="ghost"
          className="justify-start"
          onClick={() => openPreview({ kind: 'presets' })}
        >
          <Sparkles size={16} />
          Assistant presets
          <Badge className="ml-auto">Local</Badge>
        </Button>
      </div>

      {/* Future products — subdued entries with explanatory previews */}
      <div className="mt-3 border-t border-line px-2 pt-2">
        <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
          Coming later
        </p>
        <Button
          variant="ghost"
          className="justify-start opacity-70"
          onClick={() => openPreview({ kind: 'projects' })}
        >
          <FolderKanban size={16} />
          Projects
          <Badge className="ml-auto">Preview</Badge>
        </Button>
        <Button
          variant="ghost"
          className="justify-start opacity-70"
          onClick={() => openPreview({ kind: 'work' })}
        >
          <Briefcase size={16} />
          Work
          <Badge className="ml-auto">Later</Badge>
        </Button>
        <Button
          variant="ghost"
          className="justify-start opacity-70"
          onClick={() => openPreview({ kind: 'email' })}
        >
          <Mail size={16} />
          Email
          <Badge className="ml-auto">Later</Badge>
        </Button>
      </div>

      {/* Conversation history */}
      <div className="mt-3 flex min-h-0 flex-1 flex-col border-t border-line px-2 pt-2">
        <div className="flex items-center justify-between px-2 pb-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            {showArchived ? 'Archived' : 'Recent'}
          </p>
          {archivedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived((value) => !value)}
              className="text-[11px] font-medium text-accent hover:text-accent-strong"
            >
              {showArchived ? 'Back to recent' : `Archived (${archivedCount})`}
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pb-2">
          {groups.length === 0 && (
            <p className="px-2 py-6 text-center text-xs leading-relaxed text-ink-faint">
              {showArchived
                ? 'No archived conversations.'
                : 'No conversations yet. Start a new chat and it will appear here.'}
            </p>
          )}
          {groups.map((group) => (
            <section key={group.key} className="mb-2">
              <p className="px-2 pb-1 pt-2 text-[11px] font-medium text-ink-faint">
                {group.label}
              </p>
              <div className="flex flex-col gap-0.5">
                {group.conversations.map((conversation) => (
                  <ConversationListItem
                    key={conversation.id}
                    conversation={conversation}
                    active={conversation.id === activeConversationId}
                    onSelect={handleSelect}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      {/* Profile / settings */}
      <div className="border-t border-line p-2">
        <Menu
          align="start"
          width="w-60"
          label="Account menu"
          trigger={
            <button
              type="button"
              className="flex w-full items-center gap-2.5 rounded-[10px] px-2 py-2 text-left transition-colors hover:bg-subtle"
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-inverse text-sm font-semibold text-ink-inverse"
              >
                U
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">Demo user</span>
                <span className="block truncate text-xs text-ink-faint">
                  Local prototype — no account
                </span>
              </span>
              <ChevronDown size={15} className="shrink-0 text-ink-faint" />
            </button>
          }
        >
          <MenuItem icon={<SettingsIcon size={15} />} onClick={() => setUi({ settingsOpen: true })}>
            Settings
          </MenuItem>
          <MenuItem
            icon={<Ghost size={15} />}
            onClick={() => {
              const id = newConversation({ temporary: true })
              navigate(`/c/${id}`)
            }}
          >
            New temporary chat
          </MenuItem>
        </Menu>
      </div>
    </div>
  )
}
