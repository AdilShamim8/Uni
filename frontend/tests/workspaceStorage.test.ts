import { afterEach, describe, expect, it } from 'vitest'
import {
  clearWorkspace,
  isWorkspaceState,
  loadWorkspace,
  saveWorkspace,
} from '@/services/storage/workspaceStorage'
import type { WorkspaceState } from '@/domain/workspaceTypes'

function sampleWorkspace(): WorkspaceState {
  return {
    version: 1,
    savedAt: Date.now(),
    agents: [
      {
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
      },
    ],
    memoryNotes: [],
    schedules: [],
    tasks: [
      {
        id: 'task-1',
        title: 'Research routers',
        goal: 'Compare two routers',
        deliverable: 'research-report',
        agentId: 'ag-universe',
        projectId: null,
        attachments: [],
        status: 'draft',
        mode: 'demo',
        createdAt: 1,
        updatedAt: 1,
        events: [],
        currentRunId: null,
        interrupted: false,
        report: null,
        inputRequest: null,
      },
    ],
    artifacts: [
      {
        id: 'art-1',
        title: 'Router report',
        kind: 'report',
        taskId: 'task-1',
        projectId: null,
        markdown: '# Report',
        createdAt: 1,
        updatedAt: 1,
        provenance: 'demo-simulation',
      },
    ],
    projects: [],
  }
}

describe('workspace storage', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('round-trips a valid workspace', () => {
    const workspace = sampleWorkspace()
    expect(saveWorkspace(workspace)).toBe(true)
    const result = loadWorkspace()
    expect(result.state).not.toBeNull()
    expect(result.state?.agents[0]?.name).toBe('Universe Assistant')
    expect(result.state?.tasks[0]?.title).toBe('Research routers')
    expect(result.state?.artifacts[0]?.provenance).toBe('demo-simulation')
  })

  it('rejects a wrong version instead of mis-reading it', () => {
    localStorage.setItem('universe:workspace:v1', JSON.stringify({ ...sampleWorkspace(), version: 2 }))
    const result = loadWorkspace()
    expect(result.state).toBeNull()
    expect(result.recoveredFrom).toBeTruthy()
  })

  it('quarantines corrupt json and starts fresh', () => {
    localStorage.setItem('universe:workspace:v1', '{not json')
    const result = loadWorkspace()
    expect(result.state).toBeNull()
    expect(result.recoveredFrom).toBeTruthy()
    // The bad payload was backed up, not silently destroyed.
    const backup = localStorage.getItem(result.recoveredFrom as string)
    expect(backup).toBe('{not json')
  })

  it('validates shape through the type guard', () => {
    expect(isWorkspaceState(sampleWorkspace())).toBe(true)
    expect(isWorkspaceState({ version: 1 })).toBe(false)
    expect(isWorkspaceState(null)).toBe(false)
    expect(
      isWorkspaceState({ ...sampleWorkspace(), tasks: [{ nope: true }] }),
    ).toBe(false)
  })

  it('clears cleanly', () => {
    saveWorkspace(sampleWorkspace())
    clearWorkspace()
    expect(loadWorkspace().state).toBeNull()
  })
})
