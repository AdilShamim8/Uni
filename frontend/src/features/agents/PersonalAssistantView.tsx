import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  CalendarClock,
  Check,
  MessageSquare,
  PencilLine,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useAgentsStore } from '@/state/agentsStore'
import { useAppStore } from '@/state/store'
import { useWorkStore } from '@/state/workStore'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Switch } from '@/components/ui/Switch'
import { StatusPill } from '@/components/ui/StatusPill'
import { TASK_STATUS_LABELS, TASK_STATUS_TONES } from '@/domain/taskMachine'
import type { MemoryNote, ScheduleDraft } from '@/domain/workspaceTypes'

/**
 * The persistent personal-assistant experience: one place for the
 * conversation, assigned Work, memory notes, and schedule drafts.
 *
 * Honesty constraints (milestone 03):
 * - Memory notes are user-authored, local-only. Nothing is collected from
 *   outside the app, and no cross-device sync is claimed.
 * - Schedules are DRAFTS. Execution is unavailable: no background worker
 *   exists, nothing is shown as "Active", and no notification is promised.
 */

type Tab = 'conversation' | 'work' | 'memory' | 'schedules'

export function PersonalAssistantView({
  agentId,
  onEdit,
}: {
  agentId: string
  onEdit: () => void
}) {
  const navigate = useNavigate()
  const agent = useAgentsStore((state) => state.agents[agentId])
  const [tab, setTab] = useState<Tab>('conversation')

  if (!agent) return null

  const tabs: { id: Tab; label: string }[] = [
    { id: 'conversation', label: 'Conversation' },
    { id: 'work', label: 'Assigned work' },
    { id: 'memory', label: 'Memory' },
    { id: 'schedules', label: 'Schedules' },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="material safe-left safe-right sticky top-0 z-30 flex h-13 shrink-0 items-center gap-2 border-b border-line bg-mat-header px-2 sm:px-4">
        <button
          type="button"
          onClick={() => navigate('/agents')}
          aria-label="Back to Agents"
          className="min-touch -ml-1 rounded-control p-1.5 text-ink-soft transition-colors hover:text-ink"
        >
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
        </button>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Sparkles size={15} />
        </span>
        <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{agent.name}</h1>
        <Button variant="ghost" size="sm" onClick={onEdit}>
          <PencilLine size={14} />
          <span className="hidden sm:inline">Edit</span>
        </Button>
      </header>

      {/* Tabs (scrollable on narrow screens) */}
      <div
        className="flex gap-1 overflow-x-auto border-b border-line px-2 py-1.5"
        role="tablist"
        aria-label="Assistant sections"
      >
        {tabs.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            onClick={() => setTab(entry.id)}
            className={`min-touch shrink-0 rounded-control px-3 py-1 text-[13px] font-medium transition-colors ${
              tab === entry.id ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-subtle'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'conversation' && <ConversationTab agentId={agentId} />}
        {tab === 'work' && <AssignedWorkTab agentId={agentId} />}
        {tab === 'memory' && <MemoryTab agentId={agentId} />}
        {tab === 'schedules' && <SchedulesTab agentId={agentId} />}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Conversation                                                        */
/* ------------------------------------------------------------------ */

function ConversationTab({ agentId }: { agentId: string }) {
  const navigate = useNavigate()
  const agent = useAgentsStore((state) => state.agents[agentId])
  const conversations = useAppStore((state) => state.conversations)
  const openAgentConversation = useAppStore((state) => state.openAgentConversation)
  const agents = useAgentsStore((state) => state.agents)
  const credentials = useAppStore((state) => state.credentials)
  const providers = useAppStore((state) => state.providers)

  const thread = useMemo(
    () =>
      Object.values(conversations)
        .filter(
          (conversation) =>
            conversation.agentId === agentId && Object.keys(conversation.nodes).length > 0,
        )
        .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null,
    [conversations, agentId],
  )

  // Effective configuration, resolved explicitly and shown (milestone 03).
  const effective = useMemo(() => {
    if (!agent) return null
    const globalProvider = providers.find((p) => p.id === useAppStore.getState().activeProviderId)
    const globalCredential = globalProvider
      ? credentials[globalProvider.id]
      : undefined
    if (agent.providerId) {
      const provider = providers.find((p) => p.id === agent.providerId)
      if (provider) {
        const credential = credentials[provider.id]
        const live = credential?.status === 'connected' && !!credential.apiKey
        const model =
          provider.models.find((m) => m.id === agent.modelId)?.label ??
          (agent.modelId ?? null)
        return {
          source: 'agent preference',
          provider: provider.label,
          model: model ?? 'provider default',
          mode: live ? ('live' as const) : ('demo' as const),
        }
      }
    }
    if (globalProvider) {
      const live = globalCredential?.status === 'connected' && !!globalCredential.apiKey
      return {
        source: 'global chat settings',
        provider: globalProvider.label,
        model: useAppStore.getState().activeModelId ?? 'provider default',
        mode: live ? ('live' as const) : ('demo' as const),
      }
    }
    return { source: 'global chat settings', provider: '—', model: '—', mode: 'demo' as const }
  }, [agent, providers, credentials])

  void agents

  return (
    <div className="mx-auto w-full max-w-column px-3 py-6 sm:px-4">
      <div className="rounded-group border border-line bg-raised p-4 sm:p-5">
        <h2 className="text-lg font-semibold tracking-tight text-ink">
          Your persistent assistant
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          {agent?.description} Chat reuses the same conversation each time — nothing is
          duplicated, and the thread keeps its history.
        </p>

        {effective && (
          <div className="mt-3 rounded-[12px] bg-subtle px-3.5 py-2.5">
            <p className="text-xs leading-relaxed text-ink-soft">
              <span className="font-medium text-ink">Effective configuration</span> (
              {effective.source}): {effective.provider} · {effective.model} ·{' '}
              {effective.mode === 'live' ? (
                <span className="font-medium text-success">live with your key</span>
              ) : (
                <span className="font-medium">local demo</span>
              )}
            </p>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={() => {
              const id = openAgentConversation(agentId)
              navigate(`/c/${id}`)
            }}
          >
            <MessageSquare size={15} />
            {thread ? 'Continue conversation' : 'Start conversation'}
          </Button>
          {thread && (
            <Button
              variant="secondary"
              onClick={() => {
                const id = openAgentConversation(agentId)
                navigate(`/c/${id}`)
              }}
            >
              {thread.title}
            </Button>
          )}
        </div>

        {agent?.starters.length > 0 && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Try asking
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {agent.starters.map((starter) => (
                <li key={starter} className="text-sm text-ink">
                  {starter}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Assigned work                                                       */
/* ------------------------------------------------------------------ */

function AssignedWorkTab({ agentId }: { agentId: string }) {
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
    <div className="mx-auto w-full max-w-column px-3 py-6 sm:px-4">
      {assigned.length === 0 ? (
        <div className="rounded-group border border-line bg-raised px-6 py-10 text-center">
          <p className="text-sm font-medium text-ink">No assigned work yet</p>
          <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-soft">
            Tasks you assign to this assistant from Work or its profile appear here — the
            same tasks, not copies.
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => navigate(`/work/new?agent=${agentId}`)}>
              <Plus size={15} />
              Assign a task
            </Button>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {assigned.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => navigate(`/work/${task.id}`)}
                className="flex w-full items-center gap-3 rounded-group border border-line bg-raised px-4 py-3 text-left transition-colors hover:bg-subtle"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
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
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Memory                                                              */
/* ------------------------------------------------------------------ */

function MemoryTab({ agentId }: { agentId: string }) {
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
    const id = useAgentsStore.getState().addMemoryNote(agentId, draft)
    if (id) setDraft('')
  }

  return (
    <div className="mx-auto w-full max-w-column px-3 py-6 sm:px-4">
      <div className="rounded-group border border-line bg-raised p-4 sm:p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
          Memory notes
        </h2>
        <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
          Notes you write here are saved locally for {agent?.name ?? 'this assistant'} and
          stay on this device. Nothing is collected automatically, and no cross-app or
          cross-device memory is claimed.
        </p>

        <div className="mt-3 flex gap-2">
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
          <Button variant="primary" disabled={!draft.trim()} onClick={handleAdd}>
            <Plus size={15} />
            Add
          </Button>
        </div>

        {mine.length === 0 ? (
          <p className="mt-4 px-1 text-sm text-ink-faint">
            No notes yet — add facts or preferences you want remembered.
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-2">
            {mine.map((note: MemoryNote) => (
              <li
                key={note.id}
                className="rounded-[12px] border border-line bg-subtle/50 px-3.5 py-2.5"
              >
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
                      aria-label="Save note"
                      onClick={() => {
                        useAgentsStore.getState().updateMemoryNote(note.id, editText)
                        setEditingId(null)
                      }}
                    >
                      <Check size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Cancel editing note"
                      onClick={() => setEditingId(null)}
                    >
                      <X size={14} />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-sm leading-relaxed text-ink">
                      {note.text}
                    </p>
                    <button
                      type="button"
                      aria-label="Edit note"
                      onClick={() => {
                        setEditingId(note.id)
                        setEditText(note.text)
                      }}
                      className="min-touch rounded-control p-1 text-ink-faint transition-colors hover:text-ink"
                    >
                      <PencilLine size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete note"
                      onClick={() => useAgentsStore.getState().deleteMemoryNote(note.id)}
                      className="min-touch rounded-control p-1 text-ink-faint transition-colors hover:text-danger"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
                <p className="mt-1 text-[11px] text-ink-faint/80">
                  Local · updated {new Date(note.updatedAt).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Schedules                                                           */
/* ------------------------------------------------------------------ */

const CADENCES: { id: ScheduleDraft['cadence']; label: string; blurb: string }[] = [
  { id: 'once', label: 'One-off', blurb: 'A single planned occasion' },
  { id: 'recurring', label: 'Recurring', blurb: 'Repeats on a rhythm' },
  { id: 'event', label: 'Event-triggered', blurb: 'When something happens' },
]

function SchedulesTab({ agentId }: { agentId: string }) {
  const schedules = useAgentsStore((state) => state.schedules)
  const saveSchedule = useAgentsStore((state) => state.saveSchedule)
  const [creating, setCreating] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const mine = useMemo(
    () =>
      Object.values(schedules)
        .filter((schedule) => schedule.agentId === agentId)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [schedules, agentId],
  )

  return (
    <div className="mx-auto w-full max-w-column px-3 py-6 sm:px-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
            Schedules
          </h2>
          <p className="mt-1.5 max-w-md text-xs leading-relaxed text-ink-soft">
            Drafts of work you want this assistant to do later. They are saved locally —
            execution is unavailable in this build: there is no background worker, so
            nothing runs and no notifications are sent.
          </p>
        </div>
        {!creating && (
          <Button variant="secondary" onClick={() => setCreating(true)}>
            <Plus size={15} />
            New draft
          </Button>
        )}
      </div>

      <div className="mt-2">
        <StatusPill label="Saved locally — execution unavailable" tone="warning" />
      </div>

      {creating && (
        <ScheduleForm
          agentId={agentId}
          onCancel={() => setCreating(false)}
          onSave={(schedule) => {
            saveSchedule(schedule)
            setCreating(false)
          }}
        />
      )}

      {mine.length === 0 && !creating ? (
        <p className="mt-4 px-1 text-sm text-ink-faint">
          No schedule drafts yet. When a runtime exists, these will be reviewable before
          anything is activated.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {mine.map((schedule) => (
            <li
              key={schedule.id}
              className="rounded-group border border-line bg-raised px-4 py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{schedule.name}</p>
                  <p className="mt-0.5 text-xs text-ink-faint">
                    {CADENCES.find((c) => c.id === schedule.cadence)?.label ?? schedule.cadence}
                    {' · '}
                    {schedule.timezone}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label={`Delete schedule ${schedule.name}`}
                  onClick={() => setDeleteId(schedule.id)}
                  className="min-touch rounded-control p-1 text-ink-faint transition-colors hover:text-danger"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {schedule.instructions && (
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
                  {schedule.instructions}
                </p>
              )}
              {schedule.condition && (
                <p className="mt-1 text-xs text-ink-faint">Notify when: {schedule.condition}</p>
              )}
              <p className="mt-1.5 text-[11px] text-ink-faint/80">
                Draft saved locally · never runs on its own
              </p>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Delete schedule draft?"
        body="This draft will be removed from this device. Nothing was ever scheduled to run."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteId) useAgentsStore.getState().deleteSchedule(deleteId)
          setDeleteId(null)
        }}
      />
    </div>
  )
}

function ScheduleForm({
  agentId,
  onSave,
  onCancel,
}: {
  agentId: string
  onSave: (schedule: ScheduleDraft) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [cadence, setCadence] = useState<ScheduleDraft['cadence']>('once')
  const [timezone, setTimezone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
  const [instructions, setInstructions] = useState('')
  const [condition, setCondition] = useState('')
  const [enabledIntent, setEnabledIntent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleSave() {
    if (!name.trim()) {
      setError('Give the draft a name.')
      return
    }
    onSave({
      id: `sched-${crypto.randomUUID()}`,
      agentId,
      name: name.trim(),
      cadence,
      timezone,
      instructions: instructions.trim(),
      condition: condition.trim(),
      enabledIntent,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  }

  return (
    <div className="mt-4 rounded-group border border-line bg-raised p-4">
      <div className="flex flex-col gap-3.5">
        <TextField
          label="Name"
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            setError(null)
          }}
          placeholder="e.g. Monday morning summary"
        />
        {error && (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        )}

        <fieldset>
          <legend className="mb-1.5 block text-sm font-medium text-ink">Cadence</legend>
          <div className="flex flex-col gap-1.5">
            {CADENCES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setCadence(entry.id)}
                aria-pressed={cadence === entry.id}
                className={`flex min-touch items-center justify-between rounded-control border px-3.5 py-2 text-left text-sm transition-colors ${
                  cadence === entry.id
                    ? 'border-accent bg-accent-soft font-medium text-accent'
                    : 'border-line text-ink hover:bg-subtle'
                }`}
              >
                <span>{entry.label}</span>
                <span className="text-xs font-normal opacity-70">{entry.blurb}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <TextField
          label="Timezone"
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          placeholder="e.g. Asia/Dhaka"
        />

        <div>
          <label
            htmlFor="schedule-instructions"
            className="mb-1.5 block text-sm font-medium text-ink"
          >
            What should it do?
          </label>
          <textarea
            id="schedule-instructions"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            rows={3}
            className="w-full resize-y rounded-control border border-line bg-panel px-3 py-2.5 text-sm leading-relaxed text-ink focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
          />
        </div>

        <TextField
          label="Notify when (described)"
          value={condition}
          onChange={(event) => setCondition(event.target.value)}
          placeholder="e.g. When the summary is drafted"
        />

        <div className="flex items-center justify-between rounded-control border border-line px-3.5 py-2.5">
          <div>
            <p className="text-sm font-medium text-ink">Enable once a runtime exists</p>
            <p className="text-xs text-ink-faint">
              Records your intent — nothing is activated now.
            </p>
          </div>
          <Switch checked={enabledIntent} onChange={setEnabledIntent} label="Enable intent" />
        </div>

        <p className="rounded-[12px] bg-warning-soft px-3.5 py-2.5 text-xs leading-relaxed text-warning">
          <CalendarClock size={13} className="mr-1 inline" aria-hidden="true" />
          This draft will be saved locally. It will not run, and no notification will be
          sent — execution is unavailable in this build.
        </p>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Save draft
          </Button>
        </div>
      </div>
    </div>
  )
}
