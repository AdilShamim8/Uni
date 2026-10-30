import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Archive,
  ArchiveRestore,
  Bot,
  Check,
  Copy,
  Download,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Upload,
  Wrench,
  Zap,
} from 'lucide-react'
import { useAgentsStore, UNI_BOT_AGENT_ID } from '@/state/agentsStore'
import { useAppStore } from '@/state/store'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { HeaderExtras } from '@/components/layout/HeaderExtras'
import { PageToolbar } from '@/components/layout/PageToolbar'
import { MobileMenuButton } from '@/components/layout/MobileMenuButton'
import { TOOL_REGISTRY } from '@/features/chat/toolRegistry'
import { AGENT_TEMPLATES } from '@/features/agents/agentTemplates'
import { exportAgentFile, importAgentJson } from '@/features/agents/agentPortability'
import {
  AGENT_GALLERY,
  installGalleryAgent,
  isGalleryAgentInstalled,
} from '@/features/agents/agentGallery'
import { saveThreadDraft } from '@/features/conversation/threadDrafts'
import { EmployeeView } from './EmployeeView'
import type { AgentProfile } from '@/domain/workspaceTypes'
import type { ToolId } from '@/domain/types'

/**
 * Agents — reusable instruction profiles. The seeded Uni Assistant is
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
  const showToast = useAppStore((state) => state.showToast)
  const [query, setQuery] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function handleImportFile(file: File): void {
    void file.text().then((text) => {
      const result = importAgentJson(text)
      if (result.ok) {
        showToast('Agent imported')
        navigate(`/agents/${result.agentId}`)
      } else {
        showToast(`Import failed: ${result.error}`)
      }
    })
  }

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
  const specialists = visible.filter(
    (agent) => agent.category === 'specialist' && agent.id !== UNI_BOT_AGENT_ID,
  )
  // The featured teammate surfaces as its own hero when it matches the
  // current filter (and is not archived) — otherwise it simply does not
  // appear, exactly like any other filtered-out profile.
  const featured = visible.find((agent) => agent.id === UNI_BOT_AGENT_ID) ?? null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageToolbar>
        <div className="lg:hidden">
          <MobileMenuButton />
        </div>
        <h1 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
          <Bot size={16} className="text-ink-faint" />
          Agents
        </h1>
        <span className="hidden text-xs text-ink-faint sm:inline">
          Reusable local profiles
        </span>
        <div className="flex-1" />
        <HeaderExtras />
      </PageToolbar>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-column px-3 py-6 sm:px-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-ink">Your AI teammates</h2>
              <p className="mt-0.5 text-sm text-ink-soft">
                Persistent profiles you can chat with or assign real work to.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) handleImportFile(file)
                  // Reset so picking the same file twice re-fires change.
                  event.target.value = ''
                }}
              />
              <Button
                variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Import an agent profile from a JSON file"
              >
                <Upload size={16} />
                Import
              </Button>
              <Button variant="primary" onClick={() => navigate('/agents/new')}>
                <Plus size={16} />
                New agent
              </Button>
            </div>
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
              {featured && (
                <section className="mt-6" aria-label="Featured teammate">
                  <p className="px-1 text-[12px] font-medium text-ink-faint">Featured</p>
                  <UniBotHero agent={featured} />
                </section>
              )}

              {personal.length > 0 && (
                <section className="mt-6" aria-label="Personal assistant">
                  <p className="px-1 text-[12px] font-medium text-ink-faint">
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
                <p className="px-1 text-[12px] font-medium text-ink-faint">
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

          <GallerySection />
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Community gallery                                                   */
/* ------------------------------------------------------------------ */

/**
 * The community gallery — curated, offline, one tap away. Every entry
 * installs through the standard import path and becomes a normal agent
 * the user owns: editable, archivable, running on whichever provider is
 * connected. Contributions are pull requests against the gallery folder.
 */
