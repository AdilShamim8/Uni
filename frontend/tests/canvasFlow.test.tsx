import { describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useLibraryStore } from '@/state/libraryStore'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'
import { renderApp, setupAppTest } from './helpers'

setupAppTest()

describe('Canvas — persistent workspace', () => {
  it('saving a message to Canvas copies the selected variant with source ids, never overwriting', async () => {
    renderApp('/')

    // Send a message to get a reply worth saving.
    const input = screen.getByLabelText('Message Universe')
    await userEvent.type(input, 'Draft a short poem about routers')
    await userEvent.click(screen.getByRole('button', { name: 'Send message' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save to Canvas' })).toBeInTheDocument(),
    )

    await userEvent.click(screen.getByRole('button', { name: 'Save to Canvas' }))

    // The Canvas panel opens with a NEW versioned document.
    const ui = useWorkspaceUiStore.getState()
    expect(ui.inspectorOpen).toBe(true)
    expect(ui.inspectorTab).toBe('canvas')
    expect(ui.inspectorArtifactId).toBeTruthy()

    const artifact = useLibraryStore.getState().artifacts[ui.inspectorArtifactId!]
    expect(artifact).toBeTruthy()
    expect(artifact.provenance).toBe('model-output')
    expect(artifact.source?.conversationId).toBeTruthy()
    expect(artifact.versions).toHaveLength(1)

    // Saving the same reply again creates ANOTHER document — no silent
    // overwrite of the first.
    await userEvent.click(screen.getByRole('button', { name: 'Save to Canvas' }))
    await waitFor(() =>
      expect(Object.keys(useLibraryStore.getState().artifacts).length).toBeGreaterThanOrEqual(2),
    )
    const firstStillThere = useLibraryStore.getState().artifacts[artifact.id]
    expect(firstStillThere).toBeTruthy()
    expect(firstStillThere.markdown).toBe(artifact.markdown)
  })

  it('edits autosave as a draft; saving commits a version; restore keeps history', async () => {
    useLibraryStore.getState().initialize()
    const id = useLibraryStore.getState().addArtifact({
      title: 'Roadmap notes',
      kind: 'document',
      markdown: '# Roadmap\n\n- first draft',
    })

    renderApp('/library')
    // Open the Canvas panel after mount (initialize() on mount replays
    // the persisted layout, so set the live state afterwards).
    useWorkspaceUiStore.getState().openInspector({ tab: 'canvas', artifactId: id })
    const editor = await screen.findByLabelText(/Document editor/)
    expect(editor).toHaveValue('# Roadmap\n\n- first draft')

    // Typing does not create versions…
    await userEvent.type(editor, '{enter}- second draft')
    await waitFor(() => {
      expect(useLibraryStore.getState().artifacts[id].workingDraft).toContain('second draft')
    })
    expect(useLibraryStore.getState().artifacts[id].versions).toHaveLength(1)

    // …but an explicit save does.
    await userEvent.click(screen.getByRole('button', { name: /Save version/ }))
    await waitFor(() => {
      expect(useLibraryStore.getState().artifacts[id].versions).toHaveLength(2)
    })
    expect(useLibraryStore.getState().artifacts[id].workingDraft).toBeNull()

    // Restore the initial version — history grows, never shrinks.
    await userEvent.click(screen.getByRole('button', { name: 'Version history' }))
    const versionMenu = await screen.findByRole('menu')
    await userEvent.click(within(versionMenu).getByRole('menuitem', { name: /Created/ }))
    const restoreButton = await screen.findByRole('button', { name: /Restore as new version/ })
    await userEvent.click(restoreButton)

    await waitFor(() => {
      expect(useLibraryStore.getState().artifacts[id].versions).toHaveLength(3)
    })
    expect(useLibraryStore.getState().artifacts[id].markdown).toBe('# Roadmap\n\n- first draft')
    // The later version is still in history.
    expect(
      useLibraryStore.getState().artifacts[id].versions.some((v) =>
        v.markdown.includes('second draft'),
      ),
    ).toBe(true)
  })
})
