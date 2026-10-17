import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  flushWorkPersistence,
  setRunnerStepMs,
  useWorkStore,
} from '@/state/workStore'
import { useLibraryStore } from '@/state/libraryStore'
import { downloadText } from '@/features/chat/exportUtils'
import { renderApp, setupAppTest } from './helpers'

vi.mock('@/features/chat/exportUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/chat/exportUtils')>()
  return { ...actual, downloadText: vi.fn() }
})

describe('Library — artifact collection', () => {
  setupAppTest()

  it('starts empty with an honest empty state', () => {
    renderApp('/library')
    expect(screen.getByText('Nothing saved yet')).toBeTruthy()
    expect(screen.getByText(/local to this device/i)).toBeTruthy()
  })

  it('saves a Work report to the Library and opens it from there', async () => {
    setRunnerStepMs(5)
    useWorkStore.getState().initialize()
    const taskId = useWorkStore.getState().createTask({
      title: 'Router research',
      goal: 'Compare routers',
      deliverable: 'research-report',
    })
    useWorkStore.getState().runTask(taskId)
    await waitFor(() => {
      expect(useWorkStore.getState().tasks[taskId]?.status).toBe('needs_input')
    })
    useWorkStore.getState().answerInput(taskId, 'Quick comparison')
    await waitFor(() => {
      expect(useWorkStore.getState().tasks[taskId]?.status).toBe('ready_for_review')
    })
    flushWorkPersistence()

    renderApp(`/work/${taskId}`)
    await userEvent.click(await screen.findByRole('button', { name: /Save to Library/ }))

    // The artifact now exists, linked to its task, honestly labeled.
    const artifacts = Object.values(useLibraryStore.getState().artifacts)
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]?.title).toBe('Router research')
    expect(artifacts[0]?.taskId).toBe(taskId)
    expect(artifacts[0]?.provenance).toBe('demo-simulation')

    // Saving again updates the same artifact instead of duplicating.
    await userEvent.click(screen.getByRole('button', { name: /Update library copy/ }))
    expect(Object.keys(useLibraryStore.getState().artifacts)).toHaveLength(1)
    setRunnerStepMs(1100)
  }, 15000)

  it('lists, renames, edits, downloads, and deletes artifacts', async () => {
    useLibraryStore.getState().initialize()
    const id = useLibraryStore.getState().addArtifact({
      title: 'Weekly notes',
      kind: 'notes',
      markdown: '# Weekly notes\n\nAll mine.',
    })

    renderApp('/library')
    expect(await screen.findByText('Weekly notes')).toBeTruthy()
    expect(screen.getByText(/written by you/)).toBeTruthy()

    // Filter to Notes hides nothing here; switch to Reports to hide it.
    await userEvent.click(screen.getByRole('tab', { name: 'Reports' }))
    expect(screen.queryByText('Weekly notes')).toBeNull()
    await userEvent.click(screen.getByRole('tab', { name: 'Notes' }))
    expect(screen.getByText('Weekly notes')).toBeTruthy()

    // Open the viewer, edit the content, and download the edited version.
    await userEvent.click(screen.getByRole('button', { name: /Actions for Weekly notes/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Open' }))
    await userEvent.click(await screen.findByRole('button', { name: /Edit/ }))

    const editor = screen.getByLabelText('Edit artifact markdown')
    await userEvent.clear(editor)
    await userEvent.type(editor, '# Edited title\n\nChanged content.')
    await userEvent.click(screen.getByRole('button', { name: /Save changes/ }))

    const downloadSpy = vi.mocked(downloadText)
    downloadSpy.mockClear()
    await userEvent.click(screen.getByRole('button', { name: /Download/ }))
    expect(downloadSpy).toHaveBeenCalledWith(
      expect.stringContaining('weekly-notes'),
      expect.stringContaining('# Edited title'),
    )

    // Close the viewer, rename the artifact.
    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Weekly notes' })).toBeNull(),
    )

    await userEvent.click(screen.getByRole('button', { name: /Actions for Weekly notes/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Rename' }))
    const renameField = screen.getByLabelText('Title')
    await userEvent.clear(renameField)
    await userEvent.type(renameField, 'Renamed notes')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Renamed notes')).toBeTruthy()
    expect(useLibraryStore.getState().artifacts[id]?.title).toBe('Renamed notes')

    // Delete with confirmation.
    await userEvent.click(screen.getByRole('button', { name: /Actions for Renamed notes/ }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete', hidden: false }))
    await waitFor(() => {
      expect(screen.queryByText('Renamed notes')).toBeNull()
      expect(useLibraryStore.getState().artifacts[id]).toBeUndefined()
    })
  })

  it('creates and deletes projects with honest task counts', async () => {
    useLibraryStore.getState().initialize()
    useWorkStore.getState().initialize()
    const projectId = useLibraryStore.getState().addProject({
      name: 'Apartment move',
      description: 'Everything about moving',
    })
    useWorkStore.getState().createTask({
      title: 'Compare movers',
      goal: '',
      deliverable: 'email-draft',
      projectId,
    })
    flushWorkPersistence()

    renderApp('/library')
    expect(await screen.findByText('Apartment move')).toBeTruthy()
    expect(screen.getByText(/1 task, 0 artifacts/)).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: /Delete project Apartment move/ }))
    await waitFor(() => expect(screen.queryByText('Apartment move')).toBeNull())
  })
})
