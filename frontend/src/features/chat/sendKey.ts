import type { SendKeyMode } from '@/domain/types'

export interface SubmitKeyEvent {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  isComposing: boolean
}

/**
 * Decide whether an Enter keypress should submit the composer.
 * IME composition never submits — pressing Enter to confirm a candidate
 * must insert a newline instead of sending.
 */
export function shouldSubmit(event: SubmitKeyEvent, mode: SendKeyMode): boolean {
  if (event.key !== 'Enter') return false
  if (event.isComposing) return false
  if (mode === 'enter') {
    return !event.shiftKey && !event.ctrlKey && !event.metaKey
  }
  return event.ctrlKey || event.metaKey
}
