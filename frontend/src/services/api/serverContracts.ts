/**
 * Mirror of @uni/contracts DTO types used by the server-session store.
 * Kept as plain types (no runtime dependency) so the existing Vercel
 * build root stays self-contained; the shapes are asserted in tests and
 * re-verified against the contracts package in backend integration
 * tests. Consolidation into a direct import is planned with the
 * single-origin deployment (B08).
 */

export interface ImportPreviewResponse {
  checksum: string
  counts: {
    conversations: number
    messages: number
    skippedTemporary: number
  }
  errors: Array<{ conversationId: string; message: string }>
  unsupported: string[]
}

export interface ImportCommitResponse {
  batchId: string
  imported: {
    conversations: number
    messages: number
  }
  skippedTemporary: number
  unsupported: string[]
  idempotentReplay: boolean
  conversationIdMap: Record<string, string>
}

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}
