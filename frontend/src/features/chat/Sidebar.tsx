import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Bot,
  Check,
  ChevronDown,
  Ghost,
  Library as LibraryIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings as SettingsIcon,
  MessageSquare,
  Briefcase,
  Layers,
  Wrench,
} from 'lucide-react'
import { groupConversations } from '@/domain/grouping'
import { useAppStore } from '@/state/store'
import { useWorkStore } from '@/state/workStore'
import { useAgentsStore } from '@/state/agentsStore'
import { useLibraryStore } from '@/state/libraryStore'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'
import { UniverseMark } from '@/components/layout/UniverseMark'
import { SidebarActivityRow } from '@/components/layout/HeaderExtras'
import { searchShortcutLabel } from '@/features/search/platform'
import { Tooltip } from '@/components/ui/Tooltip'
import { IconButton } from '@/components/ui/IconButton'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { Button } from '@/components/ui/Button'
import { ConversationListItem } from './ConversationListItem'

export interface SidebarProps {
  /** Mobile drawer renders the sidebar always-expanded. */
  forceExpanded?: boolean
}

/* ------------------------------------------------------------------ */
/* Destinations                                                        */
/* ------------------------------------------------------------------ */

type DestinationId = 'chat' | 'work' | 'agents' | 'library'

interface Destination {
  id: DestinationId
  label: string
  icon: React.ReactNode
  path: string
  match: (pathname: string) => boolean
  newLabel: string
  newIcon: React.ReactNode
}

const DESTINATIONS: Destination[] = [
  {
    id: 'chat',
    label: 'Chat',
    icon: <MessageSquare size={17} />,
    path: '/',
    match: (p) => p === '/' || p.startsWith('/c/'),
    newLabel: 'New chat',
    newIcon: <Plus size={16} />,
  },
  {
    id: 'work',
    label: 'Work',
    icon: <Briefcase size={17} />,
    path: '/work',
    match: (p) => p.startsWith('/work'),
    newLabel: 'New task',
    newIcon: <Plus size={16} />,
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: <Bot size={17} />,
    path: '/agents',
    match: (p) => p.startsWith('/agents'),
    newLabel: 'New agent',
    newIcon: <Plus size={16} />,
  },
  {
    id: 'library',
    label: 'Library',
    icon: <LibraryIcon size={17} />,
    path: '/library',
    match: (p) => p.startsWith('/library') || p.startsWith('/projects/'),
    newLabel: 'New note',
    newIcon: <Plus size={16} />,
  },
]

function activeDestination(pathname: string): Destination {
  return DESTINATIONS.find((destination) => destination.match(pathname)) ?? DESTINATIONS[0]
}

