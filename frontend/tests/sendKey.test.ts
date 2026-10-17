import { describe, expect, it } from 'vitest'
import { shouldSubmit, type SubmitKeyEvent } from '@/features/chat/sendKey'

function key(overrides: Partial<SubmitKeyEvent> = {}): SubmitKeyEvent {
  return {
    key: 'Enter',
    shiftKey: false,
    ctrlKey: false,
    metaKey: false,
    isComposing: false,
    ...overrides,
  }
}

describe('composer submit key handling', () => {
  it('submits on Enter in enter mode', () => {
    expect(shouldSubmit(key(), 'enter')).toBe(true)
  })

  it('does not submit on Shift+Enter (newline)', () => {
    expect(shouldSubmit(key({ shiftKey: true }), 'enter')).toBe(false)
  })

  it('never submits while IME composition is active', () => {
    expect(shouldSubmit(key({ isComposing: true }), 'enter')).toBe(false)
    expect(shouldSubmit(key({ isComposing: true }), 'ctrl-enter')).toBe(false)
  })

  it('uses Ctrl/Cmd+Enter in ctrl-enter mode', () => {
    expect(shouldSubmit(key({ ctrlKey: true }), 'ctrl-enter')).toBe(true)
    expect(shouldSubmit(key({ metaKey: true }), 'ctrl-enter')).toBe(true)
    expect(shouldSubmit(key(), 'ctrl-enter')).toBe(false)
  })

  it('ignores non-Enter keys entirely', () => {
    expect(shouldSubmit(key({ key: 'a' }), 'enter')).toBe(false)
    expect(shouldSubmit(key({ key: 'Escape' }), 'enter')).toBe(false)
  })
})
