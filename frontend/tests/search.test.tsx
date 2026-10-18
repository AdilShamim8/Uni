import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useAppStore } from '@/state/store'
import { useLibraryStore } from '@/state/libraryStore'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'
import { renderApp, setupAppTest } from './helpers'

setupAppTest()

describe('workspace command palette', () => {
  it('opens with Ctrl+K as workspace-wide search', async () => {
    renderApp('/')
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Search workspace' })
    expect(dialog).toBeInTheDocument()
    // Scopes are visible and selectable.
    for (const scope of ['All', 'Chats', 'Tasks', 'Agents', 'Projects', 'Files']) {
      expect(
        within(dialog).getByRole('tab', { name: scope }),
      ).toBeInTheDocument()
    }
  })

  it('focuses the input, filters chat content, and opens the result by keyboard', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Search workspace' }))

    const input = await screen.findByPlaceholderText(/Search everything/)
    expect(input).toHaveFocus()

    await user.keyboard('rainy')
    const option = await screen.findByRole('option', { name: /Relaxed weekend ideas/ })
    expect(option).toBeInTheDocument()

    await user.keyboard('{Enter}')
    expect(await screen.findByText('Rainy version:')).toBeInTheDocument()
  })

  it('scopes results — Files shows documents, not chats', async () => {
    useLibraryStore.getState().initialize()
    useLibraryStore.getState().addArtifact({
      title: 'Quarterly brainstorm doc',
      kind: 'notes',
      markdown: '# Quarterly brainstorm\n\nIdeas for next quarter.',
    })

    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Search workspace' }))
    await user.click(await screen.findByRole('tab', { name: 'Files' }))

    const input = await screen.findByPlaceholderText(/Search files/)
    await user.type(input, 'brainstorm')
    expect(await screen.findByRole('option', { name: /Quarterly brainstorm doc/ })).toBeInTheDocument()
    // Chat results are out of scope.
    expect(screen.queryByRole('option', { name: /Relaxed weekend ideas/ })).toBeNull()
  })

  it('excludes temporary chats from results', async () => {
    const user = userEvent.setup()
    renderApp('/')
    const temporaryId = useAppStore.getState().newConversation({ temporary: true })
    expect(useAppStore.getState().conversations[temporaryId].temporary).toBe(true)

    await user.click(screen.getByRole('button', { name: 'Search workspace' }))
    const input = await screen.findByPlaceholderText(/Search everything/)
    await user.type(input, 'new chat')
    // The only "New chat" option is the quick action — the temporary
    // conversation itself is never indexed.
    const options = screen.getAllByRole('option').filter((option) =>
      within(option).queryByText('New chat'),
    )
    expect(options).toHaveLength(1)
    expect(within(options[0]).getByText('Start a fresh conversation')).toBeInTheDocument()
  })

  it('runs the New document action end to end', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Search workspace' }))

    const action = await screen.findByRole('option', { name: /New document/ })
    await user.click(action)

    // A real artifact was created and the Canvas inspector opened on it.
    await waitFor(() => {
      const artifacts = Object.values(useLibraryStore.getState().artifacts)
      expect(artifacts.length).toBeGreaterThan(0)
    })
    const created = Object.values(useLibraryStore.getState().artifacts).find(
      (artifact) => artifact.title === 'Untitled document',
    )
    expect(created).toBeTruthy()
    await waitFor(() => {
      const ui = useWorkspaceUiStore.getState()
      expect(ui.inspectorOpen).toBe(true)
      expect(ui.inspectorTab).toBe('canvas')
      expect(ui.inspectorArtifactId).toBe(created!.id)
    })
  })

  it('switches theme from the palette action', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Search workspace' }))

    const before = document.documentElement.getAttribute('data-theme')
    const action = await screen.findByRole('option', { name: /Switch to (dark|light) theme/ })
    await user.click(action)
    await waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).not.toBe(before),
    )
  })

  it('shows a useful empty state when nothing matches', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Search workspace' }))
    const input = await screen.findByPlaceholderText(/Search everything/)
    await user.type(input, 'zzzz-no-such-record')
    expect(
      await screen.findByText(/No results match “zzzz-no-such-record”/i),
    ).toBeInTheDocument()
  })

  it('navigates with arrow keys through grouped results', async () => {
    const user = userEvent.setup()
    renderApp('/')
    await user.click(screen.getByRole('button', { name: 'Search workspace' }))
    await screen.findByPlaceholderText(/Search everything/)

    // Empty query: chats plus quick actions, several items.
    const options = screen.getAllByRole('option')
    expect(options.length).toBeGreaterThan(3)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowDown}')
    const selected = screen
      .getAllByRole('option')
      .filter((option) => option.getAttribute('aria-selected') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0]).toBe(options[1])
  })
})
