import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  Bot,
  Check,
  Copy,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Wrench,
} from 'lucide-react'
import { useAgentsStore } from '@/state/agentsStore'
import { useAppStore } from '@/state/store'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { StatusPill } from '@/components/ui/StatusPill'
import { TOOL_REGISTRY } from '@/features/chat/toolRegistry'
import { PersonalAssistantView } from './PersonalAssistantView'
import type { AgentProfile } from '@/domain/workspaceTypes'
import type { ToolId } from '@/domain/types'

/**
 * Agents — reusable instruction profiles. The seeded Universe Assistant is
 * the personal assistant (its own view); specialists are clearly-labeled
 * local profiles. Create/edit/duplicate/archive are real local actions;
 * profiles never claim external access.
 */
export function AgentsPage() {
  const { agentId } = useParams()

  if (agentId === 'new') {
    return <AgentBuilder />
  }
  if (agentId) {
    return <AgentDetail agentId={agentId} />
  }
  return <AgentDirectory />
}

/* ------------------------------------------------------------------ */
/* Directory                                                           */
/* ------------------------------------------------------------------ */

function AgentDirectory() {
  const navigate = useNavigate()
  const agents = useAgentsStore((state) => state.agents)
  const [query, setQuery] = useState('')

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return Object.values(agents)
      .filter((agent) => !agent.archived)
      .filter(
        (agent) =>
          !normalized ||
          agent.name.toLowerCase().includes(normalized) ||
          agent.description.toLowerCase().includes(normalized),
      )
      .sort((a, b) => a.createdAt - b.createdAt)
  }, [agents, query])

  const personal = visible.filter((agent) => agent.category === 'personal')
  const specialists = visible.filter((agent) => agent.category === 'specialist')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="material safe-left safe-right sticky top-0 z-30 flex h-13 shrink-0 items-center gap-2 border-b border-line bg-mat-header px-2 sm:px-4">
        <h1 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Bot size={16} className="text-ink-faint" />
          Agents
        </h1>
        <span className="hidden text-xs text-ink-faint sm:inline">
          Reusable local profiles
        </span>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-column px-3 py-6 sm:px-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-ink">Agents</h2>
              <p className="mt-0.5 text-sm text-ink-soft">
                Persistent instructions you can chat with or assign work to.
              </p>
            </div>
            <Button variant="primary" onClick={() => navigate('/agents/new')}>
              <Plus size={16} />
              New agent
            </Button>
          </div>

          <div className="relative mt-5">
            <Search
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search agents"
              aria-label="Search agents"
              className="min-touch w-full rounded-control border border-line bg-raised py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
            />
          </div>

          {visible.length === 0 ? (
            <div className="mt-6 rounded-group border border-line bg-raised px-6 py-10 text-center">
              <Bot size={28} className="mx-auto text-ink-faint" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-ink">
                {query ? 'No matching agents' : 'No agents yet'}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-soft">
                {query
                  ? 'Try a different search, or create a new agent.'
                  : 'Agents are reusable instruction profiles stored on this device.'}
              </p>
            </div>
          ) : (
            <>
              {personal.length > 0 && (
                <section className="mt-6" aria-label="Personal assistant">
                  <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                    Personal assistant
                  </p>
                  <ul className="mt-2 flex flex-col gap-2">
                    {personal.map((agent) => (
                      <AgentCard key={agent.id} agent={agent} />
                    ))}
                  </ul>
                </section>
              )}

              <section className="mt-6" aria-label="Specialists">
                <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                  Specialists
                </p>
                {specialists.length === 0 ? (
                  <p className="mt-2 rounded-group border border-line bg-raised px-4 py-6 text-center text-sm text-ink-soft">
                    No specialist profiles match.
                  </p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-2">
                    {specialists.map((agent) => (
                      <AgentCard key={agent.id} agent={agent} />
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function AgentCard({ agent }: { agent: AgentProfile }) {
  const navigate = useNavigate()
  return (
    <li>
      <div className="flex items-stretch rounded-group border border-line bg-raised transition-colors hover:bg-subtle">
        <button
          type="button"
          onClick={() => navigate(`/agents/${agent.id}`)}
          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            {agent.category === 'personal' ? <Sparkles size={17} /> : <Bot size={17} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="truncate text-sm font-medium text-ink">{agent.name}</span>
              {agent.builtin && (
                <span className="rounded-full bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">
                  Built-in
                </span>
              )}
            </span>
            <span className="mt-0.5 block truncate text-xs text-ink-faint">
              {agent.description || 'No description'}
            </span>
            {agent.tools.length > 0 && (
              <span className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-ink-faint">
                <Wrench size={11} aria-hidden="true" />
                {agent.tools
                  .map((tool) => TOOL_REGISTRY.find((entry) => entry.id === tool)?.label ?? tool)
                  .join(' · ')}
              </span>
            )}
          </span>
        </button>
        <AgentCardMenu agentId={agent.id} />
      </div>
    </li>
  )
}

function AgentCardMenu({ agentId }: { agentId: string }) {
  const navigate = useNavigate()
  const agent = useAgentsStore((state) => state.agents[agentId])
  const showToast = useAppStore((state) => state.showToast)
  const openAgentConversation = useAppStore((state) => state.openAgentConversation)
  if (!agent) return null

  function handleChat() {
    const id = openAgentConversation(agentId)
    navigate(`/c/${id}`)
  }

  function handleAssign() {
    navigate(`/work/new?agent=${agentId}`)
  }

  return (
    <div className="flex items-center pr-1.5">
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="sm" onClick={handleChat}>
          <MessageSquare size={14} />
          <span className="hidden sm:inline">Chat</span>
        </Button>
        <Menu
          label="Agent actions"
          trigger={
            <button
              type="button"
              aria-label={`Actions for ${agent.name}`}
              className="min-touch rounded-control p-1.5 text-ink-faint transition-colors hover:bg-[var(--c-hover-wash)] hover:text-ink"
            >
              <MoreHorizontal size={16} />
            </button>
          }
        >
          <MenuItem icon={<MessageSquare size={15} />} onClick={handleChat}>
            Chat with agent
          </MenuItem>
          <MenuItem icon={<Plus size={15} />} onClick={handleAssign}>
            Assign task
          </MenuItem>
          <MenuItem icon={<Copy size={15} />} onClick={() => {
            const id = useAgentsStore.getState().duplicateAgent(agentId)
            if (id) {
              showToast('Agent duplicated')
              navigate(`/agents/${id}`)
            }
          }}>
            Duplicate
          </MenuItem>
          <MenuItem
            icon={agent.archived ? <ArchiveRestore size={15} /> : <Archive size={15} />}
            onClick={() => {
              useAgentsStore.getState().archiveAgent(agentId, !agent.archived)
              showToast(agent.archived ? 'Agent restored' : 'Agent archived')
            }}
          >
            {agent.archived ? 'Unarchive' : 'Archive'}
          </MenuItem>
        </Menu>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Detail (specialist or archived) — profile + edit entry              */
/* ------------------------------------------------------------------ */

function AgentDetail({ agentId }: { agentId: string }) {
  const navigate = useNavigate()
  const agent = useAgentsStore((state) => state.agents[agentId])
  const hydrated = useAgentsStore((state) => state.hydrated)
  const [editMode, setEditMode] = useState(false)

  // Wait for hydration before judging an id unknown — a direct load
  // renders before the store's initialize() has seeded the profiles.
  useEffect(() => {
    if (!hydrated) return
    if (!agent && !editMode) navigate('/agents', { replace: true })
  }, [agent, editMode, hydrated, navigate])

  if (!agent) {
    // Unknown (or not-yet-hydrated) id: nothing to render yet.
    return null
  }

  // The personal assistant gets its own dedicated experience.
  if (agent.category === 'personal' && !editMode) {
    return <PersonalAssistantView agentId={agentId} onEdit={() => setEditMode(true)} />
  }

  if (editMode) {
    return <AgentBuilder existing={agent} onDone={() => setEditMode(false)} />
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="material safe-left safe-right sticky top-0 z-30 flex h-13 shrink-0 items-center gap-2 border-b border-line bg-mat-header px-2 sm:px-4">
        <button
          type="button"
          onClick={() => navigate('/agents')}
          aria-label="Back to Agents"
          className="min-touch -ml-1 rounded-control p-1.5 text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{agent.name}</h1>
        {agent.archived && <StatusPill label="Archived" tone="neutral" />}
      </header>
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-column px-3 py-6 sm:px-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <Bot size={20} />
              </span>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-ink">{agent.name}</h2>
                <p className="text-sm text-ink-soft">{agent.description}</p>
              </div>
            </div>
            <Button variant="secondary" onClick={() => setEditMode(true)}>
              Edit profile
            </Button>
          </div>

          <section className="mt-5 rounded-group border border-line bg-raised p-4 sm:p-5">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Instructions
            </h3>
            <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
              {agent.instructions}
            </p>
          </section>

          {agent.tools.length > 0 && (
            <section className="mt-4 rounded-group border border-line bg-raised p-4 sm:p-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Tools referenced
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                {agent.tools
                  .map((tool) => TOOL_REGISTRY.find((entry) => entry.id === tool)?.label ?? tool)
                  .join(' · ')}{' '}
                — available in chat; Work execution remains a local demo.
              </p>
            </section>
          )}

          {agent.starters.length > 0 && (
            <section className="mt-4 rounded-group border border-line bg-raised p-4 sm:p-5">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Example starters
              </h3>
              <ul className="mt-2 flex flex-col gap-1.5">
                {agent.starters.map((starter) => (
                  <li key={starter} className="text-sm text-ink">
                    {starter}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="mt-5 flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => {
                const id = useAppStore.getState().openAgentConversation(agentId)
                navigate(`/c/${id}`)
              }}
            >
              <MessageSquare size={15} />
              Chat with agent
            </Button>
            <Button variant="secondary" onClick={() => navigate(`/work/new?agent=${agentId}`)}>
              <Plus size={15} />
              Assign task
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ChevronLeft() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Builder — create / edit                                             */
/* ------------------------------------------------------------------ */

function AgentBuilder({
  existing,
  onDone,
}: {
  existing?: AgentProfile
  onDone?: () => void
}) {
  const navigate = useNavigate()
  const saveAgent = useAgentsStore((state) => state.saveAgent)
  const providers = useAppStore((state) => state.providers)

  const [name, setName] = useState(existing?.name ?? '')
  const [description, setDescription] = useState(existing?.description ?? '')
  const [instructions, setInstructions] = useState(existing?.instructions ?? '')
  const [category, setCategory] = useState<'personal' | 'specialist'>(
    existing?.category ?? 'specialist',
  )
  const [providerId, setProviderId] = useState<string>(existing?.providerId ?? '')
  const [modelId, setModelId] = useState<string>(existing?.modelId ?? '')
  const [tools, setTools] = useState<ToolId[]>(existing?.tools ?? [])
  const [startersText, setStartersText] = useState((existing?.starters ?? []).join('\n'))
  const [errors, setErrors] = useState<string[]>([])

  const selectedProvider = providers.find((p) => p.id === providerId)

  function validate(): string[] {
    const found: string[] = []
    if (!name.trim()) found.push('Give the agent a name.')
    if (!instructions.trim()) found.push('Write at least one line of instructions.')
    if (providerId && !providers.some((p) => p.id === providerId)) {
      found.push('The selected provider no longer exists — pick another or clear it.')
    }
    if (providerId && modelId && selectedProvider) {
      const known =
        selectedProvider.models.some((m) => m.id === modelId) ||
        (useAppStore.getState().credentials[selectedProvider.id]?.discoveredModels ?? []).includes(
          modelId,
        )
      if (!known) found.push('The selected model is not known for that provider.')
    }
    return found
  }

  function handleSave() {
    const found = validate()
    setErrors(found)
    if (found.length > 0) return

    const profile: AgentProfile = {
      id: existing?.id ?? makeAgentId(),
      name: name.trim(),
      description: description.trim(),
      instructions: instructions.trim(),
      category: existing?.category === 'personal' ? 'personal' : category,
      providerId: providerId || null,
      modelId: modelId || null,
      tools,
      projectIds: existing?.projectIds ?? [],
      starters: startersText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 6),
      archived: existing?.archived ?? false,
      builtin: existing?.builtin ?? false,
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    }
    saveAgent(profile)
    if (onDone) {
      onDone()
    } else {
      navigate(`/agents/${profile.id}`)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="material safe-left safe-right sticky top-0 z-30 flex h-13 shrink-0 items-center gap-2 border-b border-line bg-mat-header px-2 sm:px-4">
        <button
          type="button"
          onClick={() => (onDone ? onDone() : navigate('/agents'))}
          aria-label="Cancel and go back"
          className="min-touch -ml-1 rounded-control p-1.5 text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft />
        </button>
        <h1 className="text-sm font-semibold text-ink">
          {existing ? `Edit ${existing.name}` : 'New agent'}
        </h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-column px-3 py-6 sm:px-4">
          <div className="flex flex-col gap-4 rounded-group border border-line bg-raised p-4 sm:p-5">
            <TextField
              label="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Research Analyst"
            />
            <TextField
              label="Description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What is this agent for?"
            />

            <div>
              <label
                htmlFor="agent-instructions"
                className="mb-1.5 block text-sm font-medium text-ink"
              >
                Instructions
              </label>
              <textarea
                id="agent-instructions"
                value={instructions}
                onChange={(event) => setInstructions(event.target.value)}
                rows={5}
                placeholder="How should this agent think, answer, and behave?"
                className="w-full resize-y rounded-control border border-line bg-panel px-3 py-2.5 text-sm leading-relaxed text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
              />
              <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">
                Instructions are sent as the system prompt when you chat with this agent —
                through your own connected provider, or the local demo.
              </p>
            </div>

            {existing?.category !== 'personal' && (
              <fieldset>
                <legend className="mb-1.5 block text-sm font-medium text-ink">Category</legend>
                <div className="flex flex-wrap gap-2">
                  {(['specialist', 'personal'] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setCategory(option)}
                      aria-pressed={category === option}
                      className={`min-touch rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                        category === option
                          ? 'border-accent bg-accent-soft font-medium text-accent'
                          : 'border-line text-ink hover:bg-subtle'
                      }`}
                    >
                      {option === 'specialist' ? 'Specialist' : 'Personal assistant'}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="agent-provider"
                  className="mb-1.5 block text-sm font-medium text-ink"
                >
                  Provider preference (optional)
                </label>
                <select
                  id="agent-provider"
                  value={providerId}
                  onChange={(event) => {
                    setProviderId(event.target.value)
                    setModelId('')
                  }}
                  className="min-touch w-full rounded-control border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
                >
                  <option value="">Use whatever is active in chat</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                      {provider.demo ? ' (demo)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="agent-model"
                  className="mb-1.5 block text-sm font-medium text-ink"
                >
                  Model preference (optional)
                </label>
                <select
                  id="agent-model"
                  value={modelId}
                  disabled={!selectedProvider}
                  onChange={(event) => setModelId(event.target.value)}
                  className="min-touch w-full rounded-control border border-line bg-panel px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)] disabled:opacity-50"
                >
                  <option value="">
                    {selectedProvider ? 'Use provider default' : 'Pick a provider first'}
                  </option>
                  {selectedProvider?.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <fieldset>
              <legend className="mb-1.5 block text-sm font-medium text-ink">Tools</legend>
              <div className="flex flex-wrap gap-2">
                {TOOL_REGISTRY.map((tool) => {
                  const selected = tools.includes(tool.id)
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() =>
                        setTools((previous) =>
                          previous.includes(tool.id)
                            ? previous.filter((item) => item !== tool.id)
                            : [...previous, tool.id],
                        )
                      }
                      aria-pressed={selected}
                      className={`flex min-touch items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                        selected
                          ? 'border-accent bg-accent-soft font-medium text-accent'
                          : 'border-line text-ink hover:bg-subtle'
                      }`}
                    >
                      {selected && <Check size={13} aria-hidden="true" />}
                      {tool.label}
                    </button>
                  )
                })}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">
                Tool picks describe the agent; chat tools stay capability-gated, and Work
                execution remains a local demo.
              </p>
            </fieldset>

            <div>
              <label
                htmlFor="agent-starters"
                className="mb-1.5 block text-sm font-medium text-ink"
              >
                Example starters (one per line)
              </label>
              <textarea
                id="agent-starters"
                value={startersText}
                onChange={(event) => setStartersText(event.target.value)}
                rows={3}
                className="w-full resize-y rounded-control border border-line bg-panel px-3 py-2.5 text-sm leading-relaxed text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
              />
            </div>

            {errors.length > 0 && (
              <div role="alert" className="rounded-[12px] border border-danger/40 bg-danger-soft px-3.5 py-2.5">
                <ul className="text-xs leading-relaxed text-danger">
                  {errors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => (onDone ? onDone() : navigate('/agents'))}>
                Cancel
              </Button>
              <Button variant="primary" onClick={handleSave}>
                {existing ? 'Save changes' : 'Create agent'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function makeAgentId(): string {
  return `agent-${crypto.randomUUID()}`
}
