import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Brain,
  Briefcase,
  CalendarClock,
  ChevronDown,
  PencilLine,
  Plus,
  Puzzle,
  Trash2,
} from 'lucide-react'
import { useAgentsStore } from '@/state/agentsStore'
import { useAppStore, AGENT_MEMORY_MAX_NOTES, AGENT_MEMORY_MAX_CHARS } from '@/state/store'
import { InspectorPanel } from '@/components/ui/InspectorPanel'
import { useWorkStore } from '@/state/workStore'
import { PLUGIN_CATALOG } from '@/features/plugins/registry'
import { Button } from '@/components/ui/Button'
import { PageToolbar } from '@/components/layout/PageToolbar'
import { StatusPill } from '@/components/ui/StatusPill'
import { ThreadView } from '@/features/conversation/ThreadView'
import { ThreadComposer } from '@/features/conversation/ThreadComposer'
import { mergeThreadEntries, projectAgentThread } from '@/features/conversation/threadModel'
import { ThreadPluginBar } from '@/features/plugins/ThreadPluginBar'
import { filterReceiptsForThread, receiptsToEntries } from '@/features/plugins/receiptEntries'
import { usePluginsStore } from '@/state/pluginsStore'
import { TASK_STATUS_LABELS, TASK_STATUS_TONES } from '@/domain/taskMachine'
import type { AgentProfile, MemoryNote, ScheduleDraft } from '@/domain/workspaceTypes'

/**
 * The employee experience (milestone 06): selecting an agent opens its
 * actual conversation directly — no information-card hop. Profile, memory,
 * assigned work, plugins, and routines live in a compact inspector.
 *
 * Honesty constraints:
 * - Availability reflects real state: responding / working on a task /
 *   waiting for input / available in this app. No "Online 24/7".
 * - Free text is chat; only explicit commands or buttons execute actions.
 * - Routines stay "Saved locally — execution unavailable".
 */
type InspectorTab = 'profile' | 'memory' | 'work' | 'plugins' | 'routines'

