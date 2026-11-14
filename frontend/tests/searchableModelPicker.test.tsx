import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  MODEL_PICKER_THRESHOLD,
  SearchableModelPicker,
} from '@/features/settings/SearchableModelPicker'

/**
 * The searchable model picker (N011): filters a large catalog, shows a
 * bounded slice, hands off to manual entry, and never mutates the
 * catalog — selection is by exact id.
 */
const CATALOG = Array.from({ length: 20 }, (_, i) => `openai/gpt-${i}-preview`)

describe('SearchableModelPicker', () => {
  afterEach(() => cleanup())

  function setup(models: string[] = CATALOG) {
    const onSelect = vi.fn()
    const onManualEntry = vi.fn()
    render(
      <SearchableModelPicker
        models={models}
        value={null}
        onSelect={onSelect}
        onManualEntry={onManualEntry}
      />,
    )
    return { onSelect, onManualEntry }
  }

  it('starts collapsed and expands into a listbox of the catalog', async () => {
    const user = userEvent.setup()
    setup()
    const trigger = screen.getByRole('button', { name: 'Server chat model' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    const listbox = screen.getByRole('listbox', { name: 'Server chat models' })
    expect(within(listbox).getAllByRole('option')).toHaveLength(20)
  })

  it('typing filters the catalog live', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Server chat model' }))
    await user.type(screen.getByLabelText('Filter models'), 'gpt-1')
    const listbox = screen.getByRole('listbox', { name: 'Server chat models' })
    const options = within(listbox).getAllByRole('option')
    // gpt-1 and gpt-10..gpt-19 all contain the substring "gpt-1".
    expect(options).toHaveLength(11)
    for (const option of options) {
      expect(option.textContent).toContain('gpt-1')
    }
  })

  it('choosing an option reports the exact id and collapses', async () => {
    const user = userEvent.setup()
    const { onSelect } = setup()
    await user.click(screen.getByRole('button', { name: 'Server chat model' }))
    await user.click(screen.getByRole('option', { name: 'openai/gpt-7-preview' }))
    expect(onSelect).toHaveBeenCalledWith('openai/gpt-7-preview')
    expect(screen.getByRole('button', { name: 'Server chat model' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('Enter commits the first shown match; Escape closes without choosing', async () => {
    const user = userEvent.setup()
    const { onSelect } = setup()
    await user.click(screen.getByRole('button', { name: 'Server chat model' }))
    const input = screen.getByLabelText('Filter models')
    await user.type(input, 'gpt-12')
    await user.keyboard('{Enter}')
    expect(onSelect).toHaveBeenCalledWith('openai/gpt-12-preview')

    cleanup()
    const { onSelect: onSelect2 } = setup()
    await user.click(screen.getByRole('button', { name: 'Server chat model' }))
    await user.type(screen.getByLabelText('Filter models'), 'zzz')
    await user.keyboard('{Escape}')
    expect(onSelect2).not.toHaveBeenCalled()
  })

  it('a query with no matches gets the honest empty note', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByRole('button', { name: 'Server chat model' }))
    await user.type(screen.getByLabelText('Filter models'), 'claude')
    expect(screen.getByText(/No model matches “claude”/i)).toBeInTheDocument()
  })

  it('the shown list is bounded and says how many matches remain hidden', async () => {
    const user = userEvent.setup()
    const big = Array.from({ length: 45 }, (_, i) => `model-${i}`)
    setup(big)
    await user.click(screen.getByRole('button', { name: 'Server chat model' }))
    expect(screen.getAllByRole('option')).toHaveLength(30)
    expect(screen.getByText(/\+15 more matches/i)).toBeInTheDocument()
  })

  it('the manual-entry handoff fires and closes the panel', async () => {
    const user = userEvent.setup()
    const { onManualEntry } = setup()
    await user.click(screen.getByRole('button', { name: 'Server chat model' }))
    await user.click(screen.getByRole('button', { name: /Type a model id/i }))
    expect(onManualEntry).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Server chat model' })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('the searchable threshold is 12 — the picker exists for exactly that reason', () => {
    expect(MODEL_PICKER_THRESHOLD).toBe(12)
  })
})
