import { create } from 'zustand'
import type { AgentProfile, MemoryNote, ScheduleDraft } from '@/domain/workspaceTypes'
import { makeId } from '@/domain/ids'
import {
  clearAgentsSlice,
  loadAgentsSlice,
  saveAgentsSlice,
} from '@/services/storage/workspaceStorage'

/**
 * Agents store — reusable instruction profiles, memory notes, and schedule
 * drafts. Completely separate from the chat store; persists under its own
 * `universe:agents:v1` slice so it can never disturb chat data.
 *
 * The seeded Universe Assistant is the single personal assistant; the three
 * specialist seeds replace the older "assistant presets" preview system.
 */

export function buildSeedAgents(): AgentProfile[] {
  const now = Date.now()
  return [
    {
      id: 'agent-universe-assistant',
      name: 'Universe Assistant',
      description: 'Your persistent personal assistant in Universe',
      instructions:
        'You are the user’s personal assistant. Be warm, concise, and practical. ' +
        'Refer to the user’s memory notes when they are relevant. When unsure, ask ' +
        'one clarifying question rather than guessing.',
      category: 'personal',
      providerId: null,
      modelId: null,
      tools: [],
      projectIds: [],
      starters: [
        'Help me plan my week',
        'Summarize where we left off',
        'Turn my notes into a to-do list',
      ],
      archived: false,
      builtin: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'agent-research-analyst',
      name: 'Research Analyst',
      description: 'Compares options with clear evidence and honest gaps',
      instructions:
        'Research and compare options in structured comparisons. Separate what is ' +
        'verified from what is assumed, and always name the gaps in the evidence.',
      category: 'specialist',
      providerId: null,
      modelId: null,
      tools: ['research'],
      projectIds: [],
      starters: [
        'Compare these two options',
        'What should I know before choosing?',
        'Find the trade-offs in this plan',
      ],
      archived: false,
      builtin: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'agent-writing-assistant',
      name: 'Writing Assistant',
      description: 'Tightens prose without changing meaning',
      instructions:
        'Improve clarity and flow while preserving meaning and voice. Suggest ' +
        'concrete rewrites rather than describing problems abstractly.',
      category: 'specialist',
      providerId: null,
      modelId: null,
      tools: [],
      projectIds: [],
      starters: [
        'Polish this paragraph',
        'Make this email friendlier',
        'Shorten this to three sentences',
      ],
      archived: false,
      builtin: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'agent-finance-analyst',
      name: 'Finance Analyst',
      description: 'Explains trade-offs with numbers and clear assumptions',
      instructions:
        'Explain financial trade-offs with explicit numbers, assumptions, and ' +
        'ranges. Never present an estimate as a guarantee.',
      category: 'specialist',
      providerId: null,
      modelId: null,
      tools: [],
      projectIds: [],
      starters: [
        'Build a simple budget for this goal',
        'Compare these two costs over a year',
        'What am I assuming in this plan?',
      ],
      archived: false,
      builtin: true,
      createdAt: now,
      updatedAt: now,
    },
  ]
}

export interface AgentsStore {
  hydrated: boolean
  agents: Record<string, AgentProfile>
  memoryNotes: Record<string, MemoryNote>
  schedules: Record<string, ScheduleDraft>
  /** Set when a load found unreadable data and re-seeded. */
  recoveredFromQuarantine: boolean

  initialize: () => void
  resetSeeds: () => void

  saveAgent: (profile: AgentProfile) => void
  archiveAgent: (id: string, archived: boolean) => void
  /**
   * Deletes a non-built-in profile. When the profile is still referenced
   * (e.g. by Work tasks), it is archived instead so history stays readable.
   * Returns what actually happened.
   */
  deleteAgent: (id: string, options?: { isReferenced?: (id: string) => boolean }) => 'deleted' | 'archived' | 'rejected'
  duplicateAgent: (id: string) => string | null

  addMemoryNote: (agentId: string, text: string) => string | null
  updateMemoryNote: (id: string, text: string) => void
  deleteMemoryNote: (id: string) => void

  saveSchedule: (schedule: ScheduleDraft) => void
  deleteSchedule: (id: string) => void
}

