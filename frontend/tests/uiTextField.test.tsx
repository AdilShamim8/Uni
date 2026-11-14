import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TextArea, TextField } from '@/components/ui/TextField'

/** TextField/TextArea: the label must associate, the hint must describe. */
describe('TextField', () => {
  afterEach(() => cleanup())

  it('associates the label with the input so typing targets it', async () => {
    const user = userEvent.setup()
    render(<TextField label="Workspace name" />)
    const input = screen.getByLabelText('Workspace name')
    await user.type(input, 'Research desk')
    expect(input).toHaveValue('Research desk')
  })

  it('the hint is wired as the input’s accessible description', () => {
    render(<TextField label="API endpoint" hint="Include the /v1 base." />)
    const input = screen.getByLabelText('API endpoint')
    expect(input).toHaveAccessibleDescription('Include the /v1 base.')
  })

  it('without a hint there is no description reference', () => {
    render(<TextField label="Plain" />)
    expect(screen.getByLabelText('Plain').getAttribute('aria-describedby')).toBeNull()
  })
})

describe('TextArea', () => {
  afterEach(() => cleanup())

  it('associates the label and accepts multi-line input', async () => {
    const user = userEvent.setup()
    render(<TextArea label="Instructions" rows={3} />)
    const area = screen.getByLabelText('Instructions')
    await user.type(area, 'Line one.{enter}Line two.')
    expect(area).toHaveValue('Line one.\nLine two.')
  })

  it('the hint describes the textarea too', () => {
    render(<TextArea label="Instructions" hint="What the employee should always do." />)
    expect(screen.getByLabelText('Instructions')).toHaveAccessibleDescription(
      'What the employee should always do.',
    )
  })
})
