import type { Conversation } from './types'

export interface ConversationGroup {
  key: 'pinned' | 'today' | 'yesterday' | 'week' | 'month' | 'older'
  label: string
  conversations: Conversation[]
}

const DAY = 86_400_000

function startOfDay(timestamp: number): number {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

/**
 * Group conversations for the sidebar: pinned first, then date buckets by
 * `updatedAt` (descending). Archived conversations are filtered by the
 * caller before grouping.
 */
export function groupConversations(conversations: Conversation[]): ConversationGroup[] {
  const pinned: Conversation[] = []
  const buckets: Record<Exclude<ConversationGroup['key'], 'pinned'>, Conversation[]> = {
    today: [],
    yesterday: [],
    week: [],
    month: [],
    older: [],
  }

  const todayStart = startOfDay(Date.now())
  const yesterdayStart = todayStart - DAY

  const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)
  for (const conversation of sorted) {
    if (conversation.pinned) {
      pinned.push(conversation)
      continue
    }
    const updated = conversation.updatedAt
    if (updated >= todayStart) buckets.today.push(conversation)
    else if (updated >= yesterdayStart) buckets.yesterday.push(conversation)
    else if (updated >= todayStart - 7 * DAY) buckets.week.push(conversation)
    else if (updated >= todayStart - 30 * DAY) buckets.month.push(conversation)
    else buckets.older.push(conversation)
  }

  const labels: Record<ConversationGroup['key'], string> = {
    pinned: 'Pinned',
    today: 'Today',
    yesterday: 'Yesterday',
    week: 'Previous 7 days',
    month: 'Previous 30 days',
    older: 'Older',
  }

  return (['pinned', 'today', 'yesterday', 'week', 'month', 'older'] as const)
    .filter((key) => (key === 'pinned' ? pinned.length > 0 : buckets[key].length > 0))
    .map((key) => ({
      key,
      label: labels[key],
      conversations: key === 'pinned' ? pinned : buckets[key],
    }))
}
