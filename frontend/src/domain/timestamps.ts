import type { MessageNode } from '@/domain/types'

/**
 * iOS-Messages-style timestamps: a quiet, centered pill between messages
 * whenever the conversation pauses long enough for one to help.
 *
 * The first message of a transcript always gets one, and a new one appears
 * after a gap of TIMESTAMP_GAP_MS between consecutive messages. Times are
 * formatted the way the platform formats them — "3:14 PM" today,
 * "Yesterday" / weekday names inside the week, then explicit dates.
 */

const TIMESTAMP_GAP_MS = 15 * 60 * 1000

const DAY = 86_400_000

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp)
  const now = new Date()
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString(undefined, {
    weekday: sameYear ? undefined : 'short',
    month: sameYear ? 'short' : 'numeric',
    day: 'numeric',
    year: sameYear ? undefined : 'numeric',
  })
}

/** Formats a timestamp for a centered separator label. */
export function formatSeparator(timestamp: number): string {
  const todayStart = startOfDay(Date.now())
  const day = startOfDay(timestamp)

  if (day === todayStart) return formatTime(timestamp)
  if (day === todayStart - DAY) return `Yesterday ${formatTime(timestamp)}`
  if (day > todayStart - 6 * DAY) {
    const weekday = new Date(timestamp).toLocaleDateString(undefined, { weekday: 'short' })
    return `${weekday} ${formatTime(timestamp)}`
  }
  return `${formatDate(timestamp)} ${formatTime(timestamp)}`
}

/** Formats a compact timestamp for message hover tooltips. */
export function formatFullTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export interface TimestampedNode {
  node: MessageNode
  /** Separator label to render above this message, if any. */
  separator: string | null
}

/**
 * Zips the active path with the separator each message should carry.
 * Pure function — trivially testable without a rendered tree.
 */
export function withSeparators(nodes: MessageNode[]): TimestampedNode[] {
  return nodes.map((node, index) => {
    const previous = index > 0 ? nodes[index - 1] : null
    const needsSeparator =
      previous === null || node.createdAt - previous.createdAt >= TIMESTAMP_GAP_MS
    return { node, separator: needsSeparator ? formatSeparator(node.createdAt) : null }
  })
}
