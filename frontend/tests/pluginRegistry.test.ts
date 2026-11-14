import { describe, expect, it } from 'vitest'
import { PLUGIN_CATALOG, findPlugin } from '@/features/plugins/registry'
import { PLUGIN_ACTIONS } from '@/features/plugins/pluginActions'

/**
 * The plugin catalogue is static, honest metadata: built-ins run local
 * adapters; external entries describe what an integration would need
 * and can never show a connected state.
 */
describe('PLUGIN_CATALOG', () => {
  it('ids are unique and stable', () => {
    const ids = PLUGIN_CATALOG.map((plugin) => plugin.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(['documents', 'data-analysis', 'library-context', 'github', 'gmail', 'drive'])
  })

  it('every entry carries complete static metadata', () => {
    for (const plugin of PLUGIN_CATALOG) {
      expect(plugin.name.length).toBeGreaterThan(0)
      expect(plugin.description.length).toBeGreaterThan(0)
      expect(plugin.version.length).toBeGreaterThan(0)
      expect(['local-built-in', 'integration-required']).toContain(plugin.execution)
    }
  })

  it('built-ins run locally and declare their capabilities', () => {
    const builtins = PLUGIN_CATALOG.filter((plugin) => plugin.builtin)
    expect(builtins.length).toBe(3)
    for (const plugin of builtins) {
      expect(plugin.execution).toBe('local-built-in')
      expect(plugin.capabilities.length).toBeGreaterThan(0)
      expect(plugin.scopes.length).toBeGreaterThan(0)
    }
  })

  it('external entries are honest: no capabilities, integration required', () => {
    const external = PLUGIN_CATALOG.filter((plugin) => !plugin.builtin)
    expect(external.length).toBe(3)
    for (const plugin of external) {
      expect(plugin.execution).toBe('integration-required')
      expect(plugin.capabilities).toEqual([])
      expect(plugin.requirements?.length ?? 0).toBeGreaterThan(0)
    }
  })
})

describe('findPlugin', () => {
  it('resolves by id and returns undefined for unknown ids', () => {
    expect(findPlugin('documents')?.name).toBe('Documents')
    expect(findPlugin('nope')).toBeUndefined()
  })
})

/** The thread plugin chips offer actions only where capabilities exist. */
describe('PLUGIN_ACTIONS', () => {
  it('maps actions onto the built-in catalog entries', () => {
    const builtinIds = new Set(
      PLUGIN_CATALOG.filter((plugin) => plugin.builtin).map((plugin) => plugin.id),
    )
    for (const id of Object.keys(PLUGIN_ACTIONS)) {
      expect(builtinIds.has(id)).toBe(true)
    }
  })

  it('every action names a capability the plugin actually declares', () => {
    for (const [id, actions] of Object.entries(PLUGIN_ACTIONS)) {
      const capabilities = new Set(findPlugin(id)?.capabilities ?? [])
      for (const action of actions) {
        expect(capabilities.has(action.capability)).toBe(true)
        expect(action.actionLabel.length).toBeGreaterThan(0)
      }
    }
  })
})
