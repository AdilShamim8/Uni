import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { AgentsPage } from '@/features/agents/AgentsPage'
import { AGENT_TEMPLATES } from '@/features/agents/agentTemplates'

afterEach(cleanup)

function renderNewAgent(): void {
  render(
    <MemoryRouter initialEntries={['/agents/new']}>
      <Routes>
        <Route path="/agents/:agentId" element={<AgentsPage />} />
        <Route path="/agents" element={<AgentsPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('agent templates', () => {
  it('every template carries a complete, honest profile', () => {
    expect(AGENT_TEMPLATES.length).toBeGreaterThanOrEqual(8)
    for (const template of AGENT_TEMPLATES) {
      expect(template.id).toMatch(/^template-[a-z-]+$/)
      expect(template.name.trim()).not.toBe('')
      expect(template.description.trim()).not.toBe('')
      // Instructions are the system prompt — they must be substantial.
      expect(template.instructions.length).toBeGreaterThan(120)
      expect(['personal', 'specialist']).toContain(template.category)
      expect(template.starters.length).toBeGreaterThan(0)
      expect(template.starters.length).toBeLessThanOrEqual(6)
    }
  })

  it('template ids are unique', () => {
    const ids = AGENT_TEMPLATES.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('the builder shows one-tap templates for a new agent', () => {
    renderNewAgent()

    expect(screen.getByText('Start from a template')).toBeInTheDocument()
    for (const template of AGENT_TEMPLATES) {
      expect(screen.getByRole('button', { name: new RegExp(template.name) })).toBeEnabled()
    }
  })

  it('one tap fills the form with the template contents', async () => {
    const user = userEvent.setup()
    renderNewAgent()

    const template = AGENT_TEMPLATES[0]
    await user.click(screen.getByRole('button', { name: new RegExp(template.name) }))

    // The picked chip reflects selection…
    expect(
      screen.getByRole('button', { name: new RegExp(template.name) }),
    ).toHaveAttribute('aria-pressed', 'true')
    // …and the form now carries the template values.
    expect(screen.getByLabelText('Name')).toHaveValue(template.name)
    expect(screen.getByLabelText('Description')).toHaveValue(template.description)
    expect(screen.getByLabelText('Instructions')).toHaveValue(template.instructions)
    expect(screen.getByLabelText('Example starters (one per line)')).toHaveValue(
      template.starters.join('\n'),
    )
  })

  it('switching templates replaces the form contents', async () => {
    const user = userEvent.setup()
    renderNewAgent()

    const [first, second] = AGENT_TEMPLATES
    await user.click(screen.getByRole('button', { name: new RegExp(first.name) }))
    await user.click(screen.getByRole('button', { name: new RegExp(second.name) }))

    expect(screen.getByLabelText('Name')).toHaveValue(second.name)
    expect(
      screen.getByRole('button', { name: new RegExp(second.name) }),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByRole('button', { name: new RegExp(first.name) }),
    ).toHaveAttribute('aria-pressed', 'false')
  })
})
