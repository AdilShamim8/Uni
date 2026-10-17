import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { App } from '@/app/App'

describe('scaffold smoke test', () => {
  it('renders the application placeholder', () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    )
    // Empty state shows the welcome composition; the sidebar carries the
    // Universe wordmark, so the top bar no longer duplicates it.
    expect(
      screen.getByRole('heading', { name: /where should we begin/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('Universe')).toBeInTheDocument()
  })
})
