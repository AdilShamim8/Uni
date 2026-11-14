import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { SettingsGroup, SettingsRow } from '@/components/ui/SettingsGroup'

/** SettingsGroup/Row: the iOS-style inset grouped list. */
describe('SettingsGroup', () => {
  afterEach(() => cleanup())

  it('a titled group is a labelled region', () => {
    render(
      <SettingsGroup title="Connection">
        <SettingsRow label="Endpoint" />
      </SettingsGroup>,
    )
    expect(screen.getByRole('region', { name: 'Connection' })).toBeInTheDocument()
  })

  it('an untitled group is transparent to screen readers (no empty region)', () => {
    render(
      <SettingsGroup>
        <SettingsRow label="Endpoint" />
      </SettingsGroup>,
    )
    expect(screen.queryByRole('region')).toBeNull()
  })

  it('the footer renders under the card as quiet help text', () => {
    render(
      <SettingsGroup title="Appearance" footer="Theme follows the system by default.">
        <SettingsRow label="Theme" />
      </SettingsGroup>,
    )
    expect(screen.getByText('Theme follows the system by default.')).toBeInTheDocument()
  })
})

describe('SettingsRow', () => {
  afterEach(() => cleanup())

  it('an inline row puts the control beside the label', () => {
    render(
      <SettingsGroup>
        <SettingsRow label="Reduce motion" description="Fewer animated transitions.">
          <span>On</span>
        </SettingsRow>
      </SettingsGroup>,
    )
    expect(screen.getByText('Reduce motion')).toBeInTheDocument()
    expect(screen.getByText('Fewer animated transitions.')).toBeInTheDocument()
    expect(screen.getByText('On')).toBeInTheDocument()
  })

  it('a block row stacks the control under the label', () => {
    const { container } = render(
      <SettingsGroup>
        <SettingsRow label="Default model" layout="block">
          <input aria-label="Model id" />
        </SettingsRow>
      </SettingsGroup>,
    )
    expect(container.textContent).toContain('Default model')
    expect(screen.getByLabelText('Model id')).toBeInTheDocument()
  })
})
