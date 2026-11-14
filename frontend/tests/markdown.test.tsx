import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Markdown } from '@/features/chat/Markdown'

/**
 * Markdown rendering: GFM structure, highlighted code with an honest
 * language label + copy button, safe outbound links, inert non-http
 * schemes, and no raw HTML.
 */
describe('Markdown', () => {
  afterEach(() => cleanup())

  it('renders paragraphs and GFM lists', () => {
    render(<Markdown content={'First paragraph.\n\n- one\n- two'} />)
    expect(screen.getByText('First paragraph.')).toBeInTheDocument()
    expect(screen.getByText('one')).toBeInTheDocument()
    expect(screen.getByText('two')).toBeInTheDocument()
  })

  it('renders a GFM table as a real table with headers and cells', () => {
    render(<Markdown content={'| Option | Cost |\n| --- | --- |\n| Pro | $0 |'} />)
    const table = screen.getByRole('table')
    expect(table).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Option' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Pro' })).toBeInTheDocument()
  })

  it('fenced code shows its language and a copy control', () => {
    render(<Markdown content={'```ts\nconst x = 1\n```'} />)
    expect(screen.getByText('ts')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument()
    // highlight.js splits tokens across spans — assert on the figure text.
    const figure = screen.getByText('ts').closest('figure')
    expect(figure?.textContent).toContain('const x = 1')
  })

  it('an unlabeled fence honestly says “code”', () => {
    render(<Markdown content={'```\nplain\n```'} />)
    expect(screen.getByText('code')).toBeInTheDocument()
  })

  it('http links open safely in a new tab', () => {
    render(<Markdown content={'See [the docs](https://example.test/guide).'} />)
    const link = screen.getByRole('link', { name: 'the docs' })
    expect(link).toHaveAttribute('href', 'https://example.test/guide')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer nofollow')
  })

  it('non-http schemes render inert — no anchor is emitted', () => {
    render(<Markdown content={'[click me](javascript:alert(1))'} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('click me')).toBeInTheDocument()
  })

  it('raw HTML in the content is stripped, not rendered', () => {
    render(<Markdown content={'Hello <script>window.pwned=1</script> world'} />)
    expect(document.querySelector('script')).toBeNull()
    expect((window as { pwned?: number }).pwned).toBeUndefined()
  })

  it('blockquotes and headings keep their semantics', () => {
    render(<Markdown content={'> A quoted line\n\n## Heading two'} />)
    expect(screen.getByText('A quoted line').closest('blockquote')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 2, name: 'Heading two' })).toBeInTheDocument()
  })
})

describe('Markdown copy button', () => {
  afterEach(() => cleanup())

  it('does not throw when the clipboard is unavailable (jsdom)', async () => {
    const user = userEvent.setup()
    render(<Markdown content={'```bash\nls -la\n```'} />)
    await user.click(screen.getByRole('button', { name: 'Copy code' }))
    // No crash; the button stays functional.
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument()
  })
})