export const useAgentsStore = create<AgentsStore>()((set, get) => ({
  hydrated: false,
  agents: {},
  memoryNotes: {},
  schedules: {},
  recoveredFromQuarantine: false,

  initialize: () => {
    if (get().hydrated) return
    const loaded = loadAgentsSlice()
    if (loaded.state) {
      const agents: Record<string, AgentProfile> = {}
      for (const agent of loaded.state.agents) agents[agent.id] = agent
      const memoryNotes: Record<string, MemoryNote> = {}
      for (const note of loaded.state.memoryNotes) memoryNotes[note.id] = note
      const schedules: Record<string, ScheduleDraft> = {}
      for (const schedule of loaded.state.schedules) schedules[schedule.id] = schedule
      set({ hydrated: true, agents, memoryNotes, schedules })
    } else {
      get().resetSeeds()
      if (loaded.recoveredFrom) set({ recoveredFromQuarantine: true })
    }
  },

  resetSeeds: () => {
    clearAgentsSlice()
    const agents: Record<string, AgentProfile> = {}
    for (const agent of buildSeedAgents()) agents[agent.id] = agent
    set({
      hydrated: true,
      agents,
      memoryNotes: {},
      schedules: {},
      recoveredFromQuarantine: false,
    })
  },

  saveAgent: (profile) => {
    const existing = get().agents[profile.id]
    const next: AgentProfile = {
      ...profile,
      updatedAt: Date.now(),
      createdAt: existing?.createdAt ?? Date.now(),
    }
    set((state) => ({ agents: { ...state.agents, [next.id]: next } }))
  },

  archiveAgent: (id, archived) => {
    const agent = get().agents[id]
    if (!agent) return
    set((state) => ({
      agents: { ...state.agents, [id]: { ...agent, archived, updatedAt: Date.now() } },
    }))
  },

  deleteAgent: (id, options) => {
    const agent = get().agents[id]
    if (!agent) return 'rejected'
    if (agent.builtin) return 'rejected'
    if (options?.isReferenced?.(id)) {
      get().archiveAgent(id, true)
      return 'archived'
    }
    set((state) => {
      const agents = { ...state.agents }
      delete agents[id]
      return { agents }
    })
    return 'deleted'
  },

  duplicateAgent: (id) => {
    const source = get().agents[id]
    if (!source) return null
    const copy: AgentProfile = {
      ...source,
      id: makeId('agent'),
      name: `Copy of ${source.name}`,
      builtin: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set((state) => ({ agents: { ...state.agents, [copy.id]: copy } }))
    return copy.id
  },

  addMemoryNote: (agentId, text) => {
    const trimmed = text.trim()
    if (!trimmed || !get().agents[agentId]) return null
    const note: MemoryNote = {
      id: makeId('note'),
      agentId,
      text: trimmed,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set((state) => ({ memoryNotes: { ...state.memoryNotes, [note.id]: note } }))
    return note.id
  },

  updateMemoryNote: (id, text) => {
    const note = get().memoryNotes[id]
    const trimmed = text.trim()
    if (!note || !trimmed) return
    set((state) => ({
      memoryNotes: { ...state.memoryNotes, [id]: { ...note, text: trimmed, updatedAt: Date.now() } },
    }))
  },

  deleteMemoryNote: (id) => {
    set((state) => {
      const memoryNotes = { ...state.memoryNotes }
      delete memoryNotes[id]
      return { memoryNotes }
    })
  },

  saveSchedule: (schedule) => {
    set((state) => ({
      schedules: { ...state.schedules, [schedule.id]: { ...schedule, updatedAt: Date.now() } },
    }))
  },

  deleteSchedule: (id) => {
    set((state) => {
      const schedules = { ...state.schedules }
      delete schedules[id]
      return { schedules }
    })
  },
}))

/* ------------------------------------------------------------------ */
/* Persistence wiring (debounced, like the chat store)                 */
/* ------------------------------------------------------------------ */

let saveTimer: ReturnType<typeof setTimeout> | undefined

function serialize(state: AgentsStore) {
  return {
    agents: Object.values(state.agents),
    memoryNotes: Object.values(state.memoryNotes),
    schedules: Object.values(state.schedules),
  }
}

export function flushAgentsPersistence(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  const state = useAgentsStore.getState()
  if (!state.hydrated) return
  saveAgentsSlice(serialize(state))
}

useAgentsStore.subscribe(() => {
  const state = useAgentsStore.getState()
  if (!state.hydrated) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushAgentsPersistence, 400)
})

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushAgentsPersistence)
}

/** Test-only: wipe agents state (and optionally storage). */
export function resetAgentsStoreForTests(options: { keepStorage?: boolean } = {}): void {
  if (!options.keepStorage) clearAgentsSlice()
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  useAgentsStore.setState({
    hydrated: false,
    agents: {},
    memoryNotes: {},
    schedules: {},
    recoveredFromQuarantine: false,
  })
}

/* ------------------------------------------------------------------ */
/* Selectors                                                           */
/* ------------------------------------------------------------------ */

export function selectPersonalAgent(state: AgentsStore): AgentProfile | null {
  const active = Object.values(state.agents).filter(
    (agent) => agent.category === 'personal' && !agent.archived,
  )
  return active.sort((a, b) => a.createdAt - b.createdAt)[0] ?? null
}