export function EmployeeView({
  agentId,
  onEdit,
}: {
  agentId: string
  onEdit: () => void
}) {
  const navigate = useNavigate()
  const agent = useAgentsStore((state) => state.agents[agentId])
  const conversations = useAppStore((state) => state.conversations)
  const threadEvents = useAgentsStore((state) => state.threadEvents)
  const tasks = useWorkStore((state) => state.tasks)
  const [inspectorOpen, setInspectorOpen] = useState(false)
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('profile')
  const [assignDraft, setAssignDraft] = useState<string | null>(null)

  // Open (or take over) the agent's one ongoing conversation. This is the
  // same conversation the Chat surface renders — one thread, no copies.
  const conversationId = useMemo(() => {
    const id = useAppStore.getState().openAgentConversation(agentId)
    return id
  }, [agentId])

  const conversation = conversations[conversationId] ?? null

  useEffect(() => {
    // Keep the store's active selection in sync so sends from this surface
    // land in the right thread and the sidebar communicates the scope.
    if (
      conversationId &&
      useAppStore.getState().activeConversationId !== conversationId
    ) {
      useAppStore.getState().selectConversation(conversationId)
    }
  }, [conversationId])

  const events = useMemo(
    () =>
      Object.values(threadEvents)
        .filter((event) => event.agentId === agentId)
        .sort((a, b) => a.at - b.at),
    [threadEvents, agentId],
  )

  const receipts = usePluginsStore((state) => state.receipts)
  const entries = useMemo(() => {
    const pluginEntries = conversation
      ? receiptsToEntries(
          filterReceiptsForThread(receipts, {
            kind: 'agent',
            agentId,
            conversationId,
          }),
        )
      : []
    return mergeThreadEntries(projectAgentThread(conversation, events), pluginEntries)
  }, [conversation, events, receipts, agentId, conversationId])

  const availability = useMemo(
    () => deriveAvailability(agentId, conversation, tasks),
    [agentId, conversation, tasks],
  )

  const busy = useMemo(() => {
    if (!conversation) return false
    const leaf = conversation.activeLeafId
      ? conversation.nodes[conversation.activeLeafId]
      : null
    return leaf?.role === 'assistant' && leaf.status === 'streaming'
  }, [conversation])

  function handleSend(text: string) {
    const trimmed = text.trim()
    if (!trimmed) return
    // Explicit commands execute real local actions; anything else is chat
    // and goes to the model through the normal send path.
    if (trimmed.startsWith('/')) {
      const handled = handleCommand(trimmed)
      if (handled) return
    }
    void useAppStore.getState().sendMessage({ text: trimmed })
  }

  function handleCommand(raw: string): boolean {
    const [command, ...rest] = raw.slice(1).split(/\s+/)
    const argument = rest.join(' ').trim()
    switch (command) {
      case 'remember': {
        if (!argument) return false
        const noteId = useAgentsStore.getState().addMemoryNote(agentId, argument)
        if (noteId) {
          useAgentsStore.getState().addThreadEvent({
            agentId,
            kind: 'memory_note',
            label: `Remembered: ${argument}`,
            detail:
              'Saved locally to this assistant’s memory — included in future requests to this thread.',
            noteId,
          })
        }
        return true
      }
      case 'assign': {
        // Always open the inline brief (prefilled when text follows the
        // command); confirmation creates the task — never a silent create.
        setAssignDraft(argument)
        return true
      }
      case 'task':
      case 'tasks':
        setInspectorOpen(true)
        setInspectorTab('work')
        return true
      case 'routine':
      case 'routines':
        setInspectorOpen(true)
        setInspectorTab('routines')
        return true
      case 'plugin':
      case 'plugins':
        setInspectorOpen(true)
        setInspectorTab('plugins')
        return true
      default:
        return false
    }
  }

  function createAssignment(goal: string) {
    const title = goal.length > 60 ? `${goal.slice(0, 57)}…` : goal
    const taskId = useWorkStore.getState().createTask({
      title,
      goal,
      deliverable: 'research-report',
      agentId,
    })
    useAgentsStore.getState().addThreadEvent({
      agentId,
      kind: 'assignment',
      label: `Assigned: ${title}`,
      detail: goal,
      taskId,
    })
    setAssignDraft(null)
  }

  if (!agent) return null

  const starters = agent.starters.slice(0, 3)
  const quickActions = [
    { id: 'assign', label: 'Assign work', run: () => setAssignDraft('') },
    { id: 'remember', label: 'Remember', run: () => window.setTimeout(() => focusComposer(), 0) },
    { id: 'tasks', label: 'Assigned work', run: () => (setInspectorOpen(true), setInspectorTab('work')) },
  ]

  function focusComposer() {
    const textarea = document.getElementById(
      `agent-composer-${agentId}`,
    ) as HTMLTextAreaElement | null
    textarea?.focus()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageToolbar>
        <button
          type="button"
          onClick={() => navigate('/agents')}
          aria-label="Back to Agents"
          className="min-touch -ml-1 rounded-control p-1.5 text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronDown size={16} className="rotate-90" aria-hidden="true" />
        </button>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">
          {initials(agent.name)}
        </span>
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-ink">
          {agent.name}
        </h1>
        <StatusPill label={availability.label} tone={availability.tone} dot={availability.live} />
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <PencilLine size={14} />
          <span className="hidden sm:inline">Edit</span>
        </Button>
        <button
          type="button"
          onClick={() => setInspectorOpen((value) => !value)}
          aria-expanded={inspectorOpen}
          className="min-touch rounded-control px-2 py-1 text-[13px] font-medium text-ink-soft transition-colors hover:bg-subtle hover:text-ink"
        >
          {inspectorOpen ? 'Hide profile' : 'Profile'}
        </button>
      </PageToolbar>

      {/* The employee's thread */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ThreadView
          entries={entries}
          ariaLabel={`Conversation with ${agent.name}`}
          emptyState={
            <div className="mx-auto w-full max-w-column px-4 py-10">
              <div className="rounded-group border border-line bg-raised p-5 text-center">
                <p className="text-[15px] font-semibold text-ink">
                  Message {agent.name} directly
                </p>
                <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-soft">
                  {agent.description || 'A persistent local employee profile.'} This thread
                  keeps its history and stays with this employee.
                </p>
                {starters.length > 0 && (
                  <ul className="mt-4 flex flex-col items-center gap-1.5">
                    {starters.map((starter) => (
                      <li key={starter}>
                        <button
                          type="button"
                          onClick={() => focusComposerWith(starter)}
                          className="min-touch rounded-full border border-line bg-raised px-3.5 py-1.5 text-[13px] text-ink transition-colors hover:bg-subtle"
                        >
                          {starter}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          }
        />

        {/* Inline assignment brief */}
        {assignDraft !== null && (
          <div className="mx-auto w-full max-w-column px-3 pt-1 sm:px-4">
            <div className="rounded-group border border-accent/40 bg-accent-soft/40 p-3.5">
              <p className="text-[13px] font-medium text-ink">
                Assign work to {agent.name}
              </p>
              <textarea
                value={assignDraft}
                onChange={(event) => setAssignDraft(event.target.value)}
                rows={2}
                placeholder="What should this employee work on?"
                aria-label="Assignment brief"
                className="mt-2 w-full resize-y rounded-control border border-line bg-panel px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setAssignDraft(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!assignDraft.trim()}
                  onClick={() => createAssignment(assignDraft)}
                >
                  <Plus size={13} />
                  Create task
                </Button>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
                Creates one real local Work task assigned to {agent.name} — the same task,
                not a copy.
              </p>
            </div>
          </div>
        )}

        <ThreadPluginBar
          thread={{ kind: 'agent', agentId, conversationId }}
          agentId={agentId}
        />

        <ThreadComposer
          draftKey={`agent:${agentId}`}
          textareaId={`agent-composer-${agentId}`}
          ariaLabel={`Message ${agent.name}`}
          placeholder={`Message ${agent.name}… or /assign, /remember, /task`}
          statusLabel={<AgentStatusLine agent={agent} conversationId={conversationId} />}
          busy={busy}
          onStop={() => useAppStore.getState().stopGeneration()}
          onSend={handleSend}
          actions={quickActions.map((action) => ({
            id: action.id,
            label: action.label,
            onRun: action.run,
          }))}
        />
      </div>

      {/* Inspector — modal sheet on mobile, non-modal docked panel on
          desktop (real focus behavior in both, F07). */}
      <InspectorPanel
        open={inspectorOpen}
        onClose={() => setInspectorOpen(false)}
        label={`${agent.name} details`}
      >
        <EmployeeInspector agentId={agentId} tab={inspectorTab} onTab={setInspectorTab} />
      </InspectorPanel>
    </div>
  )

  function focusComposerWith(text: string) {
    const textarea = document.getElementById(
      `agent-composer-${agentId}`,
    ) as HTMLTextAreaElement | null
    if (textarea) {
      textarea.focus()
      // Set through the DOM value + input event so React state picks it up.
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        'value',
      )?.set
      setter?.call(textarea, text)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }
}

/* ------------------------------------------------------------------ */
/* Availability — derived from real state only                         */
/* ------------------------------------------------------------------ */

function deriveAvailability(
  agentId: string,
  conversation: { nodes: Record<string, { role: string; status: string }> } | null,
  tasks: Record<string, { agentId: string | null; status: string; mode: string; title: string }>,
): { label: string; tone: 'neutral' | 'accent' | 'warning'; live: boolean } {
  if (conversation) {
    const leaf = Object.values(conversation.nodes).at(-1)
    if (leaf?.role === 'assistant' && leaf.status === 'streaming') {
      return { label: 'Responding…', tone: 'accent', live: true }
    }
  }
  const assigned = Object.values(tasks).filter((task) => task.agentId === agentId)
  const active = assigned.find((task) => task.status === 'running' || task.status === 'queued')
  if (active) {
    return {
      label: `Working on “${truncate(active.title, 24)}”`,
      tone: 'accent',
      live: true,
    }
  }
  const waiting = assigned.find((task) => task.status === 'needs_input')
  if (waiting) {
    return { label: 'Waiting for your input', tone: 'warning', live: false }
  }
  return { label: 'Available in this app', tone: 'neutral', live: false }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

/* ------------------------------------------------------------------ */
/* Honest status line                                                  */
/* ------------------------------------------------------------------ */

function AgentStatusLine({
  agent,
  conversationId,
}: {
  agent: AgentProfile
  conversationId: string
}) {
  const isLive = useAppStore((state) => {
    const conversation = state.conversations[conversationId]
    if (conversation?.temporary) return false
    const providerId = agent.providerId ?? state.activeProviderId
    if (!providerId) return false
    const credential = state.credentials[providerId]
    return credential?.status === 'connected' && !!credential.apiKey
  })
  if (isLive) {
    return (
      <>
        Live with your connected model — this employee’s instructions scope every request.
        Memory notes for {agent.name} are included in every request to this thread (up
        to 20 notes, about 4,000 characters — the Memory panel shows exactly what is
        saved).
      </>
    )
  }
  return (
    <>
      Local demo — replies are simulated on this device. Explicit commands (/assign,
      /remember) run real local actions; nothing else executes automatically.
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Inspector                                                           */
/* ------------------------------------------------------------------ */

function EmployeeInspector({
  agentId,
  tab,
  onTab,
}: {
  agentId: string
  tab: InspectorTab
  onTab: (tab: InspectorTab) => void
}) {
  const tabs: { id: InspectorTab; label: string }[] = [
    { id: 'profile', label: 'Profile' },
    { id: 'memory', label: 'Memory' },
    { id: 'work', label: 'Work' },
    { id: 'plugins', label: 'Plugins' },
    { id: 'routines', label: 'Routines' },
  ]
  return (
    <div className="px-3 py-3">
      <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Employee sections">
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => onTab(entry.id)}
            className={`min-touch shrink-0 rounded-control px-2.5 py-1 text-[13px] font-medium transition-colors ${
              tab === entry.id ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-subtle'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="mt-3">
        {tab === 'profile' && <ProfilePanel agentId={agentId} />}
        {tab === 'memory' && <MemoryPanel agentId={agentId} />}
        {tab === 'work' && <WorkPanel agentId={agentId} />}
        {tab === 'plugins' && <PluginsPanel agentId={agentId} />}
        {tab === 'routines' && <RoutinesPanel agentId={agentId} />}
      </div>
    </div>
  )
}

function ProfilePanel({ agentId }: { agentId: string }) {
  const agent = useAgentsStore((state) => state.agents[agentId])
  if (!agent) return null
  return (
    <section aria-label="Profile" className="flex flex-col gap-3">
      <div className="rounded-group border border-line bg-raised p-3.5">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[15px] font-semibold text-accent">
            {initials(agent.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold text-ink">{agent.name}</p>
            <p className="truncate text-xs text-ink-faint">
              {agent.category === 'personal' ? 'Personal assistant' : 'Specialist'}
              {agent.builtin ? ' · built-in example' : ''}
            </p>
          </div>
        </div>
        <p className="mt-2.5 text-[13px] leading-relaxed text-ink-soft">{agent.description}</p>
      </div>
      <div className="rounded-group border border-line bg-raised p-3.5">
        <h2 className="text-[12px] font-medium text-ink-faint">Job description</h2>
        <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
          {agent.instructions}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
          These instructions scope every request in this employee’s thread.
        </p>
      </div>
      <div className="rounded-group border border-line bg-raised p-3.5">
        <h2 className="text-[12px] font-medium text-ink-faint">Effective configuration</h2>
        <EffectiveConfig agent={agent} />
      </div>
    </section>
  )
}

function EffectiveConfig({ agent }: { agent: AgentProfile }) {
  const providers = useAppStore((state) => state.providers)
  const credentials = useAppStore((state) => state.credentials)
  const providerId = agent.providerId ?? useAppStore.getState().activeProviderId
  const provider = providers.find((p) => p.id === providerId)
  const live = provider
    ? credentials[provider.id]?.status === 'connected' && !!credentials[provider.id].apiKey
    : false
  const model = provider?.models.find((m) => m.id === agent.modelId)
  return (
    <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
      {provider ? (
        <>
          {model ? `${model.label} — ` : ''}
          {provider.label} ·{' '}
          {live ? (
            <span className="font-medium text-success">live with your key</span>
          ) : (
            <span className="font-medium">local demo</span>
          )}
          {agent.providerId ? ' (agent preference)' : ' (global chat settings)'}
        </>
      ) : (
        'No provider configured — replies use the local demo.'
      )}
    </p>
  )
}

function MemoryPanel({ agentId }: { agentId: string }) {
  const agent = useAgentsStore((state) => state.agents[agentId])
  const notes = useAgentsStore((state) => state.memoryNotes)
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const mine = useMemo(
    () =>
      Object.values(notes)
        .filter((note) => note.agentId === agentId)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [notes, agentId],
  )

  function handleAdd() {
    const trimmed = draft.trim()
    if (!trimmed) return
    const noteId = useAgentsStore.getState().addMemoryNote(agentId, trimmed)
    if (noteId) {
      useAgentsStore.getState().addThreadEvent({
        agentId,
        kind: 'memory_note',
        label: `Remembered: ${trimmed}`,
        detail: 'Saved locally — included in future requests to this thread.',
        noteId,
      })
      setDraft('')
    }
  }

  return (
    <section aria-label="Memory" className="flex flex-col gap-3">
      <div className="rounded-group border border-line bg-raised p-3.5">
        <h2 className="flex items-center gap-1.5 text-[12px] font-medium text-ink-faint">
          <Brain size={13} />
          Memory notes
        </h2>
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-soft">
          Notes you add are saved locally for {agent?.name ?? 'this assistant'} and are
          included in every request to this thread — up to {AGENT_MEMORY_MAX_NOTES} notes
          and about {AGENT_MEMORY_MAX_CHARS.toLocaleString()} characters, newest first.
          Notes belong to this employee only; ordinary Chat and other employees never
          see them. Nothing is collected automatically. Removing a note stops it from
          being included — past messages keep showing what was originally sent.
        </p>
        <div className="mt-2.5 flex gap-2">
          <input
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleAdd()
            }}
            placeholder="e.g. Prefers concise answers with examples"
            aria-label="New memory note"
            className="min-touch min-w-0 flex-1 rounded-control border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
          />
          <Button variant="primary" size="sm" disabled={!draft.trim()} onClick={handleAdd}>
            <Plus size={14} />
            Add
          </Button>
        </div>
      </div>
      {mine.length === 0 ? (
        <p className="px-1 text-xs text-ink-faint">
          No notes yet — add facts or preferences you want remembered.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {mine.map((note: MemoryNote) => (
            <li key={note.id} className="rounded-[12px] border border-line bg-raised px-3.5 py-2.5">
              {editingId === note.id ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editText}
                    onChange={(event) => setEditText(event.target.value)}
                    aria-label="Edit memory note"
                    className="min-touch min-w-0 flex-1 rounded-control border border-line bg-panel px-3 py-1.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      useAgentsStore.getState().updateMemoryNote(note.id, editText)
                      setEditingId(null)
                    }}
                  >
                    Save
                  </Button>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink">{note.text}</p>
                  <div className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      aria-label="Edit note"
                      onClick={() => {
                        setEditingId(note.id)
                        setEditText(note.text)
                      }}
                      className="min-touch rounded-control p-1 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
                    >
                      <PencilLine size={13} />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete note"
                      onClick={() => {
                        useAgentsStore.getState().deleteMemoryNote(note.id)
                        useAppStore.getState().showToast(
                          'Removed from future requests. Earlier messages in this thread still show the text as it was originally sent.',
                        )
                      }}
                      className="min-touch rounded-control p-1 text-ink-faint transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function WorkPanel({ agentId }: { agentId: string }) {
  const navigate = useNavigate()
  const tasks = useWorkStore((state) => state.tasks)
  const assigned = useMemo(
    () =>
      Object.values(tasks)
        .filter((task) => task.agentId === agentId)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [tasks, agentId],
  )
  return (
    <section aria-label="Assigned work" className="flex flex-col gap-2">
      {assigned.length === 0 ? (
        <div className="rounded-group border border-line bg-raised px-3.5 py-6 text-center">
          <Briefcase size={20} className="mx-auto text-ink-faint" aria-hidden="true" />
          <p className="mt-2 text-[13px] font-medium text-ink">No assigned work yet</p>
          <p className="mx-auto mt-1 max-w-[16rem] text-xs leading-relaxed text-ink-soft">
            Use /assign in the thread — it creates one real local Work task, the same task
            you see in Work.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {assigned.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => navigate(`/work/${task.id}`)}
                className="flex w-full items-center gap-3 rounded-group border border-line bg-raised px-3.5 py-2.5 text-left transition-colors hover:bg-subtle"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-ink">
                    {task.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-ink-faint">
                    {task.goal || 'No goal described'}
                  </span>
                </span>
                <StatusPill
                  label={TASK_STATUS_LABELS[task.status]}
                  tone={TASK_STATUS_TONES[task.status]}
                  dot={task.status === 'running'}
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PluginsPanel({ agentId }: { agentId: string }) {
  const navigate = useNavigate()
  const enabled = usePluginsStore((state) => state.enabled)
  const agentAllowed = usePluginsStore((state) => state.agentAllowed[agentId] ?? [])
  const setAgentAllowed = usePluginsStore((state) => state.setAgentAllowed)
  const allowed = new Set(agentAllowed)

  const enabledBuiltins = PLUGIN_CATALOG.filter(
    (plugin) => plugin.builtin && enabled[plugin.id],
  )

  return (
    <section aria-label="Plugins" className="flex flex-col gap-3">
      <div className="rounded-group border border-line bg-raised p-3.5">
        <h2 className="flex items-center gap-1.5 text-[12px] font-medium text-ink-faint">
          <Puzzle size={13} />
          Plugin access
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
          Effective access is the intersection of the workspace, this employee, and the
          thread grant — the dispatcher enforces all three.
        </p>
        {enabledBuiltins.length === 0 ? (
          <>
            <p className="mt-2 text-xs text-ink-faint">
              No workspace plugins are enabled yet.
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => navigate('/plugins')}
            >
              <Puzzle size={13} />
              Open Plugins
            </Button>
          </>
        ) : (
          <ul className="mt-2.5 flex flex-col gap-2">
            {enabledBuiltins.map((plugin) => {
              const isAllowed = allowed.has(plugin.id)
              return (
                <li key={plugin.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {plugin.name}
                    </span>
                    <span className="block text-[11px] text-ink-faint">
                      {isAllowed ? 'Allowed for this employee' : 'Not allowed'}
                    </span>
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isAllowed}
                    aria-label={`Allow ${plugin.name} for this employee`}
                    onClick={() =>
                      setAgentAllowed(
                        agentId,
                        isAllowed
                          ? agentAllowed.filter((id) => id !== plugin.id)
                          : [...agentAllowed, plugin.id],
                      )
                    }
                    className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
                      isAllowed ? 'bg-accent' : 'bg-subtle'
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                        isAllowed ? 'left-[18px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

function RoutinesPanel({ agentId }: { agentId: string }) {
  const schedules = useAgentsStore((state) => state.schedules)
  const mine = useMemo(
    () =>
      Object.values(schedules)
        .filter((schedule) => schedule.agentId === agentId)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [schedules, agentId],
  )
  const [name, setName] = useState('')
  const [instructions, setInstructions] = useState('')

  function handleSave() {
    if (!name.trim() || !instructions.trim()) return
    useAgentsStore.getState().saveSchedule({
      id: `sched-${Date.now()}`,
      agentId,
      name: name.trim(),
      cadence: 'recurring',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      instructions: instructions.trim(),
      condition: '',
      enabledIntent: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    useAgentsStore.getState().addThreadEvent({
      agentId,
      kind: 'routine',
      label: `Routine saved: ${name.trim()}`,
      detail: 'Saved locally — execution unavailable until a scheduler exists.',
    })
    setName('')
    setInstructions('')
  }

  return (
    <section aria-label="Routines" className="flex flex-col gap-3">
      <div className="rounded-group border border-line bg-raised p-3.5">
        <h2 className="flex items-center gap-1.5 text-[12px] font-medium text-ink-faint">
          <CalendarClock size={13} />
          New routine draft
        </h2>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Routine name"
          aria-label="Routine name"
          className="min-touch mt-2 w-full rounded-control border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
        />
        <textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          rows={3}
          placeholder="What should happen, and when? (timezone: local)"
          aria-label="Routine instructions"
          className="mt-2 w-full resize-y rounded-control border border-line bg-panel px-3 py-2 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-[11px] leading-relaxed text-ink-faint">
            Saved locally — execution unavailable.
          </p>
          <Button
            variant="primary"
            size="sm"
            disabled={!name.trim() || !instructions.trim()}
            onClick={handleSave}
          >
            Save draft
          </Button>
        </div>
      </div>
      {mine.length > 0 && (
        <ul className="flex flex-col gap-2">
          {mine.map((schedule: ScheduleDraft) => (
            <li
              key={schedule.id}
              className="flex items-start justify-between gap-2 rounded-[12px] border border-line bg-raised px-3.5 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-[13px] font-medium text-ink">{schedule.name}</p>
                <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-ink-soft">
                  {schedule.instructions}
                </p>
                <p className="mt-1 text-[11px] text-ink-faint">
                  {schedule.timezone} · saved locally — execution unavailable
                </p>
              </div>
              <button
                type="button"
                aria-label={`Delete routine ${schedule.name}`}
                onClick={() => useAgentsStore.getState().deleteSchedule(schedule.id)}
                className="min-touch shrink-0 rounded-control p-1 text-ink-faint transition-colors hover:bg-danger-soft hover:text-danger"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
