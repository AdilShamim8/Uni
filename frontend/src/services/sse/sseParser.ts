/**
 * Standards-aware SSE frame parsing shared by the browser BYOK adapter
 * and the server-run event client. One parser so both surfaces handle
 * the same wire format identically (audit F06):
 * - LF and CRLF framing both delimit events
 * - multi-line `data:` fields join with newlines (the SSE spec)
 * - `event:` names, comment/keep-alive lines, and trailing frames
 *   without a final blank line are all handled
 */

/** One parsed SSE event: joined multiline data + optional event name. */
export interface SseEvent {
  event?: string
  data: string
}

export function parseSseBlock(block: string): SseEvent | null {
  const dataLines: string[] = []
  let eventName: string | undefined
  for (const rawLine of block.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
    if (line.startsWith(':')) continue // comment / keep-alive
    if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
    else if (line.startsWith('event:')) eventName = line.slice(6).replace(/^ /, '').trim()
  }
  if (dataLines.length === 0) return null
  // The SSE spec joins multiple data lines with newlines.
  return { event: eventName, data: dataLines.join('\n') }
}

export function findEventBoundary(buffer: string): { end: number } | null {
  const match = buffer.match(/\r?\n\r?\n/)
  if (!match || match.index === undefined) return null
  return { end: match.index + match[0].length }
}
