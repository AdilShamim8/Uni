import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  flushAgentsPersistence,
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

  it('seeds the personal assistant and three specialists', () => {
    const agents = Object.values(useAgentsStore.getState().agents)
    expect(agents.filter((a) => a.category === 'personal')).toHaveLength(1)
    expect(agents.filter((a) => a.category === 'specialist')).toHaveLength(3)
    expect(agents.every((a) => a.builtin)).toBe(true)
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
})
