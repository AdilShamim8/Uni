/**
 * Pure model helpers for the server conversation tree — shared by the
 * transcript component and its tests, kept component-free for fast
 * refresh.
 */

interface TranscriptNode {
  id: string
  parentId: string | null
}

/**
 * Walks the active path from the leaf up through parent links; returns
 * a membership set. Unknown leaf ids (a stale id after a delete) add
 * nothing — the set only ever contains real nodes.
 */
export function activePathIds(detail: {
  activeLeafId: string | null
  nodes: TranscriptNode[]
}): Set<string> {
  const active = new Set<string>()
  const byId = new Map(detail.nodes.map((node) => [node.id, node]))
  let cursor: string | null = detail.activeLeafId
  while (cursor && byId.has(cursor)) {
    active.add(cursor)
    cursor = byId.get(cursor)?.parentId ?? null
  }
  return active
}
