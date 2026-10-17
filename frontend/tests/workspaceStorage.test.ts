import { afterEach, describe, expect, it } from 'vitest'
import {
  clearAgentsSlice,
  isAgentsSlice,
  loadAgentsSlice,
  saveAgentsSlice,
} from '@/services/storage/workspaceStorage'
import type { AgentProfile, MemoryNote, ScheduleDraft } from '@/domain/workspaceTypes'

const agent: AgentProfile = {
  id: 'ag-universe',
  name: 'Universe Assistant',
  description: 'Personal assistant',
  instructions: 'Be helpful.',
  category: 'personal',
  providerId: null,
  modelId: null,
  tools: [],
  projectIds: [],
  starters: [],
  archived: false,
  builtin: true,
  createdAt: 1,
  updatedAt: 1,
}

const note: MemoryNote = {
  id: 'note-1',
  agentId: 'ag-universe',
  text: 'Prefers concise answers',
  createdAt: 1,
  updatedAt: 1,
}

const schedule: ScheduleDraft = {
  id: 'sched-1',
  agentId: 'ag-universe',
  name: 'Monday summary',
  cadence: 'recurring',
  timezone: 'Asia/Dhaka',
  instructions: 'Summarize the week',
  condition: 'When I ask on Mondays',
  enabledIntent: true,
  createdAt: 1,
  updatedAt: 1,
}

describe('workspace slice storage', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('round-trips the agents slice', () => {
    expect(saveAgentsSlice({ agents: [agent], memoryNotes: [note], schedules: [schedule] })).toBe(true)
    const result = loadAgentsSlice()
    expect(result.state).not.toBeNull()
    expect(result.state?.agents[0]?.name).toBe('Universe Assistant')
    expect(result.state?.memoryNotes[0]?.text).toBe('Prefers concise answers')
    expect(result.state?.schedules[0]?.cadence).toBe('recurring')
  })

  it('rejects a wrong version and quarantines the payload', () => {
    localStorage.setItem(
      'universe:agents:v1',
      JSON.stringify({ version: 2, payload: { agents: [], memoryNotes: [], schedules: [] } }),
    )
    const result = loadAgentsSlice()
    expect(result.state).toBeNull()
    expect(result.recoveredFrom).toBeTruthy()
  })

  it('quarantines corrupt json and starts fresh', () => {
    localStorage.setItem('universe:agents:v1', '{not json')
    const result = loadAgentsSlice()
    expect(result.state).toBeNull()
    expect(result.recoveredFrom).toBeTruthy()
    const backup = localStorage.getItem(result.recoveredFrom as string)
    expect(backup).toBe('{not json')
  })

  it('validates shape through the type guard', () => {
    expect(isAgentsSlice({ agents: [agent], memoryNotes: [], schedules: [] })).toBe(true)
    expect(isAgentsSlice({ agents: [{ nope: true }], memoryNotes: [], schedules: [] })).toBe(false)
    expect(isAgentsSlice(null)).toBe(false)
  })

  it('clears cleanly', () => {
    saveAgentsSlice({ agents: [agent], memoryNotes: [], schedules: [] })
    clearAgentsSlice()
    expect(loadAgentsSlice().state).toBeNull()
  })
})
