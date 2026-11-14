import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ReadinessStrip } from '@/features/settings/ReadinessStrip'
import type { ProviderReadiness } from '@/services/connection/providerConnection'

/**
 * The readiness strip renders the four N007 axes with what the check
 * actually PROVED — never one blended connected/error state.
 */
const UNKNOWN: ProviderReadiness = {
  reachability: 'unknown',
  catalog: 'unknown',
  credential: 'unknown',
  generation: 'unknown',
}

describe('ReadinessStrip', () => {
  afterEach(() => cleanup())

  it('renders one labelled list with the four axes', () => {
    render(<ReadinessStrip readiness={UNKNOWN} />)
    const list = screen.getByRole('list', { name: 'Connection readiness' })
    expect(list).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(4)
  })

  it('untested axes say so honestly', () => {
    render(<ReadinessStrip readiness={UNKNOWN} />)
    expect(screen.getByText('Reachability untested')).toBeInTheDocument()
    expect(screen.getByText('Model list untested')).toBeInTheDocument()
    expect(screen.getByText('Key unverified')).toBeInTheDocument()
    expect(screen.getByText('Generation untested')).toBeInTheDocument()
  })

  it('a keyless connection reports “No key needed” on the credential axis', () => {
    render(
      <ReadinessStrip
        readiness={{ ...UNKNOWN, reachability: 'ok', credential: 'not-required' }}
      />,
    )
    expect(screen.getByText('Endpoint reachable')).toBeInTheDocument()
    expect(screen.getByText('No key needed')).toBeInTheDocument()
  })

  it('a rejected key and a reachable endpoint stay independent axes', () => {
    render(
      <ReadinessStrip
        readiness={{ ...UNKNOWN, reachability: 'ok', credential: 'fail' }}
      />,
    )
    expect(screen.getByText('Endpoint reachable')).toBeInTheDocument()
    expect(screen.getByText('Key rejected')).toBeInTheDocument()
  })

  it('the catalog axis carries the discovered model count', () => {
    render(<ReadinessStrip readiness={{ ...UNKNOWN, catalog: 'ok' }} modelCount={12} />)
    expect(screen.getByText('Model list (12)')).toBeInTheDocument()
  })

  it('a failed generation is reported as its own axis, never hidden', () => {
    render(<ReadinessStrip readiness={{ ...UNKNOWN, generation: 'fail' }} />)
    expect(screen.getByText('Generation failed')).toBeInTheDocument()
  })
})
