import { afterEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import {
  AGENT_GALLERY,
  galleryEntryToJson,
  installGalleryAgent,
  isGalleryAgentInstalled,
} from '@/features/agents/agentGallery'
import { importAgentJson } from '@/features/agents/agentPortability'
import { useAgentsStore } from '@/state/agentsStore'
import { TOOL_REGISTRY } from '@/features/chat/toolRegistry'

afterEach(() => {
  cleanup()
  useAgentsStore.setState({ agents: {} })
})

describe('community gallery catalog', () => {
  it('ships a curated set of entries with unique ids and names', () => {
    expect(AGENT_GALLERY.length).toBeGreaterThanOrEqual(6)
    const ids = AGENT_GALLERY.map((entry) => entry.id)
    const names = AGENT_GALLERY.map((entry) => entry.agent.name)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(names).size).toBe(names.length)
  })

  it('every entry is a complete, honest persona', () => {
    const validTools = new Set(TOOL_REGISTRY.map((tool) => tool.id))
    for (const entry of AGENT_GALLERY) {
      expect(entry.agent.name.trim().length).toBeGreaterThan(0)
      expect(entry.agent.description.trim().length).toBeGreaterThan(0)
      expect(entry.agent.instructions.trim().length).toBeGreaterThan(40)
      expect(entry.emoji.trim().length).toBeGreaterThan(0)
      expect(entry.credit.trim().length).toBeGreaterThan(0)
      // Tools must be real registry tools (no invented powers).
      for (const tool of entry.agent.tools) {
        expect(validTools.has(tool)).toBe(true)
      }
      // Starters: at least one, at most the portable limit.
      expect(entry.agent.starters.length).toBeGreaterThanOrEqual(1)
      expect(entry.agent.starters.length).toBeLessThanOrEqual(6)
    }
  })

  it('every entry round-trips through the standard import path', () => {
    for (const entry of AGENT_GALLERY) {
      useAgentsStore.setState({ agents: {} })
      const result = installGalleryAgent(entry)
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      const saved = useAgentsStore.getState().agents[result.agentId]
      expect(saved).toBeDefined()
      expect(saved.name).toBe(entry.agent.name)
      expect(saved.instructions).toBe(entry.agent.instructions)
      expect(saved.builtin).toBe(false)
    }
  })

  it('the serialized form is a valid uni.agent/v1 file', () => {
    const entry = AGENT_GALLERY[0]
    const json = galleryEntryToJson(entry)
    expect(JSON.parse(json).format).toBe('uni.agent/v1')
    // It imports through the public file-import path unchanged.
    expect(importAgentJson(json).ok).toBe(true)
  })

  it('reports installed state honestly', () => {
    const entry = AGENT_GALLERY[0]
    expect(isGalleryAgentInstalled(entry, useAgentsStore.getState().agents)).toBe(false)

    const result = installGalleryAgent(entry)
    expect(result.ok).toBe(true)
    expect(isGalleryAgentInstalled(entry, useAgentsStore.getState().agents)).toBe(true)
  })
})
