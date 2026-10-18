import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bot,
  Briefcase,
  FileText,
  FolderKanban,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Settings as SettingsIcon,
  Sun,
} from 'lucide-react'
import { useAppStore, searchConversations } from '@/state/store'
import { useWorkStore } from '@/state/workStore'
import { useAgentsStore } from '@/state/agentsStore'
import { useLibraryStore } from '@/state/libraryStore'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'
import { useTheme } from '@/app/ThemeProvider'
import { Dialog } from '@/components/ui/Dialog'
import { searchShortcutLabel } from './platform'

/**
 * Workspace command palette — Ctrl/Cmd+K global search across every real
 * local record type (chats, tasks, agents, projects, files) plus quick
 * actions.
 *
 * Honesty rules: temporary chats are excluded from the index; credentials
 * are never indexed (nothing in this palette reads them); selecting a
 * deleted record is a no-op, not a crash. Platform-aware shortcut labels.
 */

export type PaletteScope = 'all' | 'chats' | 'tasks' | 'agents' | 'projects' | 'files'

const SCOPES: { id: PaletteScope; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'chats', label: 'Chats' },
  { id: 'tasks', label: 'Tasks' },
  { id: 'agents', label: 'Agents' },
  { id: 'projects', label: 'Projects' },
  { id: 'files', label: 'Files' },
]

interface PaletteResult {
  key: string
  group: 'Chats' | 'Tasks' | 'Agents' | 'Projects' | 'Files' | 'Actions'
  icon: ReactNode
  title: string
  subtitle: string
  act: (navigate: (path: string) => void) => void
}

const TASK_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  queued: 'Queued',
  running: 'Running — local demo',
  needs_input: 'Waiting for input',
  ready_for_review: 'Ready for review',
  completed: 'Completed',
  paused: 'Paused',
  cancelled: 'Cancelled',
  failed: 'Failed',
}

