import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { Conversation, MessageNode } from '@/domain/types'
import { createNode } from '@/domain/conversationTree'
import { WINDOW_TAIL_ITEMS } from '@/domain/windowing'
import { MessageList } from '@/features/chat/MessageList'
import { ThreadView } from '@/features/conversation/ThreadView'
import type { ThreadEntry } from '@/features/conversation/threadModel'
import { resetStoreForTests } from '@/state/store'

/**
 * Milestone 08, F15: windowed transcript rendering. jsdom has no layout, so
 * clientHeight is 0 — the hook must fail open and render everything (the
 * first suite). With clientHeight mocked to a real viewport, the window
 * activates: the tail mounts, upward scroll materializes history block by
 * block, and a leading block fully above the viewport collapses.
 */

function buildConversation(messages: number): Conversation {
  const nodes: Record<string, MessageNode> = {}
  let parentId: string | null = null
  for (let i = 0; i < messages; i += 1) {
    const role = i % 2 === 0 ? 'user' : 'assistant'
    const node = createNode(role, `message ${i}`, parentId, i + 1)
    if (role === 'assistant') node.status = 'complete'
    nodes[node.id] = node
    parentId = node.id
  }
  return {
    id: 'window-conv',
    title: 'Window test',
    createdAt: 1,
    updatedAt: messages + 1,
    pinned: false,
    archived: false,
    temporary: false,
    nodes,
    activeLeafId: parentId,
  }
}

function buildEntries(count: number): ThreadEntry[] {
  const entries: ThreadEntry[] = []
  for (let i = 0; i < count; i += 1) {
    entries.push({
      kind: 'status_note',
      entryId: `note-${i}`,
      at: i + 1,
      tone: 'info',
      label: `note ${i}`,
    } as ThreadEntry)
  }
  return entries
}

describe('windowing fails open without layout measurements', () => {
  beforeEach(() => {
    resetStoreForTests()
  })
  afterEach(() => {
    cleanup()
    resetStoreForTests()
    vi.restoreAllMocks()
  })

  it('renders every message in jsdom even for a 300-message transcript', () => {
    const conversation = buildConversation(300)
    render(<MessageList conversation={conversation} />)
    const rendered = document.querySelectorAll('.message-in')
    expect(rendered.length).toBe(300)
    expect(screen.getByText('message 0')).toBeTruthy()
    expect(screen.getByText('message 299')).toBeTruthy()
  })

  it('renders every thread entry in jsdom even for 300 entries', () => {
    render(
      <ThreadView entries={buildEntries(300)} ariaLabel="Thread for test" />,
    )
    const rendered = document.querySelectorAll('[data-window-item]')
    expect(rendered.length).toBe(300)
    expect(screen.getByText('note 0')).toBeTruthy()
    expect(screen.getByText('note 299')).toBeTruthy()
  })
})

