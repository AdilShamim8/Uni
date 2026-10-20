import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  flushAgentsPersistence,
  LEGACY_GROK_BOT_INSTRUCTIONS,
  UNI_BOT_AGENT_ID,
  resetAgentsStoreForTests,
  useAgentsStore,
} from '@/state/agentsStore'

describe('agents store', () => {
  beforeEach(() => {
    resetAgentsStoreForTests()
    useAgentsStore.getState().initialize()
  })
  afterEach(() => {
    resetAgentsStoreForTests()
  })

  it('seeds the personal assistant, the featured Uni bot, and three specialists', () => {
    const agents = Object.values(useAgentsStore.getState().agents)
    expect(agents.filter((a) => a.category === 'personal')).toHaveLength(1)
    expect(agents.filter((a) => a.category === 'specialist')).toHaveLength(4)
    expect(agents.every((a) => a.builtin)).toBe(true)

    const uniBot = useAgentsStore.getState().agents[UNI_BOT_AGENT_ID]
    expect(uniBot?.name).toBe('Uni')
    expect(uniBot?.starters.length).toBeGreaterThan(0)
  })

  it('saves and updates profiles without touching run history', () => {
    const store = useAgentsStore.getState()
    store.saveAgent({
      id: 'agent-custom',
      name: 'My agent',
      description: '',
      instructions: 'Do things',
      category: 'specialist',
      providerId: null,
      modelId: null,
      tools: [],
      projectIds: [],
      starters: [],
      archived: false,
      builtin: false,
      createdAt: 0,
      updatedAt: 0,
    })
    expect(useAgentsStore.getState().agents['agent-custom']?.name).toBe('My agent')

    useAgentsStore.getState().saveAgent({
      ...useAgentsStore.getState().agents['agent-custom'],
      name: 'Renamed',
    })
    expect(useAgentsStore.getState().agents['agent-custom']?.name).toBe('Renamed')
    // createdAt preserved from the first save, not reset.
    expect(useAgentsStore.getState().agents['agent-custom']?.createdAt).toBeGreaterThan(0)
  })

  it('refuses to delete built-in profiles', () => {
    const result = useAgentsStore.getState().deleteAgent('agent-universe-assistant')
    expect(result).toBe('rejected')
    expect(useAgentsStore.getState().agents['agent-universe-assistant']).toBeTruthy()
  })

  it('archives instead of deleting when tasks still reference the profile', () => {
    useAgentsStore.getState().saveAgent({
      id: 'agent-custom',
      name: 'My agent',
      description: '',
      instructions: 'x',
      category: 'specialist',
      providerId: null,
      modelId: null,
      tools: [],
      projectIds: [],
      starters: [],
      archived: false,
      builtin: false,
      createdAt: 0,
      updatedAt: 0,
    })
    const result = useAgentsStore.getState().deleteAgent('agent-custom', {
      isReferenced: () => true,
    })
    expect(result).toBe('archived')
    expect(useAgentsStore.getState().agents['agent-custom']?.archived).toBe(true)

    // Unreferenced → real delete.
    const second = useAgentsStore.getState().deleteAgent('agent-custom', {
      isReferenced: () => false,
    })
    expect(second).toBe('deleted')
    expect(useAgentsStore.getState().agents['agent-custom']).toBeUndefined()
  })

  it('duplicates a profile as a non-built-in copy', () => {
    const id = useAgentsStore.getState().duplicateAgent('agent-research-analyst')
    expect(id).toBeTruthy()
    const copy = useAgentsStore.getState().agents[id as string]
    expect(copy?.name).toBe('Copy of Research Analyst')
    expect(copy?.builtin).toBe(false)
  })

  it('manages memory notes with add/edit/delete', () => {
    const store = useAgentsStore.getState()
    const id = store.addMemoryNote('agent-universe-assistant', '  Prefers concise answers  ')
    expect(id).toBeTruthy()
    expect(useAgentsStore.getState().memoryNotes[id as string]?.text).toBe('Prefers concise answers')

    useAgentsStore.getState().updateMemoryNote(id as string, 'Updated note')
    expect(useAgentsStore.getState().memoryNotes[id as string]?.text).toBe('Updated note')

    useAgentsStore.getState().deleteMemoryNote(id as string)
    expect(useAgentsStore.getState().memoryNotes[id as string]).toBeUndefined()
  })

  it('rejects empty memory notes', () => {
    expect(useAgentsStore.getState().addMemoryNote('agent-universe-assistant', '   ')).toBeNull()
  })

  it('persists across a simulated reload', () => {
    useAgentsStore.getState().addMemoryNote('agent-universe-assistant', 'Persisted note')
    // Flush the debounced save immediately.
    flushAgentsPersistence()

    resetAgentsStoreForTests({ keepStorage: true })
    useAgentsStore.getState().initialize()
    const notes = Object.values(useAgentsStore.getState().memoryNotes)
    expect(notes.some((n) => n.text === 'Persisted note')).toBe(true)
  })

  it('migrates the Uni bot into a pre-existing saved slice exactly once', () => {
    // An install from before the bot: persisted agents without it.
    useAgentsStore.setState((state) => {
      const agents = { ...state.agents }
      delete agents[UNI_BOT_AGENT_ID]
      return { agents }
    })
    flushAgentsPersistence()

    // First reload after the update: the bot is added and sorts first.
    resetAgentsStoreForTests({ keepStorage: true })
    useAgentsStore.getState().initialize()
    const migrated = useAgentsStore.getState().agents[UNI_BOT_AGENT_ID]
    expect(migrated?.name).toBe('Uni')
    const others = Object.values(useAgentsStore.getState().agents).filter(
      (a) => a.id !== UNI_BOT_AGENT_ID,
    )
    expect(others.every((a) => a.createdAt > (migrated?.createdAt ?? 0))).toBe(true)

    // The user archives it: a reload must keep that choice (no re-add).
    useAgentsStore.getState().archiveAgent(UNI_BOT_AGENT_ID, true)
    flushAgentsPersistence()
    resetAgentsStoreForTests({ keepStorage: true })
    useAgentsStore.getState().initialize()
    expect(useAgentsStore.getState().agents[UNI_BOT_AGENT_ID]?.archived).toBe(true)

    // Once the one-time flag is set, a slice without the bot is respected.
    useAgentsStore.setState((state) => {
      const agents = { ...state.agents }
      delete agents[UNI_BOT_AGENT_ID]
      return { agents }
    })
    flushAgentsPersistence()
    resetAgentsStoreForTests({ keepStorage: true })
    useAgentsStore.getState().initialize()
    expect(useAgentsStore.getState().agents[UNI_BOT_AGENT_ID]).toBeUndefined()
  })

  it('renames a legacy Grok Bot profile to Uni without touching user edits', () => {
    const clearRenameFlag = () => {
      // Pin the exact storage contract of the one-time rename.
      localStorage.removeItem('universe:migrated:uni-bot-rename:v1')
    }

    // An install that ran the interim build: the bot persisted under its
    // old name with the old seed instructions.
    useAgentsStore.setState((state) => ({
      agents: {
        ...state.agents,
        [UNI_BOT_AGENT_ID]: {
          ...state.agents[UNI_BOT_AGENT_ID],
          name: 'Grok Bot',
          instructions: LEGACY_GROK_BOT_INSTRUCTIONS,
        },
      },
    }))
    flushAgentsPersistence()

    resetAgentsStoreForTests({ keepStorage: true })
    useAgentsStore.getState().initialize()
    const renamed = useAgentsStore.getState().agents[UNI_BOT_AGENT_ID]
    expect(renamed?.name).toBe('Uni')
    expect(renamed?.instructions).toContain('You are Uni,')

    // A user-edited name survives the rename untouched.
    clearRenameFlag()
    useAgentsStore.setState((state) => ({
      agents: {
        ...state.agents,
        [UNI_BOT_AGENT_ID]: { ...state.agents[UNI_BOT_AGENT_ID], name: 'My own bot' },
      },
    }))
    flushAgentsPersistence()
    resetAgentsStoreForTests({ keepStorage: true })
    useAgentsStore.getState().initialize()
    expect(useAgentsStore.getState().agents[UNI_BOT_AGENT_ID]?.name).toBe('My own bot')

    // Custom instructions survive even when the name still reads legacy.
    clearRenameFlag()
    useAgentsStore.setState((state) => ({
      agents: {
        ...state.agents,
        [UNI_BOT_AGENT_ID]: {
          ...state.agents[UNI_BOT_AGENT_ID],
          name: 'Grok Bot',
          instructions: 'Custom instructions the user wrote',
        },
      },
    }))
    flushAgentsPersistence()
    resetAgentsStoreForTests({ keepStorage: true })
    useAgentsStore.getState().initialize()
    const kept = useAgentsStore.getState().agents[UNI_BOT_AGENT_ID]
    expect(kept?.name).toBe('Uni')
    expect(kept?.instructions).toBe('Custom instructions the user wrote')
  })
})
