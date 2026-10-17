import type { Conversation } from '@/domain/types'
import { activePath } from '@/domain/conversationTree'

/** Trigger a local file download (no network involvement). */
export function downloadText(
  filename: string,
  content: string,
  mediaType = 'text/markdown',
): void {
  const blob = new Blob([content], { type: `${mediaType};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Render the active thread of a conversation as Markdown. */
export function conversationToMarkdown(conversation: Conversation): string {
  const path = activePath(conversation)
  const lines: string[] = [
    `# ${conversation.title}`,
    '',
    `_Exported from Universe (local prototype) on ${new Date().toLocaleString()}_`,
    '',
  ]
  for (const node of path) {
    lines.push(node.role === 'user' ? '## You' : '## Universe (demo)')
    lines.push('')
    lines.push(node.content.trim() || '_(empty)_')
    lines.push('')
  }
  return lines.join('\n')
}

export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'conversation'
}