describe('windowing with a measurable viewport', () => {
  let clientHeightSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    resetStoreForTests()
    clientHeightSpy = vi
      .spyOn(Element.prototype, 'clientHeight', 'get')
      .mockReturnValue(800)
  })
  afterEach(() => {
    cleanup()
    resetStoreForTests()
    clientHeightSpy.mockRestore()
    vi.restoreAllMocks()
  })

  it('mounts only the tail window of a long conversation', () => {
    const conversation = buildConversation(300)
    render(<MessageList conversation={conversation} />)

    const rendered = document.querySelectorAll('.message-in')
    expect(rendered.length).toBe(WINDOW_TAIL_ITEMS)
    // The newest 120 messages render; the oldest 180 do not.
    expect(screen.queryByText('message 299')).toBeTruthy()
    expect(screen.queryByText('message 180')).toBeTruthy()
    expect(screen.queryByText('message 179')).toBeNull()
    expect(screen.queryByText('message 0')).toBeNull()
  })

  it('materializes one block of history on upward scroll', () => {
    const conversation = buildConversation(300)
    render(<MessageList conversation={conversation} />)

    const scroller = document.querySelector('[role="log"]') as HTMLElement
    scroller.scrollTop = 100 // inside the prefetch zone
    fireEvent.scroll(scroller)

    const rendered = document.querySelectorAll('.message-in')
    expect(rendered.length).toBe(WINDOW_TAIL_ITEMS + 40)
    expect(screen.queryByText('message 140')).toBeTruthy()
    expect(screen.queryByText('message 139')).toBeNull()
  })

  it('keeps extending until the first message, then stops', () => {
    const conversation = buildConversation(300)
    render(<MessageList conversation={conversation} />)

    const scroller = document.querySelector('[role="log"]') as HTMLElement
    for (let i = 0; i < 10; i += 1) {
      scroller.scrollTop = 0
      fireEvent.scroll(scroller)
    }

    const rendered = document.querySelectorAll('.message-in')
    expect(rendered.length).toBe(300)
    expect(screen.queryByText('message 0')).toBeTruthy()
  })

  it('collapses a leading block that sits above the viewport', () => {
    const conversation = buildConversation(600)
    render(<MessageList conversation={conversation} />)

    const scroller = document.querySelector('[role="log"]') as HTMLElement
    // Materialize the whole transcript first.
    for (let i = 0; i < 15; i += 1) {
      scroller.scrollTop = 0
      fireEvent.scroll(scroller)
    }
    expect(document.querySelectorAll('.message-in').length).toBe(600)

    // jsdom rectangles are all zero; mock element-aware geometry instead:
    // the container sits at the viewport top, and the leading block's last
    // item (index 39) sits ABOVE it (negative viewport space), exactly as a
    // scrolled-past item would in a real browser.
    const rectAbove = {
      top: -1100,
      bottom: -1000,
      left: 0,
      right: 0,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    } as DOMRect
    const rectContainer = {
      top: 0,
      bottom: 800,
      left: 0,
      right: 0,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    } as DOMRect
    const rectSpy = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockImplementation(function itemRect(this: Element) {
        if (this.getAttribute?.('data-window-item') === '39') return rectAbove
        return rectContainer
      })

    scroller.scrollTop = 20000 // far below the leading block
    fireEvent.scroll(scroller)

    expect(rectSpy).toHaveBeenCalled()
    const rendered = document.querySelectorAll('.message-in')
    // One leading block collapsed; the set is one block smaller.
    expect(rendered.length).toBe(560)
    expect(screen.queryByText('message 39')).toBeNull()
    expect(screen.queryByText('message 40')).toBeTruthy()
  })

  it('windows long threads through the same hook', () => {
    render(<ThreadView entries={buildEntries(300)} ariaLabel="Thread for test" />)

    const rendered = document.querySelectorAll('[data-window-item]')
    expect(rendered.length).toBe(WINDOW_TAIL_ITEMS)
    expect(screen.queryByText('note 299')).toBeTruthy()
    expect(screen.queryByText('note 179')).toBeNull()

    const scroller = document.querySelector('[role="log"]') as HTMLElement
    scroller.scrollTop = 50
    fireEvent.scroll(scroller)
    expect(document.querySelectorAll('[data-window-item]').length).toBe(
      WINDOW_TAIL_ITEMS + 40,
    )
    expect(screen.queryByText('note 140')).toBeTruthy()
  })

  it('still renders the newest items and correct variant data while windowed', () => {
    const conversation = buildConversation(200)
    render(<MessageList conversation={conversation} />)

    // The last message is an assistant message with its action row.
    const transcript = within(document.querySelector('[role="log"]') as HTMLElement)
    expect(transcript.getByText('message 199')).toBeTruthy()
    // Regenerate exists only on the last, complete assistant message.
    expect(
      transcript.getByRole('button', { name: 'Regenerate response' }),
    ).toBeTruthy()
  })
})
