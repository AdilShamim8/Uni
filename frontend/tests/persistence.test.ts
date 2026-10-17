import { beforeEach, describe, expect, it } from 'vitest'
import type { Conversation, PersistedState } from '@/domain/types'
import {
  clearPersisted,
  loadPersisted,
  savePersisted,
} from '@/services/storage/localStorage'
import { buildSeedProviders, DEFAULT_PREFERENCES } from '@/services/mock/fixtures'

function minimalConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c-test',
    title: 'Test',
    createdAt: 1,
    updatedAt: 2,
    pinned: false,
    archived: false,
    temporary: false,
    nodes: {
      u1: {
        id: 'u1',
        parentId: null,
        role: 'user',
        content: 'hello',
        createdAt: 1,
        status: 'complete',
        feedback: null,
      },
    },
    activeLeafId: 'u1',
    ...overrides,
  }
}

function validState(): PersistedState {
  return {
    version: 1,
    savedAt: 123,
    conversations: [minimalConversation()],
    preferences: { ...DEFAULT_PREFERENCES },
    providers: buildSeedProviders(),
    activeProviderId: 'provider-demo-balanced',
    activeModelId: 'demo-pro',
  }
}

beforeEach(() => {
  localStorage.clear()
})

describe('local persistence', () => {
  it('round-trips a valid state', () => {
    expect(savePersisted(validState())).toBe(true)
    const { state, recoveredFrom } = loadPersisted()
    expect(recoveredFrom).toBeUndefined()
    expect(state?.version).toBe(1)
    expect(state?.conversations[0].id).toBe('c-test')
    expect(state?.providers.length).toBeGreaterThan(0)
  })

  it('quarantines malformed JSON and starts fresh', () => {
    localStorage.setItem('universe:data', '{not json at all')
    const { state, recoveredFrom } = loadPersisted()
    expect(state).toBeNull()
    expect(recoveredFrom).toBeTruthy()
    const backup = localStorage.getItem(recoveredFrom!)
    expect(backup).toBe('{not json at all')
    expect(localStorage.getItem('universe:data')).toBeNull()
  })

  it('rejects an unknown schema version', () => {
    const wrongVersion = { ...validState(), version: 99 }
    localStorage.setItem('universe:data', JSON.stringify(wrongVersion))
    const { state } = loadPersisted()
    expect(state).toBeNull()
  })

  it('rejects structurally invalid conversations', () => {
    const broken = { ...validState(), conversations: [{ nope: true }] }
    localStorage.setItem('universe:data', JSON.stringify(broken))
    const { state } = loadPersisted()
    expect(state).toBeNull()
  })

  it('clears cleanly', () => {
    savePersisted(validState())
    clearPersisted()
    expect(loadPersisted().state).toBeNull()
  })
})