export function CommandPalette() {
  const navigate = useNavigate()
  const open = useAppStore((state) => state.ui.searchOpen)
  const setUi = useAppStore((state) => state.setUi)
  const initialScope = useAppStore((state) => state.ui.searchScope ?? 'all')

  const conversations = useAppStore((state) => state.conversations)
  const selectConversation = useAppStore((state) => state.selectConversation)
  const newConversation = useAppStore((state) => state.newConversation)

  const tasks = useWorkStore((state) => state.tasks)
  const agents = useAgentsStore((state) => state.agents)
  const artifacts = useLibraryStore((state) => state.artifacts)
  const projects = useLibraryStore((state) => state.projects)
  const addArtifact = useLibraryStore((state) => state.addArtifact)

  const openInspector = useWorkspaceUiStore((state) => state.openInspector)
  const { theme, setTheme } = useTheme()

  const [scope, setScope] = useState<PaletteScope>(initialScope)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setScope(initialScope)
      setQuery('')
      setActiveIndex(0)
    }
  }, [open, initialScope])

  const actions = useMemo<PaletteResult[]>(() => {
    const normalized = query.trim().toLowerCase()
    const all: PaletteResult[] = [
      {
        key: 'action-new-chat',
        group: 'Actions',
        icon: <Plus size={15} />,
        title: 'New chat',
        subtitle: 'Start a fresh conversation',
        act: (go) => {
          const id = newConversation()
          go(`/c/${id}`)
        },
      },
      {
        key: 'action-new-task',
        group: 'Actions',
        icon: <Briefcase size={15} />,
        title: 'New task',
        subtitle: 'Open the Work brief',
        act: (go) => go('/work/new'),
      },
      {
        key: 'action-new-document',
        group: 'Actions',
        icon: <FileText size={15} />,
        title: 'New document',
        subtitle: 'Create a Library document and open Canvas',
        act: (go) => {
          const id = addArtifact({
            title: 'Untitled document',
            kind: 'document',
            markdown: '',
            provenance: 'user-authored',
          })
          openInspector({ tab: 'canvas', artifactId: id })
          go('/library')
        },
      },
      {
        key: 'action-settings',
        group: 'Actions',
        icon: <SettingsIcon size={15} />,
        title: 'Open settings',
        subtitle: 'Appearance, providers, data',
        act: () => setUi({ settingsOpen: true }),
      },
      {
        key: 'action-theme',
        group: 'Actions',
        icon: theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />,
        title: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        subtitle: 'Applies immediately',
        act: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
      },
    ]
    if (!normalized) return all
    return all.filter(
      (action) =>
        action.title.toLowerCase().includes(normalized) ||
        action.subtitle.toLowerCase().includes(normalized),
    )
  }, [query, theme, setTheme, newConversation, addArtifact, openInspector, setUi])

  const results = useMemo<PaletteResult[]>(() => {
    const normalized = query.trim().toLowerCase()
    const collected: PaletteResult[] = []

    if (scope === 'all' || scope === 'chats') {
      // searchConversations searches titles + content. Temporary
      // conversations are excluded from the palette index entirely.
      for (const hit of searchConversations(conversations, query)) {
        if (hit.temporary) continue
        collected.push({
          key: `chat-${hit.conversationId}`,
          group: 'Chats',
          icon: <MessageSquare size={15} />,
          title: hit.title,
          subtitle: `${hit.matchIn === 'title' ? 'Title match' : 'Message match'} — ${hit.snippet}`,
          act: (go) => {
            // Stable reference: skip gracefully if it was deleted since.
            if (useAppStore.getState().conversations[hit.conversationId]) {
              selectConversation(hit.conversationId)
              go(`/c/${hit.conversationId}`)
            }
          },
        })
      }
    }
    if (scope === 'all' || scope === 'tasks') {
      for (const task of Object.values(tasks)) {
        if (normalized && !matches(task.title, task.goal, normalized)) continue
        collected.push({
          key: `task-${task.id}`,
          group: 'Tasks',
          icon: <Briefcase size={15} />,
          title: task.title,
          subtitle: TASK_STATUS_LABELS[task.status] ?? task.status,
          act: (go) => {
            if (useWorkStore.getState().tasks[task.id]) go(`/work/${task.id}`)
          },
        })
      }
    }
    if (scope === 'all' || scope === 'agents') {
      for (const agent of Object.values(agents)) {
        if (agent.archived) continue
        if (normalized && !matches(agent.name, agent.description, normalized)) continue
        collected.push({
          key: `agent-${agent.id}`,
          group: 'Agents',
          icon: <Bot size={15} />,
          title: agent.name,
          subtitle: agent.category === 'personal' ? 'Personal assistant' : 'Specialist',
          act: (go) => {
            if (useAgentsStore.getState().agents[agent.id]) go(`/agents/${agent.id}`)
          },
        })
      }
    }
    if (scope === 'all' || scope === 'projects') {
      for (const project of Object.values(projects)) {
        if (normalized && !matches(project.name, project.description, normalized)) continue
        collected.push({
          key: `project-${project.id}`,
          group: 'Projects',
          icon: <FolderKanban size={15} />,
          title: project.name,
          subtitle: project.description || 'Project',
          act: (go) => {
            if (useLibraryStore.getState().projects[project.id]) {
              go(`/library?project=${project.id}`)
            }
          },
        })
      }
    }
    if (scope === 'all' || scope === 'files') {
      for (const artifact of Object.values(artifacts)) {
        if (normalized && !matches(artifact.title, artifact.markdown, normalized)) continue
        collected.push({
          key: `file-${artifact.id}`,
          group: 'Files',
          icon: <FileText size={15} />,
          title: artifact.title,
          subtitle:
            artifact.provenance === 'demo-simulation'
              ? 'Demo output — saved locally'
              : 'Saved locally',
          act: () => {
            if (useLibraryStore.getState().artifacts[artifact.id]) {
              openInspector({ tab: 'canvas', artifactId: artifact.id })
            }
          },
        })
      }
    }
    return collected

    function matches(title: string, content: string, normalized: string): boolean {
      return (
        title.toLowerCase().includes(normalized) || content.toLowerCase().includes(normalized)
      )
    }
  }, [
    scope,
    query,
    conversations,
    tasks,
    agents,
    artifacts,
    projects,
    selectConversation,
    openInspector,
  ])

  // Actions appear when the query is empty (discoverable), or when they
  // match the query. They sit after record results.
  const items = useMemo(() => {
    if (scope === 'all') return [...results, ...actions]
    return results
  }, [scope, results, actions])

  useEffect(() => {
    setActiveIndex(0)
  }, [query, scope])

  function close() {
    setUi({ searchOpen: false, searchScope: null })
  }

  function choose(index: number) {
    const item = items[index]
    if (!item) return
    close()
    // Run after the dialog unmounts so navigation is not fighting focus
    // restoration inside the dialog.
    requestAnimationFrame(() => item.act(navigate))
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (items.length > 0) setActiveIndex((index) => (index + 1) % items.length)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (items.length > 0) setActiveIndex((index) => (index - 1 + items.length) % items.length)
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(activeIndex)
    }
  }

  const grouped = useMemo(() => {
    const groups: { label: PaletteResult['group']; items: PaletteResult[] }[] = []
    for (const item of items) {
      const last = groups[groups.length - 1]
      if (last && last.label === item.group) {
        last.items.push(item)
      } else {
        groups.push({ label: item.group, items: [item] })
      }
    }
    return groups
  }, [items])

  let flatIndex = -1

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Search workspace"
      description={`Everything you have locally — chats, tasks, agents, projects, and files. ${searchShortcutLabel()} from anywhere.`}
      size="md"
      initialFocusRef={inputRef}
    >
      {/* Scope selector — visible, clickable, keyboard reachable via Tab */}
      <div role="tablist" aria-label="Search scope" className="flex flex-wrap gap-1">
        {SCOPES.map((entry) => (
          <button
            key={entry.id}
            role="tab"
            type="button"
            aria-selected={scope === entry.id}
            onClick={() => setScope(entry.id)}
            className={`min-touch rounded-full border px-2.5 py-1 text-xs font-medium transition-colors duration-[var(--motion-fast)] ${
              scope === entry.id
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-line text-ink-soft hover:border-line-strong hover:text-ink'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2 rounded-[10px] border border-line bg-raised px-3">
        <Search size={16} className="shrink-0 text-ink-faint" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            scope === 'all' ? 'Search everything…' : `Search ${scope === 'files' ? 'files' : scope}…`
          }
          aria-label="Search query"
          aria-controls="palette-results"
          aria-activedescendant={items[activeIndex] ? `palette-item-${activeIndex}` : undefined}
          className="w-full bg-transparent py-2.5 text-sm text-ink placeholder:text-ink-faint focus:outline-none"
        />
      </div>

      <div
        id="palette-results"
        role="listbox"
        aria-label="Search results"
        className="mt-3 max-h-[min(24rem,50vh)] overflow-y-auto"
      >
        {query.trim() === '' && scope === 'all' && items.length === 0 && (
          <p className="px-1 py-6 text-center text-sm leading-relaxed text-ink-faint">
            Nothing to search yet — start a chat, create a task, or save a document.
          </p>
        )}

        {query.trim() !== '' && items.length === 0 && (
          <p className="px-1 py-6 text-center text-sm leading-relaxed text-ink-faint">
            No {scope === 'all' ? 'results' : scope} match “{query.trim()}”.
            <br />
            Try another scope, or check the spelling.
          </p>
        )}

        {grouped.map((group) => (
          <div key={group.label} className="mb-1">
            <p className="px-1 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              {group.label}
            </p>
            {group.items.map((item) => {
              flatIndex += 1
              const index = flatIndex
              return (
                <button
                  key={item.key}
                  id={`palette-item-${index}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  type="button"
                  onClick={() => choose(index)}
                  className={`flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left transition-colors duration-[var(--motion-fast)] ${
                    index === activeIndex ? 'bg-accent-soft' : 'hover:bg-subtle'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`shrink-0 ${index === activeIndex ? 'text-accent' : 'text-ink-faint'}`}
                  >
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block truncate text-sm font-medium ${
                        index === activeIndex ? 'text-accent' : 'text-ink'
                      }`}
                    >
                      {item.title}
                    </span>
                    <span className="block truncate text-xs text-ink-faint">{item.subtitle}</span>
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <p className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-ink-faint">
        <kbd className="rounded border border-line px-1.5 py-0.5">↑</kbd>
        <kbd className="rounded border border-line px-1.5 py-0.5">↓</kbd>
        to move
        <kbd className="ml-1 rounded border border-line px-1.5 py-0.5">Enter</kbd>
        to open
        <kbd className="ml-1 rounded border border-line px-1.5 py-0.5">Esc</kbd>
        to close
      </p>
    </Dialog>
  )
}
