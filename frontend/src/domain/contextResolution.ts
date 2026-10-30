import type { ContextItem } from '@/state/contextStore'
import { CONTEXT_ITEM_LIMIT, CONTEXT_TOTAL_LIMIT } from '@/state/contextStore'
import type { Artifact, Project } from '@/domain/workspaceTypes'

/**
 * Context resolution — turning selected context items into the exact
 * plain-text block a live send would include. Shared by the inspector
 * preview (what WILL be included) and the send path (what IS included),
 * so the two can never disagree.
 *
 * Knowledge-base items are the one deliberate exception: their content
 * is retrieved per message at send time, so resolution here only reports
 * availability (documents exist?) — the block itself is built by the send
 * path from the message text, and the inspector says so explicitly.
 */

export interface ResolvedContextItem {
  item: ContextItem
  /** False when the referenced record was deleted — never a raw orphan. */
  available: boolean
  reason: string | null
  content: string
  truncated: boolean
  size: number
}

export function resolveContextItems(
  items: ContextItem[],
  artifacts: Record<string, Artifact>,
  projects: Record<string, Project>,
  /** Documents currently in the knowledge base (knowledge items only). */
  knowledgeDocCount = 0,
): ResolvedContextItem[] {
  return items.map((item) => {
    if (item.kind === 'knowledge') {
      return {
        item,
        available: knowledgeDocCount > 0,
        reason: knowledgeDocCount > 0 ? null : 'The knowledge base is empty',
        content: '',
        truncated: false,
        size: 0,
      }
    }
    if (item.kind === 'note') {
      const content = item.content ?? ''
      return {
        item,
        available: content.trim().length > 0,
        reason: content.trim().length > 0 ? null : 'This note is empty',
        content,
        truncated: false,
        size: content.length,
      }
    }
    if (item.kind === 'artifact') {
      const artifact = item.refId ? artifacts[item.refId] : undefined
      if (!artifact) {
        return {
          item,
          available: false,
          reason: 'This document was deleted',
          content: '',
          truncated: false,
          size: 0,
        }
      }
      const full = artifact.workingDraft ?? artifact.markdown
      const truncated = full.length > CONTEXT_ITEM_LIMIT
      const content = truncated ? full.slice(0, CONTEXT_ITEM_LIMIT) : full
      return {
        item,
        available: true,
        reason: null,
        content,
        truncated,
        size: content.length,
      }
    }
    // project
    const project = item.refId ? projects[item.refId] : undefined
    if (!project) {
      return {
        item,
        available: false,
        reason: 'This project was deleted',
        content: '',
        truncated: false,
        size: 0,
      }
    }
    // A project contributes its description. Project membership lists are
    // metadata, not understanding — they are labeled as links, not content.
    const description = project.description.trim()
    return {
      item,
      available: description.length > 0,
      reason: description.length > 0 ? null : 'This project has no description to include',
      content: description,
      truncated: false,
      size: description.length,
    }
  })
}

/** The plain-text block included with a live send ("" when nothing). */
export function buildContextBlock(resolved: ResolvedContextItem[]): string {
  const usable = resolved.filter((entry) => entry.available && entry.content.trim().length > 0)
  if (usable.length === 0) return ''

  let budget = CONTEXT_TOTAL_LIMIT
  const sections: string[] = []
  for (const entry of usable) {
    const header =
      entry.item.kind === 'artifact'
        ? `Document: ${entry.item.title}`
        : entry.item.kind === 'project'
          ? `Project: ${entry.item.title}`
          : `Note: ${entry.item.title}`
    const note = entry.truncated ? ' (truncated to the size limit)' : ''
    const slice = entry.content.slice(0, Math.max(0, budget))
    budget -= slice.length
    sections.push(`### ${header}${note}\n\n${slice}`)
    if (budget <= 0) break
  }
  return sections.join('\n\n---\n\n')
}

export function totalContextSize(resolved: ResolvedContextItem[]): number {
  return resolved.reduce((sum, entry) => sum + entry.size, 0)
}