function GallerySection() {
  const navigate = useNavigate()
  const agents = useAgentsStore((state) => state.agents)
  const showToast = useAppStore((state) => state.showToast)

  function addEntry(entryId: string): void {
    const entry = AGENT_GALLERY.find((item) => item.id === entryId)
    if (!entry) return
    const result = installGalleryAgent(entry)
    if (result.ok) {
      showToast(`${entry.agent.name} added from the gallery`)
      navigate(`/agents/${result.agentId}`)
    } else {
      showToast(`Could not add: ${result.error}`)
    }
  }

  return (
    <section className="mt-8" aria-label="Community gallery">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-1">
        <p className="text-[12px] font-medium text-ink-faint">Community gallery</p>
        <p className="text-[11px] text-ink-faint">Curated · offline · editable once added</p>
      </div>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2">
        {AGENT_GALLERY.map((entry) => {
          const installed = isGalleryAgentInstalled(entry, agents)
          return (
            <li
              key={entry.id}
              className="flex flex-col gap-2 rounded-group border border-line bg-raised p-3"
            >
              <div className="flex items-start gap-2.5">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-subtle text-[15px]"
                >
                  {entry.emoji}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold tracking-tight text-ink">
                    {entry.agent.name}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-soft">
                    {entry.agent.description}
                  </p>
                </div>
              </div>
              <div className="mt-auto flex flex-wrap items-center gap-2">
                {installed ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-1 text-[11px] font-medium text-success">
                    <Check size={11} aria-hidden="true" />
                    Already added
                  </span>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => addEntry(entry.id)}>
                    <Plus size={13} />
                    Add to my agents
                  </Button>
                )}
                <span className="text-[10.5px] text-ink-faint">{entry.credit}</span>
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 px-1 text-[11px] leading-relaxed text-ink-faint">
        Built something good? Share it — export any agent as a{' '}
        <span className="font-medium text-ink-soft">.agent.json</span> file, or contribute to the
        gallery folder on GitHub via pull request.
      </p>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Featured Uni hero                                                   */
/* ------------------------------------------------------------------ */

/**
 * Uni gets a hero presentation — it is the app's own headline teammate,
 * the AI you give real work to. The card keeps the app's honesty rules:
 * it is a local instruction profile, clearly labeled, that runs on
 * whichever provider the user connects — xAI · Grok included.
 */
function UniBotHero({ agent }: { agent: AgentProfile }) {
  const navigate = useNavigate()
  const setUi = useAppStore((state) => state.setUi)

  /** Open the bot's own thread (EmployeeView opens the conversation
   * directly); an optional starter prefills the thread composer. */
  function openWith(startedWith?: string) {
    if (startedWith) saveThreadDraft(`agent:${agent.id}`, startedWith)
    navigate(`/agents/${agent.id}`)
  }

  return (
    <div className="mt-2 overflow-hidden rounded-group border-2 border-ink/85 bg-raised">
      <div className="flex flex-wrap items-start gap-4 p-4 sm:p-5">
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-canvas"
        >
          <Zap size={20} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <h3 className="text-[17px] font-semibold tracking-tight text-ink">{agent.name}</h3>
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent">
              New
            </span>
            <span className="rounded-full bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">
              Built-in
            </span>
          </span>
          <p className="mt-1 text-balance text-sm font-medium text-ink">
            {agent.description || 'The AI teammate you give real work to'}
          </p>
          <p className="mt-0.5 text-balance text-sm leading-relaxed text-ink-soft">
            Message it like a colleague — it owns the task end to end.
          </p>
          {agent.starters.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5" aria-label={`${agent.name} starters`}>
              {agent.starters.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => openWith(starter)}
                  className="press min-touch rounded-full border border-line bg-canvas/60 px-3 py-1.5 text-[13px] font-medium text-ink-soft transition-colors hover:border-ink/40 hover:text-ink"
                >
                  {starter}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-canvas/40 px-4 py-3 sm:px-5">
        <Button variant="primary" size="sm" onClick={() => openWith()}>
          <MessageSquare size={14} />
          Chat with {agent.name}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => navigate(`/work/new?agent=${agent.id}`)}>
          <Plus size={14} />
          Assign task
        </Button>
        <span className="min-w-0 flex-1" />
        <p className="w-full text-xs leading-relaxed text-ink-faint sm:w-auto sm:text-right">
          Local profile — connect{' '}
          <button
            type="button"
            onClick={() => setUi({ settingsOpen: true, settingsSection: 'providers' })}
            className="press inline-flex min-touch items-center rounded-control font-medium text-accent transition-colors hover:text-accent-strong"
          >
            xAI · Grok
          </button>{' '}
          (or any provider) for live replies.
        </p>
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
          <MenuItem icon={<Download size={15} />} onClick={() => {
            exportAgentFile(agent)
            showToast('Agent exported as JSON')
          }}>
            Export as JSON
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

  if (editMode) {
    return <AgentBuilder existing={agent} onDone={() => setEditMode(false)} />
  }

  // Every employee opens its actual conversation directly — the profile
  // is a secondary inspector, never a hop before the thread.
  return <EmployeeView agentId={agentId} onEdit={() => setEditMode(true)} />
}

/* ------------------------------------------------------------------ */
/* Builder — create / edit                                             */
/* ------------------------------------------------------------------ */

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

  // One-tap templates: fill the form from a curated starting point.
  // Only offered for brand-new agents — editing an existing profile
  // must never silently overwrite its instructions.
  const applyTemplate = useCallback((templateId: string) => {
    const template = AGENT_TEMPLATES.find((item) => item.id === templateId)
    if (!template) return
    setName(template.name)
    setDescription(template.description)
    setInstructions(template.instructions)
    setCategory(template.category)
    setTools(template.tools)
    setStartersText(template.starters.join('\n'))
    setErrors([])
  }, [])

  const [appliedTemplate, setAppliedTemplate] = useState<string | null>(null)
  const handleTemplatePick = useCallback(
    (templateId: string) => {
      applyTemplate(templateId)
      setAppliedTemplate(templateId)
    },
    [applyTemplate],
  )

  // useCallback marks this as an event handler (never invoked during
  // render), which keeps the impure calls inside it — Date.now(), store
  // writes — legal under the react-hooks purity rules.
  const handleSave = useCallback(() => {
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
  }, [
    category,
    description,
    existing,
    instructions,
    modelId,
    name,
    navigate,
    onDone,
    providerId,
    providers,
    saveAgent,
    selectedProvider,
    startersText,
    tools,
  ])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageToolbar>
        <button
          type="button"
          onClick={() => (onDone ? onDone() : navigate('/agents'))}
          aria-label="Cancel and go back"
          className="min-touch -ml-1 rounded-control p-1.5 text-ink-soft transition-colors hover:text-ink"
        >
          <ChevronLeft />
        </button>
        <h1 className="text-[15px] font-semibold tracking-tight text-ink">
          {existing ? `Edit ${existing.name}` : 'New agent'}
        </h1>
      </PageToolbar>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-column px-3 py-6 sm:px-4">
          {!existing && (
            <fieldset className="mb-4">
              <legend className="mb-1.5 block text-sm font-medium text-ink">
                Start from a template
              </legend>
              <p className="mb-2.5 text-xs leading-relaxed text-ink-faint">
                One tap fills the form below — everything stays editable. Skip this and
                write your own if you prefer.
              </p>
              <div className="flex flex-wrap gap-2">
                {AGENT_TEMPLATES.map((template) => {
                  const selected = appliedTemplate === template.id
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => handleTemplatePick(template.id)}
                      aria-pressed={selected}
                      title={template.description}
                      className={`flex min-touch items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                        selected
                          ? 'border-accent bg-accent-soft font-medium text-accent'
                          : 'border-line text-ink hover:bg-subtle'
                      }`}
                    >
                      <span aria-hidden="true">{template.emoji}</span>
                      {template.name}
                      {selected && <Check size={13} aria-hidden="true" />}
                    </button>
                  )
                })}
              </div>
            </fieldset>
          )}
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
