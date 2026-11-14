import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Conversation } from '@/domain/types'
import { ConversationListItem } from '@/features/chat/ConversationListItem'
import { resetStoreForTests } from '@/state/store'

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'cv_1',
    title: 'Launch review',
    createdAt: 1,
    updatedAt: 2,
    pinned: false,
    archived: false,
    temporary: false,
    nodes: {},
    activeLeafId: null,
    ...overrides,
  }
}

/** One conversation row: selection state, honest badges, row actions. */
describe('ConversationListItem', () => {
  afterEach(() => {
    cleanup()
    resetStoreForTests()
  })

  it('selecting the row reports its conversation id', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    render(<ConversationListItem conversation={conversation()} active={false} onSelect={onSelect} />)
    await user.click(screen.getByRole('button', { name: /^launch review$/i }))
    expect(onSelect).toHaveBeenCalledWith('cv_1')
  })

  it('the active row marks itself as the current page', () => {
    const { rerender } = render(
      <ConversationListItem conversation={conversation()} active={false} onSelect={() => undefined} />,
    )
    expect(screen.getByRole('button', { name: /^launch review$/i }).getAttribute('aria-current')).toBeNull()
    rerender(
      <ConversationListItem conversation={conversation()} active onSelect={() => undefined} />,
    )
    expect(screen.getByRole('button', { name: /^launch review$/i })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })

  it('a pinned conversation shows the pin; a temporary one shows the honest badge', () => {
    render(
      <>
        <ConversationListItem
          conversation={conversation({ id: 'cv_pin', pinned: true })}
          active={false}
          onSelect={() => undefined}
        />
        <ConversationListItem
          conversation={conversation({ id: 'cv_temp', temporary: true })}
          active={false}
          onSelect={() => undefined}
        />
      </>,
    )
    expect(screen.getByLabelText('Pinned')).toBeInTheDocument()
    expect(screen.getByText('Temp')).toBeInTheDocument()
  })

  it('the row menu offers the honest action set', async () => {
    const user = userEvent.setup()
    render(<ConversationListItem conversation={conversation()} active={false} onSelect={() => undefined} />)
    await user.click(
      screen.getByRole('button', { name: /launch review — conversation actions/i }),
    )
    const menu = screen.getByRole('menu')
    for (const action of ['Rename', 'Pin', 'Archive', 'Export as Markdown', 'Delete']) {
      expect(within(menu).getByText(new RegExp(action, 'i'))).toBeInTheDocument()
    }
  })
})
