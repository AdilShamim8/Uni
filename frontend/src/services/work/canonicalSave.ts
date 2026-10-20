import { useLibraryStore } from '@/state/libraryStore'
import { useWorkStore } from '@/state/workStore'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'
import { useAppStore } from '@/state/store'
import { activePath } from '@/domain/conversationTree'
import type { Artifact } from '@/domain/workspaceTypes'
import type { Conversation, MessageNode } from '@/domain/types'

/**
 * Canonical save operations (milestone 07, fixes F01/F02).
 *
 * ONE operation per source of truth, shared by every caller — the Work
 * Outputs panel and the Documents plugin adapter cannot drift apart again:
 *
 * - A Work report saves to exactly ONE Library artifact, linked back
 *   through `report.artifactId`; subsequent saves update that artifact.
 * - Provenance is preserved, never hard-coded: demo simulations stay
 *   `demo-simulation`, provider-generated reports stay
 *   `provider-generated` with their model snapshot.
 * - Re-saving unchanged content is a no-op (no duplicate documents, no
 *   meaningless version churn).
 * - A deleted linked artifact gets an explicit recreate path.
 * - Employee saves select the latest assistant reply on the ACTIVE
 *   branch — never an unseen sibling — and preserve its live/demo origin.
 */

export interface CanonicalSaveResult {
  artifactId: string
  /** A new artifact was created this call. */
  created: boolean
  /** The previously linked artifact was gone; a fresh one was re-linked. */
  recreated: boolean
  title: string
}

export class CanonicalSaveError extends Error {}

function reportKind(template: 'research' | 'data' | 'email' | 'draft'): Artifact['kind'] {
  if (template === 'email') return 'email'
  if (template === 'data') return 'data'
  if (template === 'draft') return 'document'
  return 'report'
}

/**
 * Save (or update) the canonical Library artifact for a Work task's
 * current report. Throws `CanonicalSaveError` with a user-presentable
 * message when there is nothing to save.
 */
export function saveTaskReportToLibrary(taskId: string): CanonicalSaveResult {
  const task = useWorkStore.getState().tasks[taskId]
  if (!task) throw new CanonicalSaveError('That task no longer exists.')
  const report = task.report
  if (!report || report.markdown.trim().length === 0) {
    throw new CanonicalSaveError('This task has no output to save yet — run it first.')
  }

  const library = useLibraryStore.getState()
  const title = task.title
  const kind = reportKind(report.template)
  const provenance: Artifact['provenance'] =
    report.provenance === 'provider-generated' ? 'provider-generated' : 'demo-simulation'
  const generatedBy = report.provenance === 'provider-generated' ? report.generatedBy : null

  const linkedId = report.artifactId
  if (linkedId) {
    const linked = library.artifacts[linkedId]
    if (linked) {
      // Update in place — and only when something actually changed, so
      // repeated saves never churn `updatedAt` or create noise.
      if (linked.title !== title) library.renameArtifact(linkedId, title)
      if (linked.markdown !== report.markdown) library.updateArtifact(linkedId, report.markdown)
      useWorkspaceUiStore.getState().openInspector({ tab: 'canvas', artifactId: linkedId })
      return { artifactId: linkedId, created: false, recreated: false, title }
    }
    // Linked artifact was deleted: recreate explicitly and re-link, so the
    // task and the Library agree again instead of silently duplicating.
  }

  const artifactId = library.addArtifact({
    title,
    kind,
    markdown: report.markdown,
    provenance,
    generatedBy,
    taskId,
  })
  useWorkStore.getState().attachArtifactToReport(taskId, artifactId)
  useWorkspaceUiStore.getState().openInspector({ tab: 'canvas', artifactId })
  return { artifactId, created: true, recreated: !!linkedId, title }
}

/**
 * Derive the honest origin of a chat reply from its recorded status
 * prefix. Live replies are prefixed "Live reply from <provider label>" by
 * the live adapter; everything else was produced by the local demo
 * adapter.
 */
function originOfReply(node: MessageNode): {
  provenance: Artifact['provenance']
  providerLabel: string | null
} {
  const prefix = node.statusPrefix?.trim() ?? ''
  if (prefix.startsWith('Live reply from ')) {
    return { provenance: 'provider-generated', providerLabel: prefix.slice('Live reply from '.length) }
  }
  return { provenance: 'demo-simulation', providerLabel: null }
}

/**
 * Save the latest assistant reply on the ACTIVE branch of an employee
 * conversation. Never selects a sibling from an unseen branch, and keeps
 * the reply's live/demo origin.
 */
export function saveActiveReplyToLibrary(conversationId: string): CanonicalSaveResult {
  const conversation: Conversation | undefined =
    useAppStore.getState().conversations[conversationId]
  if (!conversation) throw new CanonicalSaveError('This conversation no longer exists.')

  // Active branch only — what the user is actually looking at.
  const assistant = activePath(conversation)
    .filter(
      (node) =>
        node.role === 'assistant' &&
        node.content.trim().length > 0 &&
        node.status === 'complete',
    )
    .pop()
  if (!assistant) {
    throw new CanonicalSaveError('This thread has no finished assistant output to save yet.')
  }

  const title =
    assistant.content.trim().split('\n')[0].replace(/^#+\s*/, '').slice(0, 60) || 'Saved reply'
  const { provenance, providerLabel } = originOfReply(assistant)

  const library = useLibraryStore.getState()
  // One artifact per saved reply: if this exact message was already saved,
  // update that artifact instead of creating a twin.
  const existing = Object.values(library.artifacts).find(
    (artifact) => artifact.source?.messageId === assistant.id,
  )
  if (existing) {
    if (existing.title !== title) library.renameArtifact(existing.id, title)
    if (existing.markdown !== assistant.content) {
      library.updateArtifact(existing.id, assistant.content)
    }
    useWorkspaceUiStore.getState().openInspector({ tab: 'canvas', artifactId: existing.id })
    return { artifactId: existing.id, created: false, recreated: false, title }
  }

  const artifactId = library.addArtifact({
    title,
    kind: 'document',
    markdown: assistant.content,
    provenance,
    generatedBy: providerLabel
      ? {
          providerId: '',
          modelId: '',
          providerLabel,
          modelLabel: providerLabel,
        }
      : null,
    source: { conversationId, messageId: assistant.id, taskId: null },
  })
  useWorkspaceUiStore.getState().openInspector({ tab: 'canvas', artifactId })
  return { artifactId, created: true, recreated: false, title }
}
