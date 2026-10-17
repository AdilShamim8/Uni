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
import { Badge, Tooltip } from '@/components/ui/Tooltip'
import { IconButton } from '@/components/ui/IconButton'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { Button } from '@/components/ui/Button'
import { ConversationListItem } from './ConversationListItem'

export interface SidebarProps {
  /** Mobile drawer renders the sidebar always-expanded. */
  forceExpanded?: boolean
}

/** Small contextual dot marking a simulated/preview entry (replaces text badges). */
function AvailabilityDot({ label }: { label: string }) {
  return (
    <Tooltip label={label}>
      <span
        aria-label={label}
        role="img"
        className="ml-auto mr-1 inline-block h-[5px] w-[5px] shrink-0 rounded-full bg-ink-faint"
      />
    </Tooltip>
  )
}

/**
 * Row inside an inset grouped card — iOS sidebar style. The hover wash is
 * full-bleed (no row radius); the card provides the rounding and the
 * hairline separators between rows.
 */
function GroupedRow({
  icon,
  label,
  note,
  subdued = false,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  note: string
  subdued?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-touch w-full items-center gap-2.5 px-3 py-[7px] text-left transition-colors duration-[var(--motion-fast)] hover:bg-[var(--c-hover-wash)] active:bg-[var(--c-active-wash)] ${
        subdued ? 'text-ink-faint hover:text-ink-soft' : 'text-ink'
      }`}
    >
      <span className="shrink-0 text-ink-faint">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{label}</span>
      <AvailabilityDot label={note} />
    </button>
  )
}

/** Inset grouped card container with hairline separators between rows. */
function GroupedCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="divide-y divide-line/60 overflow-hidden rounded-[12px] border border-line/70 bg-raised/70">
      {children}
    </div>
  )
}

interface ToolEntry {
  kind: 'research' | 'images' | 'voice' | 'canvas' | 'data' | 'presets'
  label: string
  icon: React.ReactNode
  note: string
}

const TOOLS: ToolEntry[] = [
  { kind: 'research', label: 'Research', icon: <Telescope size={16} />, note: 'Simulated — labeled preview' },
  { kind: 'images', label: 'Images', icon: <ImageIcon size={16} />, note: 'Sample gallery' },
  { kind: 'voice', label: 'Voice', icon: <Mic size={16} />, note: 'Sample — no microphone access' },
  { kind: 'canvas', label: 'Canvas', icon: <PenTool size={16} />, note: 'Local session panel' },
  { kind: 'data', label: 'Data analysis', icon: <BarChart3 size={16} />, note: 'Fixture dataset' },
  { kind: 'presets', label: 'Assistant presets', icon: <Sparkles size={16} />, note: 'Local presets' },
]

interface LaterEntry {
  kind: 'projects' | 'work' | 'email'
  label: string
  icon: React.ReactNode
  note: string
}

const LATER: LaterEntry[] = [
  { kind: 'projects', label: 'Projects', icon: <FolderKanban size={16} />, note: 'Planned — preview' },
  { kind: 'work', label: 'Work', icon: <Briefcase size={16} />, note: 'Planned — preview' },
  { kind: 'email', label: 'Email', icon: <Mail size={16} />, note: 'Planned — preview' },
]

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
  const [toolsOpen, setToolsOpen] = useState(true)

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
      <div className="material flex h-full w-rail flex-col items-center gap-1 border-r border-line bg-mat-sidebar py-3">
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
    <div className="material safe-left flex h-full w-sidebar flex-col bg-mat-sidebar">
      {/* Identity — one persistent, understandable demo indicator */}
      <div className="flex items-center gap-2 px-3 pb-1 pt-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
          <UniverseMark size={22} className="shrink-0 text-ink" />
          <span className="truncate text-[15px] font-semibold tracking-tight text-ink">
            Universe
          </span>
          <Tooltip label="Demo workspace — responses are simulated locally. Add a provider in Settings to connect a real model with your own API key.">
            <Badge className="cursor-help">Demo</Badge>
          </Tooltip>
        </div>
        {!forceExpanded && (
          <IconButton
            label="Collapse sidebar"
            size="sm"
            onClick={() => updatePreferences({ sidebarCollapsed: true })}
          >
            <PanelLeftClose size={16} />
          </IconButton>
        )}
      </div>

      {/* Primary actions */}
      <div className="flex flex-col gap-0.5 px-2 pt-2">
        <Button variant="primary" className="justify-start" onClick={() => handleNewChat(false)}>
          <Plus size={16} />
          New chat
        </Button>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            className="min-w-0 flex-1 justify-start"
            aria-label="New temporary chat"
            onClick={() => handleNewChat(true)}
          >
            <Ghost size={16} />
            Temporary
          </Button>
          <Button
            variant="ghost"
            className="min-w-0 flex-1 justify-start"
            aria-label="Search conversations"
            onClick={() => setUi({ searchOpen: true })}
          >
            <Search size={16} />
            Search
            <span aria-hidden="true" className="ml-auto hidden text-[11px] text-ink-faint sm:inline">
              ⌘K
            </span>
          </Button>
        </div>
      </div>

      {/* Tools — one coherent, collapsible inset group */}
      <div className="mt-4 px-2">
        <button
          type="button"
          aria-expanded={toolsOpen}
          onClick={() => setToolsOpen((value) => !value)}
          className="flex w-full items-center gap-1.5 rounded-control px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint transition-colors hover:text-ink-soft"
        >
          Tools
          <ChevronDown
            size={12}
            className={`transition-transform duration-[var(--motion-fast)] ${toolsOpen ? '' : '-rotate-90'}`}
            aria-hidden="true"
          />
        </button>
        {toolsOpen && (
          <GroupedCard>
            {TOOLS.map((tool) => (
              <GroupedRow
                key={tool.kind}
                icon={tool.icon}
                label={tool.label}
                note={tool.note}
                onClick={() => openPreview({ kind: tool.kind })}
              />
            ))}
          </GroupedCard>
        )}
      </div>

      {/* Later — subdued, out of daily navigation */}
      <div className="mt-3 px-2">
        <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint/80">
          Later
        </p>
        <GroupedCard>
          {LATER.map((entry) => (
            <GroupedRow
              key={entry.kind}
              icon={entry.icon}
              label={entry.label}
              note={entry.note}
              subdued
              onClick={() => openPreview({ kind: entry.kind })}
            />
          ))}
        </GroupedCard>
      </div>

      {/* Conversation history */}
      <div className="mt-4 flex min-h-0 flex-1 flex-col px-2">
        <div className="flex items-center justify-between px-2 pb-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            {showArchived ? 'Archived' : 'Recent'}
          </p>
          {archivedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowArchived((value) => !value)}
              className="rounded px-1 text-[11px] font-medium text-ink-faint transition-colors hover:text-accent"
            >
              {showArchived ? 'Recent' : `Archived (${archivedCount})`}
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
              <p className="px-2 pb-1 pt-2 text-[11px] font-medium text-ink-faint/90">
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
      <div className="p-2">
        <Menu
          align="start"
          direction="up"
          width="w-60"
          label="Account menu"
          trigger={
            <button
              type="button"
              className="flex min-touch w-full items-center gap-2.5 rounded-control px-2 py-2 text-left transition-colors hover:bg-[var(--c-hover-wash)]"
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
                  Local — no account
                </span>
              </span>
              <ChevronDown size={15} className="shrink-0 text-ink-faint" />
            </button>
          }
        >
          <MenuItem
            icon={<SettingsIcon size={15} />}
            shortcut="⌘,"
            onClick={() => setUi({ settingsOpen: true })}
          >
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
