import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import {
  agentToExportJson,
  importAgentJson,
} from '@/features/agents/agentPortability'
import { useAgentsStore } from '@/state/agentsStore'
import type { AgentProfile } from '@/domain/workspaceTypes'

afterEach(() => {
  cleanup()
  useAgentsStore.setState({ agents: {} })
})

function sampleAgent(overrides: Partial<AgentProfile> = {}): AgentProfile {
  const now = Date.now()
  return {
    id: 'agent-sample',
    name: 'Sample Agent',
    description: 'A sample profile',
    instructions: 'You are a sample agent for tests.',
    category: 'specialist',
    providerId: 'provider-local-1',
    modelId: 'model-x',
    tools: ['research'],
    projectIds: ['project-1'],
    starters: ['Do the thing', 'Do the other thing'],
    archived: false,
    builtin: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

describe('agent export', () => {
  it('serializes the persona with the format marker', () => {
    const json = agentToExportJson(sampleAgent())
    const parsed = JSON.parse(json)

    expect(parsed.format).toBe('uni.agent/v1')
    expect(typeof parsed.exportedAt).toBe('string')
    expect(parsed.agent).toMatchObject({
      name: 'Sample Agent',
      description: 'A sample profile',
      instructions: 'You are a sample agent for tests.',
      category: 'specialist',
      tools: ['research'],
      starters: ['Do the thing', 'Do the other thing'],
    })
  })

  it('never exports device-specific fields', () => {
    const json = agentToExportJson(sampleAgent())
    const agent = JSON.parse(json).agent

    expect(agent).not.toHaveProperty('id')
    expect(agent).not.toHaveProperty('providerId')
    expect(agent).not.toHaveProperty('modelId')
    expect(agent).not.toHaveProperty('projectIds')
    expect(agent).not.toHaveProperty('builtin')
    expect(agent).not.toHaveProperty('archived')
  })
})

describe('agent import', () => {
  function exportText(agent: AgentProfile): string {
    return agentToExportJson(agent)
  }

  it('round-trips an exported agent into the store with a fresh id', () => {
    const original = sampleAgent()
    const result = importAgentJson(exportText(original))

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.agentId).not.toBe(original.id)

    const stored = useAgentsStore.getState().agents[result.agentId]
    expect(stored).toMatchObject({
      name: 'Sample Agent',
      description: 'A sample profile',
      instructions: 'You are a sample agent for tests.',
      category: 'specialist',
      tools: ['research'],
      starters: ['Do the thing', 'Do the other thing'],
      providerId: null,
      modelId: null,
      builtin: false,
      archived: false,
    })
  })

  it('rejects invalid JSON with a readable error', () => {
    const result = importAgentJson('{not json')
    expect(result).toEqual({ ok: false, error: 'This file is not valid JSON.' })
  })

  it('rejects JSON that is not an agent export', () => {
    const result = importAgentJson(JSON.stringify({ hello: 'world' }))
    expect(result.ok).toBe(false)
  })

  it('rejects files with an unknown format marker', () => {
    const result = importAgentJson(JSON.stringify({ format: 'something.else/v9' }))
    expect(result.ok).toBe(false)
    expect(result).toEqual({
      ok: false,
      error: 'This file was not exported by Uni (unknown format).',
    })
  })

  it('rejects agents without a name or instructions', () => {
    const noName = importAgentJson(
      JSON.stringify({
        format: 'uni.agent/v1',
        agent: { instructions: 'x'.repeat(140), category: 'specialist' },
      }),
    )
    expect(noName.ok).toBe(false)

    const noInstructions = importAgentJson(
      JSON.stringify({ format: 'uni.agent/v1', agent: { name: 'Nope' } }),
    )
    expect(noInstructions.ok).toBe(false)
  })

  it('sanitizes unknown tools and clamps starters', () => {
    const result = importAgentJson(
      JSON.stringify({
        format: 'uni.agent/v1',
        agent: {
          name: 'Odd Agent',
          instructions: 'x'.repeat(140),
          category: 'weird',
          tools: ['research', 'not-a-tool', 42],
          starters: ['one', '', 'two', 'three', 'four', 'five', 'six', 'seven', ''],
        },
      }),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const stored = useAgentsStore.getState().agents[result.agentId]
    expect(stored.tools).toEqual(['research'])
    expect(stored.category).toBe('specialist')
    expect(stored.starters).toEqual(['one', 'two', 'three', 'four', 'five', 'six'])
  })

  it('importing the same file twice creates two independent agents', () => {
    const text = exportText(sampleAgent())
    const first = importAgentJson(text)
    const second = importAgentJson(text)

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (!first.ok || !second.ok) return
    expect(first.agentId).not.toBe(second.agentId)
    expect(Object.keys(useAgentsStore.getState().agents)).toHaveLength(2)
  })
})

describe('agent export download', () => {
  it('triggers a .agent.json download', () => {
    const urlCreator = vi.fn(() => 'blob:mock-url')
    const revoke = vi.fn()
    vi.stubGlobal('URL', {
      createObjectURL: urlCreator,
      revokeObjectURL: revoke,
    })

    const click = vi.fn()
    const anchor = { href: '', download: '', click, remove: vi.fn() }
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(
      anchor as unknown as HTMLAnchorElement,
    )
    const appendChild = vi.spyOn(document.body, 'appendChild').mockImplementation(
      () => null as unknown as Node,
    )

    // Import dynamically so the stubbed URL global is captured.
    return import('@/features/agents/agentPortability').then(({ exportAgentFile }) => {
      exportAgentFile(sampleAgent({ name: 'Download Me' }))
      expect(anchor.download).toBe('download-me.agent.json')
      expect(click).toHaveBeenCalledTimes(1)
      createElement.mockRestore()
      appendChild.mockRestore()
      vi.unstubAllGlobals()
    })
  })
})
