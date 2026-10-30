import { describe, expect, it } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useKnowledgeStore } from '@/state/knowledgeStore'
import { flushKnowledgePersistence } from '@/state/knowledgeStore'
import { renderApp, setupAppTest } from './helpers'

setupAppTest()

describe('knowledge base — Library section', () => {
  it('shows an honest empty state and opens the add dialog from the Library page', async () => {
    renderApp('/library')

    expect(await screen.findByRole('heading', { name: 'Knowledge base' })).toBeInTheDocument()
    expect(screen.getByText('No knowledge yet')).toBeInTheDocument()
    expect(
      screen.getByText(/local keyword search, cited excerpts/i),
    ).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Add knowledge' }))
    expect(await screen.findByRole('dialog', { name: 'Add knowledge' })).toBeInTheDocument()
    expect(screen.getByText(/up to 400,000 characters per document/i)).toBeInTheDocument()
  })

  it('adds pasted text, lists the document, and retrieval tester finds it', async () => {
    renderApp('/library')
    await screen.findByRole('heading', { name: 'Knowledge base' })

    await userEvent.click(screen.getByRole('button', { name: 'Add knowledge' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add knowledge' })
    await userEvent.type(within(dialog).getByLabelText('Title (optional — defaults to the file name or first heading)'), 'Onboarding')
    await userEvent.type(within(dialog).getByLabelText('Text'), '# Setup\n\nInstall the CLI and run uni init to bootstrap a workspace.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to knowledge base' }))

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add knowledge' })).toBeNull(),
    )

    // The document appears with honest metadata.
    const row = (await screen.findByText('Onboarding')).closest('li')
    expect(row).not.toBeNull()
    expect(within(row!).getByText(/Pasted text/)).toBeInTheDocument()
    expect(within(row!).getByText(/1 chunk/)).toBeInTheDocument()

    // The retrieval tester finds the content with the same search chats use.
    const tester = screen.getByLabelText('Test knowledge retrieval')
    await userEvent.type(tester, 'install the CLI')
    expect(await screen.findByText('Onboarding — Setup')).toBeInTheDocument()
    expect(screen.getByText(/Install the CLI/)).toBeInTheDocument()
    expect(screen.getByText(/Top 1 of at most 3 shown/)).toBeInTheDocument()
  })

  it('shows an honest no-match message when the retrieval tester finds nothing', async () => {
    useKnowledgeStore.getState().initialize()
    useKnowledgeStore.getState().addDocument({
      title: 'Recipes',
      text: '# Pasta\n\nBoil water and add salt.',
      source: 'paste',
    })
    renderApp('/library')
    await screen.findByText('Recipes')

    await userEvent.type(screen.getByLabelText('Test knowledge retrieval'), 'quantum llama')
    expect(
      await screen.findByText(/No matches — retrieval is keyword-based/),
    ).toBeInTheDocument()
  })

  it('rejects non-text files with an honest error and keeps the dialog open', async () => {
    renderApp('/library')
    await screen.findByRole('heading', { name: 'Knowledge base' })

    await userEvent.click(screen.getByRole('button', { name: 'Add knowledge' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add knowledge' })

    const file = new File(['binary-ish'], 'report.pdf', { type: 'application/pdf' })
    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toBeNull()
    // userEvent.upload honors the input's accept filter, but a real user can
    // still override the picker — fireEvent simulates exactly that path.
    fireEvent.change(input, { target: { files: [file] } })

    const alert = await within(dialog).findByRole('alert')
    expect(alert.textContent).toContain('report.pdf')
    expect(alert.textContent).toContain('not a plain-text file')
    expect(useKnowledgeStore.getState().documentCount()).toBe(0)
  })

  it('loads a .md file into the text area, defaults the title, and adds it', async () => {
    renderApp('/library')
    await screen.findByRole('heading', { name: 'Knowledge base' })

    await userEvent.click(screen.getByRole('button', { name: 'Add knowledge' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add knowledge' })

    const file = new File(['# Handbook\n\nEscalate incidents through PagerDuty.'], 'team-handbook.md', {
      type: 'text/markdown',
    })
    const input = dialog.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toBeNull()
    await userEvent.upload(input, file)

    await waitFor(() =>
      expect(within(dialog).getByDisplayValue('team-handbook')).toBeInTheDocument(),
    )
    expect(screen.getByText(/loaded from team-handbook\.md/)).toBeInTheDocument()

    await userEvent.click(within(dialog).getByRole('button', { name: 'Add to knowledge base' }))
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Add knowledge' })).toBeNull(),
    )

    const row = (await screen.findByText('team-handbook')).closest('li')
    expect(row).not.toBeNull()
    expect(within(row!).getByText(/team-handbook\.md/)).toBeInTheDocument()
    expect(useKnowledgeStore.getState().documentCount()).toBe(1)
  })

  it('deletes a document after confirmation', async () => {
    useKnowledgeStore.getState().initialize()
    useKnowledgeStore.getState().addDocument({
      title: 'Old doc',
      text: '# H\n\nsome content',
      source: 'paste',
    })
    renderApp('/library')
    await screen.findByText('Old doc')

    await userEvent.click(screen.getByRole('button', { name: 'Delete knowledge document Old doc' }))
    const confirm = await screen.findByRole('dialog', { name: 'Delete knowledge document?' })
    expect(within(confirm).getByText(/Old doc/)).toBeInTheDocument()
    await userEvent.click(within(confirm).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByText('Old doc')).toBeNull())
    expect(useKnowledgeStore.getState().documentCount()).toBe(0)
  })

  it('documents survive a reload through their own storage slice', async () => {
    useKnowledgeStore.getState().initialize()
    useKnowledgeStore.getState().addDocument({
      title: 'Durable',
      text: '# Section\n\npersistence across reloads is real',
      source: 'paste',
    })
    flushKnowledgePersistence()

    reloadForTestsLibrary()

    await waitFor(() => {
      useKnowledgeStore.getState().initialize()
      expect(useKnowledgeStore.getState().documentCount()).toBe(1)
    })
    renderApp('/library')
    expect(await screen.findByText('Durable')).toBeInTheDocument()
  })
})

/** Reload helper scoped to this file: keep storage, rebuild knowledge state. */
function reloadForTestsLibrary(): void {
  useKnowledgeStore.setState({
    hydrated: false,
    documents: {},
    chunks: {},
    lastSaveOk: null,
    lastSavedAt: null,
  })
}
