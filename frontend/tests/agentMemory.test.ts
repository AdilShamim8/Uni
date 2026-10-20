import { describe, expect, it } from 'vitest'
import type { ChatAdapter, ChatRequest } from '@/domain/chatAdapter'
import {
  setChatAdapter,
  useAppStore,
  resetStoreForTests,
  buildAgentMemoryBlock,
} from '@/state/store'
import {
  resetAgentsStoreForTests,
  useAgentsStore,
} from '@/state/agentsStore'
import { resetPluginsStoreForTests } from '@/state/pluginsStore'

/**
 * Milestone 07 regression suite (F04): employee memory is REAL in
 * requests. Judged from the adapter payload — never from a demo reply
 * that happens to echo a preference.
 */

const captured: ChatRequest[] = []

const capturingAdapter: ChatAdapter = {
  id: 'test-capture',
  label: 'Capture',
  stream: async (request, handlers) => {
    captured.push(request)
    handlers.onStart({})
    handlers.onDelta('ok')
    handlers.onDone('complete')
  },
}

function freshSend(text: string): Promise<void> {
  return useAppStore.getState().sendMessage({ text })
}

describe('employee memory in requests (F04)', () => {
  it('includes employee A’s notes for A only — never B, never ordinary Chat', async () => {
    resetStoreForTests()
    resetAgentsStoreForTests()
    resetPluginsStoreForTests()
    setChatAdapter(capturingAdapter)
    captured.length = 0
    useAppStore.getState().initialize()
    useAgentsStore.getState().initialize()

    // Two employees, one note each.
    const agents = Object.values(useAgentsStore.getState().agents)
    expect(agents.length).toBeGreaterThan(1)
    const agentA = agents[0]
    const agentB = agents[1]
    useAgentsStore.getState().addMemoryNote(agentA.id, 'User prefers concise answers with examples.')
    useAgentsStore.getState().addMemoryNote(agentB.id, 'User likes poetry quotes.')

    const conversationA = useAppStore.getState().openAgentConversation(agentA.id)
    await freshSend('hello from A')
    const requestA = captured.at(-1)
    expect(requestA?.system).toContain('User prefers concise answers with examples.')
    expect(requestA?.system).not.toContain('poetry quotes')

    const conversationB = useAppStore.getState().openAgentConversation(agentB.id)
    await freshSend('hello from B')
    const requestB = captured.at(-1)
    expect(requestB?.system).toContain('poetry quotes')
    expect(requestB?.system).not.toContain('concise answers')
    expect(conversationB).not.toBe(conversationA)

    // Ordinary Chat never sees either note.
    useAppStore.getState().newConversation()
    await freshSend('hello from plain chat')
    const requestPlain = captured.at(-1)
    expect(requestPlain?.system ?? '').not.toContain('concise answers')
    expect(requestPlain?.system ?? '').not.toContain('poetry quotes')
  })

  it('edits and removals change subsequent requests', async () => {
    resetStoreForTests()
    resetAgentsStoreForTests()
    setChatAdapter(capturingAdapter)
    captured.length = 0
    useAppStore.getState().initialize()
    useAgentsStore.getState().initialize()

    const agent = Object.values(useAgentsStore.getState().agents)[0]
    const noteId = useAgentsStore
      .getState()
      .addMemoryNote(agent.id, 'Original note text for editing') as string
    useAppStore.getState().openAgentConversation(agent.id)

    await freshSend('first')
    expect(captured.at(-1)?.system).toContain('Original note text for editing')

    // Edit -> the next request carries the new text.
    useAgentsStore.getState().updateMemoryNote(noteId, 'Edited note text')
    await freshSend('second')
    expect(captured.at(-1)?.system).toContain('Edited note text')
    expect(captured.at(-1)?.system).not.toContain('Original note text for editing')

    // Remove -> the next request excludes the note entirely.
    useAgentsStore.getState().deleteMemoryNote(noteId)
    await freshSend('third')
    expect(captured.at(-1)?.system).not.toContain('Edited note text')
    expect(captured.at(-1)?.system).not.toContain('Known facts and preferences')
  })

  it('the memory block is bounded and scoped by the stated limits', () => {
    resetAgentsStoreForTests()
    useAgentsStore.getState().initialize()
    const agent = Object.values(useAgentsStore.getState().agents)[0]

    expect(buildAgentMemoryBlock(agent.id)).toBeNull()

    useAgentsStore.getState().addMemoryNote(agent.id, 'Only note.')
    const block = buildAgentMemoryBlock(agent.id) as string
    expect(block).toContain('Only note.')
    expect(block).toContain('Known facts and preferences')
  })
})
