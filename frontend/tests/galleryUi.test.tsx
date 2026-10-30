import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AgentsPage } from '@/features/agents/AgentsPage'
import { AGENT_GALLERY } from '@/features/agents/agentGallery'
import { useAgentsStore } from '@/state/agentsStore'

afterEach(() => {
  cleanup()
  useAgentsStore.setState({ agents: {} })
})

function renderAgentsDirectory(): void {
  render(
    <MemoryRouter initialEntries={['/agents']}>
      <Routes>
        <Route path="/agents/:agentId" element={<AgentsPage />} />
        <Route path="/agents" element={<AgentsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('community gallery browser', () => {
  it('shows every curated entry on the directory, even with no agents of your own', () => {
    renderAgentsDirectory()

    const gallery = screen.getByRole('region', { name: 'Community gallery' })
    for (const entry of AGENT_GALLERY) {
      expect(within(gallery).getByText(entry.agent.name)).toBeInTheDocument()
      expect(within(gallery).getByText(entry.agent.description)).toBeInTheDocument()
    }
    // The contribution pointer is part of the deal.
    expect(within(gallery).getByText(/pull request/i)).toBeInTheDocument()
  })

  it('one tap installs an entry and opens it, ready to chat', async () => {
    const user = userEvent.setup()
    renderAgentsDirectory()

    const gallery = screen.getByRole('region', { name: 'Community gallery' })
    await user.click(within(gallery).getAllByRole('button', { name: /Add to my agents/i })[0])

    // The first gallery entry (Research Librarian) was installed…
    const installed = Object.values(useAgentsStore.getState().agents)
    expect(installed.length).toBe(1)
    expect(installed[0].name).toBe(AGENT_GALLERY[0].agent.name)
    // …and the page navigated to the new agent's own view.
    expect(await screen.findAllByText(AGENT_GALLERY[0].agent.name)).not.toHaveLength(0)
  })

  it('marks entries already added instead of duplicating them', async () => {
    const user = userEvent.setup()
    renderAgentsDirectory()

    const gallery = screen.getByRole('region', { name: 'Community gallery' })
    const addButton = within(gallery).getAllByRole('button', { name: /Add to my agents/i })[0]
    await user.click(addButton)

    // Back to the directory: the first entry now shows the honest badge.
    await user.click(screen.getByRole('button', { name: 'Back to Agents' }))
    const back = await screen.findByRole('region', { name: 'Community gallery' })
    expect(within(back).getAllByText('Already added').length).toBe(1)
    expect(within(back).getAllByRole('button', { name: /Add to my agents/i }).length).toBe(
      AGENT_GALLERY.length - 1,
    )
  })

  it('renders below your own agents, never replacing them', () => {
    renderAgentsDirectory()
    // The directory still shows its own headings plus the gallery region.
    expect(screen.getByRole('region', { name: 'Community gallery' })).toBeInTheDocument()
    expect(screen.getByText('Your AI teammates')).toBeInTheDocument()
  })
})
