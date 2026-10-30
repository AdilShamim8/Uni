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
    `_Exported from Uni (local prototype) on ${new Date().toLocaleString()}_`,
    '',
  ]
  for (const node of path) {
    lines.push(node.role === 'user' ? '## You' : '## Uni (demo)')
    lines.push('')
    lines.push(node.content.trim() || '_(empty)_')
    lines.push('')
  }
  return lines.join('\n')
}

/** Escape text for safe embedding in a shared HTML page. */
function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Render the active thread of a conversation as a standalone, shareable
 * HTML page — one file anyone can open in a browser, with no scripts,
 * no network calls, and no tracking; just inline CSS and the words.
 * Mirrors the Markdown export's honesty note (local prototype).
 */
export function conversationToShareHtml(conversation: Conversation): string {
  const path = activePath(conversation)
  const title = escapeHtml(conversation.title)
  const exportedAt = escapeHtml(new Date().toLocaleString())

  const turns = path
    .map((node) => {
      const role = node.role === 'user' ? 'You' : 'Uni'
      const content = escapeHtml(node.content.trim() || '(empty)')
      const status =
        node.statusPrefix && node.statusPrefix.trim()
          ? `<p class="status">${escapeHtml(node.statusPrefix.trim())}</p>`
          : ''
      return `<div class="turn ${node.role === 'user' ? 'user' : 'assistant'}"><p class="role">${role}</p>${status}<p class="body">${content}</p></div>`
    })
    .join('\n      ')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #f7f8fa; color: #15171c;
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  main { max-width: 46rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
  header h1 { font-size: 1.6rem; letter-spacing: -0.02em; margin: 0 0 0.3rem; }
  header p { color: #6b7080; margin: 0 0 2rem; font-size: 0.875rem; }
  article { display: flex; flex-direction: column; gap: 1.25rem; }
  .turn { background: #ffffff; border: 1px solid #e6e8ee; border-radius: 14px; padding: 1rem 1.25rem; }
  .turn .role { font-size: 0.7rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.06em; color: #8a8fa3; margin: 0 0 0.4rem; }
  .turn.user { border-left: 3px solid #c9c4ea; }
  .turn.assistant { border-left: 3px solid #6555d9; }
  .turn .status { margin: 0 0 0.5rem; font-size: 0.78rem; color: #8a8fa3; font-style: italic; }
  .turn .body { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  footer { margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid #e6e8ee;
    color: #8a8fa3; font-size: 0.8rem; text-align: center; }
  footer a { color: #6555d9; }
</style>
</head>
<body>
<main>
  <header>
    <h1>${title}</h1>
    <p>A conversation exported from Uni (local prototype) · ${exportedAt}</p>
  </header>
  <article>
      ${turns}
  </article>
  <footer>
    <p>Exported from <a href="https://github.com/AdilShamim8/Uni" rel="noopener noreferrer">Uni</a> —
    the free, open-source AI workspace. Bring your own key, keep your own data.</p>
  </footer>
</main>
</body>
</html>
`
}

export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return slug || 'conversation'
}
