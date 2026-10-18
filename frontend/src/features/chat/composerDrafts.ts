import type { ToolId } from '@/domain/types'
import type { PendingAttachment } from './attachments'

/**
 * Per-conversation composer draft storage (module scope, in-memory only).
 *
 * Drafts typed in one conversation must not leak into another, must
 * survive switching conversations mid-thought and remounts of the composer
 * (the empty-state ↔ conversation transition repositions it), and must
 * never be cleared by the completion of a turn that was submitted earlier
 * (audit D2).
 */

export interface DraftSnapshot {
  text: string
  tools: ToolId[]
  pending: PendingAttachment[]
}

const drafts = new Map<string, DraftSnapshot>()

/** Keep the draft map bounded; evicted entries release their object URLs. */
const MAX_DRAFTS = 24

export function loadDraft(key: string): DraftSnapshot {
  return drafts.get(key) ?? { text: '', tools: [], pending: [] }
}

export function saveDraft(key: string, draft: DraftSnapshot): void {
  drafts.set(key, draft)
  pruneDrafts()
}

export function pruneDrafts(): void {
  while (drafts.size > MAX_DRAFTS) {
    const oldestKey = drafts.keys().next().value as string
    const evicted = drafts.get(oldestKey)
    drafts.delete(oldestKey)
    for (const attachment of evicted?.pending ?? []) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
    }
  }
}

/* Preserved across the empty-state ↔ conversation transition, where the
 * composer remounts in a different position: if the textarea held focus
 * right before the remount, the new instance takes it back. */
let lastUnmountWasFocused = false

export function markUnmountFocused(value: boolean): void {
  lastUnmountWasFocused = value
}

export function takeUnmountWasFocused(): boolean {
  const value = lastUnmountWasFocused
  lastUnmountWasFocused = false
  return value
}

/** Test-only: drop every in-memory draft so a fresh run starts clean. */
export function resetComposerDraftsForTests(): void {
  for (const [, draft] of drafts) {
    for (const attachment of draft.pending) {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
    }
  }
  drafts.clear()
  lastUnmountWasFocused = false
}
