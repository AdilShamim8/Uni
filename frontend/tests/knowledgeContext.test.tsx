import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ChatAdapter, ChatRequest } from '@/domain/chatAdapter'
import { setChatAdapter, useAppStore } from '@/state/store'
import { useContextStore } from '@/state/contextStore'
import { useKnowledgeStore } from '@/state/knowledgeStore'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'
import { renderApp, setupAppTest } from './helpers'

setupAppTest()

/** Records every request the send path issues, replies with one word. */
function captureAdapter(): { requests: ChatRequest[]; adapter: ChatAdapter } {
  const requests: ChatRequest[] = []
  const adapter: ChatAdapter = {
    id: 'capture',
    label: 'Capture',
    stream: async (request, handlers) => {
      requests.push(request)
      handlers.onStart({})
      handlers.onDelta('Received.')
      handlers.onDone('complete')
    },
  }
  return { requests, adapter }
}

async function startConversation(): Promise<string> {
  renderApp('/')
  const input = screen.getByLabelText('Message Uni')
  await userEvent.type(input, 'How do I onboard?')
  await userEvent.click(screen.getByRole('button', { name: 'Send message' }))
  await waitFor(() => expect(useAppStore.getState().activeConversationId).toBeTruthy())
  return useAppStore.getState().activeConversationId as string
}

function seedKnowledge(): void {
  useKnowledgeStore.getState().initialize()
  useKnowledgeStore.getState().addDocument({
    title: 'Onboarding guide',
    text: '# Setup\n\nInstall the CLI from the package registry and run uni init.\n\n# Accounts\n\nNew hires get a laptop shipped within a week.',
    source: 'paste',
  })
}

describe('knowledge retrieval — context integration', () => {
  it('the add-context menu offers knowledge retrieval only when documents exist', async () => {
    const conversationId = await startConversation()
    useWorkspaceUiStore.getState().openInspector({ tab: 'context' })
    await screen.findByRole('tab', { name: 'Context' })

    // Empty base: the menu honestly offers nothing knowledge-related.
    await userEvent.click(screen.getByRole('button', { name: 'Add context' }))
    let menu = await screen.findByRole('menu')
    expect(within(menu).queryByText(/Knowledge base retrieval/)).toBeNull()
    await userEvent.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())

    seedKnowledge()
    await userEvent.click(screen.getByRole('button', { name: 'Add context' }))
    menu = await screen.findByRole('menu')
    await userEvent.click(within(menu).getByRole('menuitem', { name: /Knowledge base retrieval/ }))

    const row = (await screen.findByText('Knowledge base')).closest('li')
    expect(row).not.toBeNull()
    expect(within(row!).getByText(/retrieval at send · 1 document/)).toBeInTheDocument()
    expect(
      screen.getByText(/Knowledge base retrieval also runs at send/),
    ).toBeInTheDocument()

    // One retrieval source per target: the menu item cannot duplicate it.
    expect(useContextStore.getState().getSelection(conversationId)).toHaveLength(1)
    useContextStore.getState().addKnowledgeContext(conversationId)
    expect(useContextStore.getState().getSelection(conversationId)).toHaveLength(1)
  })

  it('an empty knowledge base resolves to an honest unavailable state', async () => {
    const conversationId = await startConversation()
    useContextStore.getState().addKnowledgeContext(conversationId)

    useWorkspaceUiStore.getState().openInspector({ tab: 'context' })
    const row = (await screen.findByText('Knowledge base')).closest('li')
    expect(row).not.toBeNull()
    expect(within(row!).getByText('The knowledge base is empty')).toBeInTheDocument()
  })

  it('a live send retrieves cited excerpts matching the message text', async () => {
    seedKnowledge()
    const { requests, adapter } = captureAdapter()
    setChatAdapter(adapter)

    const conversationId = await startConversation()
    useContextStore.getState().addKnowledgeContext(conversationId)

    const input = screen.getByLabelText('Message Uni')
    await userEvent.type(input, 'How do I install the CLI?')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(requests.length).toBeGreaterThan(0))
    const system = requests[requests.length - 1].system ?? ''
    expect(system).toContain('Knowledge base excerpts')
    expect(system).toContain('retrieved locally')
    expect(system).toContain('From “Onboarding guide” — Setup')
    expect(system).toContain('Install the CLI')
    // The irrelevant section is not injected.
    expect(system).not.toContain('New hires get a laptop')
  })

  it('retrieval is per message — the next send queries the new text', async () => {
    seedKnowledge()
    const { requests, adapter } = captureAdapter()
    setChatAdapter(adapter)

    const conversationId = await startConversation()
    useContextStore.getState().addKnowledgeContext(conversationId)

    const input = screen.getByLabelText('Message Uni')
    await userEvent.type(input, 'When do new hires get a laptop?')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() => expect(requests.length).toBe(2))
    const lastSystem = requests[requests.length - 1].system ?? ''
    expect(lastSystem).toContain('Accounts')
    expect(lastSystem).not.toContain('Install the CLI')
  })

  it('without a knowledge selection, sends carry no knowledge block', async () => {
    seedKnowledge()
    const { requests, adapter } = captureAdapter()
    setChatAdapter(adapter)

    await startConversation()
    const input = screen.getByLabelText('Message Uni')
    await userEvent.type(input, 'How do I install the CLI?')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))

    await waitFor(() => expect(requests.length).toBeGreaterThan(0))
    expect(requests[requests.length - 1].system ?? '').not.toContain('Knowledge base excerpts')
  })

  it('knowledge content never leaks into chat exports', () => {
    seedKnowledge()
    const exported = useAppStore.getState().exportAllData()
    expect(exported).not.toContain('Install the CLI')
    expect(exported).not.toContain('Onboarding guide')
  })
})
