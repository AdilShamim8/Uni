import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { flushContextPersistence, useContextStore } from '@/state/contextStore'
import { useLibraryStore } from '@/state/libraryStore'
import { useWorkStore } from '@/state/workStore'
import { useAppStore } from '@/state/store'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'
import { renderApp, setupAppTest } from './helpers'

setupAppTest()

const main = () => within(screen.getByRole('main'))

describe('project context — selection, scoping, and cleanup', () => {
  it('adds and removes context for the active conversation, previewing exactly what a live send includes', async () => {
    useLibraryStore.getState().initialize()
    useLibraryStore.getState().addArtifact({
      title: 'Product notes',
      kind: 'notes',
      markdown: '# Product notes\n\nThe widget ships in Q3.',
    })

    renderApp('/')
    // Start a conversation so it becomes the context target.
    const input = screen.getByLabelText('Message Uni')
    await userEvent.type(input, 'Summarize my product notes')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() =>
      expect(useAppStore.getState().activeConversationId).toBeTruthy(),
    )

    // Open the context inspector (panel + Context tab).
    useWorkspaceUiStore.getState().openInspector({ tab: 'context' })
    const inspectorTab = await screen.findByRole('tab', { name: 'Context' })
    expect(inspectorTab).toHaveAttribute('aria-selected', 'true')

    // Add the document from the Add-context menu.
    await userEvent.click(screen.getByRole('button', { name: 'Add context' }))
    const menu = await screen.findByRole('menu')
    await userEvent.click(within(menu).getByRole('menuitem', { name: 'Product notes' }))

    const row = (await screen.findByText('Product notes')).closest('li')
    expect(row).not.toBeNull()
    expect(within(row!).getByText(/Document/)).toBeInTheDocument()

    // The preview shows the real content that would be included.
    expect(
      await screen.findByText(/Included on your next live send/),
    ).toBeInTheDocument()
    expect(screen.getByText(/The widget ships in Q3/)).toBeInTheDocument()

    // Remove it again.
    await userEvent.click(screen.getByRole('button', { name: 'Remove Product notes from context' }))
    await waitFor(() => expect(screen.queryByText('Product notes')).toBeNull())
  })

  it('context is included only when the user sends — and stays out of exports', async () => {
    useLibraryStore.getState().initialize()
    useContextStore.getState().initialize()
    const artifactId = useLibraryStore.getState().addArtifact({
      title: 'Secret sauce doc',
      kind: 'notes',
      markdown: 'INTERNAL ONLY: the secret ingredient is cardamom.',
    })
    const conversationId = useAppStore.getState().newConversation()
    useContextStore.getState().addArtifactContext(conversationId, {
      refId: artifactId,
      title: 'Secret sauce doc',
    })

    // Exports never contain context content (credential-free export rule).
    const exported = useAppStore.getState().exportAllData()
    expect(exported).not.toContain('cardamom')

    // The context slice itself is persisted separately (debounced — flush).
    flushContextPersistence()
    expect(localStorage.getItem('universe:context:v1')).toContain('Secret sauce doc')
  })

  it('deleted documents show as unavailable — never a raw orphan id', async () => {
    useLibraryStore.getState().initialize()
    useContextStore.getState().initialize()
    const conversationId = useAppStore.getState().newConversation()
    const artifactId = useLibraryStore.getState().addArtifact({
      title: 'Fragile doc',
      kind: 'notes',
      markdown: 'content',
    })
    useContextStore.getState().addArtifactContext(conversationId, {
      refId: artifactId,
      title: 'Fragile doc',
    })

    useLibraryStore.getState().deleteArtifact(artifactId)
    await waitFor(() => {
      const selection = useContextStore.getState().getSelection(conversationId)
      expect(selection).toHaveLength(0)
    })
  })

  it('deleting a project clears task and agent references safely', async () => {
    useLibraryStore.getState().initialize()
    useWorkStore.getState().initialize()
    const projectId = useLibraryStore.getState().addProject({ name: 'Move' })
    const taskId = useWorkStore.getState().createTask({
      title: 'Pack boxes',
      goal: '',
      deliverable: 'email-draft',
      projectId,
    })

    useLibraryStore.getState().deleteProject(projectId)
    await waitFor(() => {
      expect(useWorkStore.getState().tasks[taskId].projectId).toBeNull()
    })
    expect(useLibraryStore.getState().projects[projectId]).toBeUndefined()
  })

  it('project detail links its real tasks, documents, and context-using chats', async () => {
    useLibraryStore.getState().initialize()
    useWorkStore.getState().initialize()
    useContextStore.getState().initialize()
    renderApp('/library')

    const projectId = useLibraryStore.getState().addProject({
      name: 'Website relaunch',
      description: 'Everything about the new site',
    })
    useWorkStore.getState().createTask({
      title: 'Rewrite homepage copy',
      goal: '',
      deliverable: 'email-draft',
      projectId,
    })
    useLibraryStore.getState().addArtifact({
      title: 'Relaunch checklist',
      kind: 'notes',
      markdown: '- checklist',
      projectId,
    })
    // A chat that uses the project as context (created after mount so the
    // hydrated store keeps it).
    const chatId = useAppStore.getState().newConversation()
    useContextStore.getState().addProjectContext(chatId, {
      refId: projectId,
      title: 'Website relaunch',
    })

    const projectButton = await screen.findByRole('button', {
      name: 'Open project Website relaunch',
    })
    await userEvent.click(projectButton)

    expect(await main().findByText('Rewrite homepage copy')).toBeInTheDocument()
    expect(main().getByText('Relaunch checklist')).toBeInTheDocument()
    expect(main().getByText(/1 chat with this project in context/)).toBeInTheDocument()
    expect(main().getByText(/1 task · 1 document/)).toBeInTheDocument()
  })
})