/** One obvious active-destination treatment, shared by all entries. */
function DestinationRow({
  destination,
  active,
  onClick,
}: {
  destination: Destination
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={`press flex min-touch w-full items-center gap-2.5 rounded-control px-2.5 py-2 text-left transition-colors duration-[var(--motion-select)] ${
        active
          ? 'bg-accent-soft font-semibold text-accent'
          : 'font-medium text-ink hover:bg-[var(--c-hover-wash)] active:bg-[var(--c-active-wash)]'
      }`}
    >
      <span className="shrink-0" aria-hidden="true">
        {destination.icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-[14px] leading-tight">
        {destination.label}
      </span>
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Tools — occasional utilities in one discoverable control            */
/* ------------------------------------------------------------------ */

const TOOL_ITEMS = [
  { kind: 'research' as const, label: 'Research', note: 'Simulated preview' },
  { kind: 'images' as const, label: 'Images', note: 'Sample gallery' },
  { kind: 'voice' as const, label: 'Voice', note: 'Sample — no microphone' },
  { kind: 'data' as const, label: 'Data analysis', note: 'Local CSV analysis' },
]

export function Sidebar({ forceExpanded = false }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const conversations = useAppStore((state) => state.conversations)
  const activeConversationId = useAppStore((state) => state.activeConversationId)
  const collapsedPreference = useAppStore((state) => state.preferences.sidebarCollapsed)
  const newConversation = useAppStore((state) => state.newConversation)
  const selectConversation = useAppStore((state) => state.selectConversation)
  const updatePreferences = useAppStore((state) => state.updatePreferences)
  const setUi = useAppStore((state) => state.setUi)
  const openPreview = useAppStore((state) => state.openPreview)

  const tasks = useWorkStore((state) => state.tasks)
  const agents = useAgentsStore((state) => state.agents)
  const artifacts = useLibraryStore((state) => state.artifacts)
  const projects = useLibraryStore((state) => state.projects)
  const addArtifact = useLibraryStore((state) => state.addArtifact)

  const selectedProjectId = useWorkspaceUiStore((state) => state.selectedProjectId)
  const setSelectedProject = useWorkspaceUiStore((state) => state.setSelectedProject)
  const openInspector = useWorkspaceUiStore((state) => state.openInspector)

  const collapsed = forceExpanded ? false : collapsedPreference
  const [showArchived, setShowArchived] = useState(false)

  const destination = activeDestination(location.pathname)
  const selectedProject = selectedProjectId ? projects[selectedProjectId] ?? null : null

  /* Project scope counts — "the context it actually includes". */
  const projectCounts = useMemo(() => {
    if (!selectedProjectId) return null
    let taskCount = 0
    for (const task of Object.values(tasks)) {
      if (task.projectId === selectedProjectId) taskCount += 1
    }
    let artifactCount = 0
    for (const artifact of Object.values(artifacts)) {
      if (artifact.projectId === selectedProjectId) artifactCount += 1
    }
    let agentCount = 0
    for (const agent of Object.values(agents)) {
      if (agent.projectIds.includes(selectedProjectId)) agentCount += 1
    }
    return { taskCount, artifactCount, agentCount }
  }, [selectedProjectId, tasks, artifacts, agents])

  /* Context-sensitive recent items, scoped to the selected project. */
  const recentTasks = useMemo(
    () =>
      Object.values(tasks)
        .filter((task) => !selectedProjectId || task.projectId === selectedProjectId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 8),
    [tasks, selectedProjectId],
  )

  const recentArtifacts = useMemo(
    () =>
      Object.values(artifacts)
        .filter((artifact) => !selectedProjectId || artifact.projectId === selectedProjectId)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 8),
    [artifacts, selectedProjectId],
  )

  const visibleAgents = useMemo(
    () =>
      Object.values(agents)
        .filter((agent) => !agent.archived)
        .filter((agent) => !selectedProjectId || agent.projectIds.includes(selectedProjectId))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 8),
    [agents, selectedProjectId],
  )

  const visible = useMemo(
    () =>
      Object.values(conversations).filter(
        (conversation) =>
          conversation.archived === showArchived &&
          (!selectedProjectId || !conversation.temporary),
      ),
    [conversations, showArchived, selectedProjectId],
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

  function go(path: string) {
    navigate(path)
    setUi({ mobileSidebarOpen: false })
  }

  /** The one context-aware primary action. */
  function handleNew() {
    switch (destination.id) {
      case 'work':
        go('/work/new')
        break
      case 'agents':
        go('/agents/new')
        break
      case 'library': {
        const id = addArtifact({
          title: 'Untitled note',
          kind: 'notes',
          markdown: '# Untitled note\n\nStart writing…',
          projectId: selectedProjectId,
        })
        openInspector({ tab: 'canvas', artifactId: id })
        if (location.pathname !== '/library') go('/library')
        break
      }
      default:
        handleNewChat(false)
        break
    }
  }

  function handleSelectProject(projectId: string | null) {
    setSelectedProject(projectId)
  }

  /* ---------------- Collapsed rail ---------------- */

  if (collapsed) {
    return (
      <div className="glass-float flex h-full w-rail flex-col items-center gap-1 overflow-hidden rounded-float border border-line/70 bg-mat-sidebar py-3">
        <IconButton
          label="Expand sidebar"
          onClick={() => updatePreferences({ sidebarCollapsed: false })}
        >
          <PanelLeftOpen size={18} />
        </IconButton>
        {DESTINATIONS.map((entry) => (
          <IconButton
            key={entry.id}
            label={entry.label}
            tone={entry.match(location.pathname) ? 'accent' : 'default'}
            onClick={() => go(entry.path)}
          >
            {entry.icon}
          </IconButton>
        ))}
        <IconButton label={destination.newLabel} tone="accent" onClick={handleNew}>
          <Plus size={18} />
        </IconButton>
        <IconButton label="Search workspace" onClick={() => setUi({ searchOpen: true })}>
          <Search size={18} />
        </IconButton>
        <div className="flex-1" />
        <IconButton label="Settings" onClick={() => setUi({ settingsOpen: true })}>
          <SettingsIcon size={18} />
        </IconButton>
      </div>
    )
  }

  /* ---------------- Expanded sidebar ---------------- */

  return (
    <div className="glass-float safe-left flex h-full w-sidebar flex-col overflow-hidden rounded-float border border-line/70 bg-mat-sidebar">
      {/* Identity + workspace selector */}
      <div className="px-2 pb-1 pt-3">
        <div className="flex items-center gap-2 px-1 pb-1.5">
          <UniverseMark size={22} className="shrink-0 text-ink" />
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-ink">
            Universe
          </span>
          {!forceExpanded && (
            <IconButton
              label="Collapse sidebar"
              size="sm"
              onClick={() => updatePreferences({ sidebarCollapsed: true })}
            >
              <PanelLeftClose size={15} />
            </IconButton>
          )}
        </div>

        <Menu
          width="w-64"
          label="Select project workspace"
          trigger={
            <button
              type="button"
              aria-label={
                selectedProject
                  ? `Project: ${selectedProject.name}. ${projectCounts ? `${projectCounts.taskCount} tasks, ${projectCounts.artifactCount} artifacts` : ''}`
                  : 'All workspaces'
              }
              className="flex min-touch w-full items-center gap-2 rounded-control px-2 py-1.5 text-left transition-colors duration-[var(--motion-fast)] hover:bg-[var(--c-hover-wash)]"
            >
              <Layers
                size={14}
                className={`shrink-0 ${selectedProject ? 'text-accent' : 'text-ink-faint'}`}
              />
              <span className="min-w-0 flex-1 truncate">
                {selectedProject ? (
                  <span className="block truncate text-[12.5px] font-medium text-ink">
                    {selectedProject.name}
                  </span>
                ) : (
                  <span className="block truncate text-[12.5px] text-ink-faint">
                    All workspaces
                  </span>
                )}
                {selectedProject && projectCounts && (
                  <span className="block truncate text-[11px] text-ink-faint">
                    {projectCounts.taskCount} tasks · {projectCounts.artifactCount} docs ·{' '}
                    {projectCounts.agentCount} agents
                  </span>
                )}
              </span>
              <ChevronDown size={13} className="shrink-0 text-ink-faint" />
            </button>
          }
        >
          <MenuItem
            icon={!selectedProjectId ? <Check size={15} /> : undefined}
            onClick={() => handleSelectProject(null)}
          >
            All workspaces
          </MenuItem>
          {Object.values(projects).length > 0 && (
            <div className="my-1 border-t border-line" />
          )}
          {Object.values(projects)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((project) => (
              <MenuItem
                key={project.id}
                icon={selectedProjectId === project.id ? <Check size={15} /> : undefined}
                onClick={() => handleSelectProject(project.id)}
              >
                {project.name}
              </MenuItem>
            ))}
          <div className="my-1 border-t border-line" />
          <MenuItem onClick={() => go('/library')}>New project…</MenuItem>
        </Menu>
      </div>

      {/* Global search trigger */}
      <div className="px-2 pt-1">
        <Button
          variant="secondary"
          className="w-full justify-start text-ink-soft"
          aria-label="Search workspace"
          onClick={() => setUi({ searchOpen: true })}
        >
          <Search size={15} />
          Search
          <span
            aria-hidden="true"
            className="ml-auto hidden text-[11px] font-normal text-ink-faint sm:inline"
          >
            {searchShortcutLabel()}
          </span>
        </Button>
      </div>

      {/* Navigation — a simple icon/label list with one confident
          selection treatment (no inset settings-list card look) */}
      {!forceExpanded && (
        <nav aria-label="Primary" className="mt-1.5 flex flex-col gap-0.5 px-2">
          {DESTINATIONS.map((entry) => (
            <DestinationRow
              key={entry.id}
              destination={entry}
              active={entry.match(location.pathname)}
              onClick={() => go(entry.path)}
            />
          ))}
        </nav>
      )}

      {/* Context-aware primary action and the separate temporary-chat
          control — sibling buttons with correct semantics, never a nested
          interactive element inside the primary action. */}
      <div className="mt-2.5 px-2">
        <div className="flex items-stretch gap-1.5">
          <Button
            variant="primary"
            className="h-10 min-w-0 flex-1 justify-center px-3"
            onClick={handleNew}
          >
            {destination.newIcon}
            <span className="truncate text-[14px]">{destination.newLabel}</span>
          </Button>
          {destination.id === 'chat' && (
            <Tooltip label="New temporary chat — stays in memory only, never saved">
              <IconButton
                label="New temporary chat"
                className="!h-10 !w-10 shrink-0"
                onClick={() => handleNewChat(true)}
              >
                <Ghost size={17} />
              </IconButton>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Context-sensitive recent items */}
      <div className="mt-3 flex min-h-0 flex-1 flex-col px-2">
        {destination.id === 'work' ? (
          <>
            <p className="px-2 pb-1 text-[12px] font-medium text-ink-faint">
              {selectedProject ? 'Project tasks' : 'Recent tasks'}
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              {recentTasks.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs leading-relaxed text-ink-faint">
                  No tasks yet. Create one from the Work page.
                </p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {recentTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => go(`/work/${task.id}`)}
                      aria-current={
                        location.pathname === `/work/${task.id}` ? 'page' : undefined
                      }
                      className={`min-touch flex w-full items-center gap-2 rounded-control py-[var(--pad-list-item)] pl-3 pr-1 text-left text-sm transition-colors ${
                        location.pathname === `/work/${task.id}`
                          ? 'bg-accent-soft font-medium text-accent'
                          : 'text-ink hover:bg-[var(--c-hover-wash)]'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : destination.id === 'agents' ? (
          <>
            <p className="px-2 pb-1 text-[12px] font-medium text-ink-faint">
              Agents
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              {visibleAgents.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs leading-relaxed text-ink-faint">
                  No agents yet. Create one to reuse instructions.
                </p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {visibleAgents.map((agent) => (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => go(`/agents/${agent.id}`)}
                      aria-current={
                        location.pathname === `/agents/${agent.id}` ? 'page' : undefined
                      }
                      className={`min-touch flex w-full items-center gap-2 rounded-control py-[var(--pad-list-item)] pl-3 pr-1 text-left text-sm transition-colors ${
                        location.pathname === `/agents/${agent.id}`
                          ? 'bg-accent-soft font-medium text-accent'
                          : 'text-ink hover:bg-[var(--c-hover-wash)]'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : destination.id === 'library' ? (
          <>
            <p className="px-2 pb-1 text-[12px] font-medium text-ink-faint">
              Recent documents
            </p>
            <div className="min-h-0 flex-1 overflow-y-auto pb-2">
              {recentArtifacts.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs leading-relaxed text-ink-faint">
                  No documents yet. Save one from a conversation or task.
                </p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {recentArtifacts.map((artifact) => (
                    <button
                      key={artifact.id}
                      type="button"
                      onClick={() => {
                        openInspector({ tab: 'canvas', artifactId: artifact.id })
                      }}
                      className="min-touch flex w-full items-center gap-2 rounded-control py-[var(--pad-list-item)] pl-3 pr-1 text-left text-sm text-ink transition-colors hover:bg-[var(--c-hover-wash)]"
                    >
                      <span className="min-w-0 flex-1 truncate">{artifact.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-2 pb-1">
              <p className="text-[12px] font-medium text-ink-faint">
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
                  <p className="px-2 pb-1 pt-2 text-[12px] font-medium text-ink-faint/90">
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
          </>
        )}
      </div>

      {/* Footer: activity (real tasks only), tools, account */}
      <div className="border-t border-line/70 p-2">
        <SidebarActivityRow onNavigate={() => go('/work')} />

        <Menu
          align="start"
          direction="up"
          width="w-60"
          label="Tools"
          trigger={
            <button
              type="button"
              className="flex min-touch w-full items-center gap-2.5 rounded-control px-2 py-1.5 text-left text-ink-soft transition-colors duration-[var(--motion-fast)] hover:bg-[var(--c-hover-wash)] hover:text-ink"
            >
              <Wrench size={15} className="shrink-0 text-ink-faint" />
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium">Tools</span>
              <ChevronDown size={13} className="shrink-0 text-ink-faint" />
            </button>
          }
        >
          {TOOL_ITEMS.map((tool) => (
            <MenuItem
              key={tool.kind}
              hint={tool.note}
              onClick={() => openPreview({ kind: tool.kind })}
            >
              {tool.label}
            </MenuItem>
          ))}
        </Menu>

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
