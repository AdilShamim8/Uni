import { randomUUID } from 'node:crypto'
import { and, desc, eq, lt, or, sql } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { conversationNodes, conversations } from '../../db/schema.js'
import type {
  ConversationDetailDto,
  ConversationSummaryDto,
  ConversationListQuery,
  CreateConversationRequest,
  CreateNodeRequest,
  MessageNodeDto,
  PatchConversationRequest,
  Page,
} from '@uni/contracts'
import { AppError, badRequest, conflict, notFound } from '../../lib/errors.js'

export type ConversationsDatabase = NodePgDatabase<typeof schema>

type ConversationRow = typeof conversations.$inferSelect
type NodeRow = typeof conversationNodes.$inferSelect

/* ------------------------------------------------------------------ */
/* Serialization                                                       */
/* ------------------------------------------------------------------ */

function toMillis(value: Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime()
}

export function serializeNode(row: NodeRow): MessageNodeDto {
  return {
    id: row.id,
    parentId: row.parentId,
    role: row.role as MessageNodeDto['role'],
    status: row.status as MessageNodeDto['status'],
    content: row.content,
    createdAt: toMillis(row.createdAt),
    feedback: (row.feedback as MessageNodeDto['feedback']) ?? null,
    ...(row.error !== null && row.error !== undefined ? { error: row.error } : {}),
    ...(row.statusPrefix !== null && row.statusPrefix !== undefined
      ? { statusPrefix: row.statusPrefix }
      : {}),
    ...(Array.isArray(row.tools) ? { tools: row.tools as string[] } : {}),
    ...(Array.isArray(row.attachments) ? { attachments: row.attachments as unknown[] } : {}),
    ...(Array.isArray(row.sources) ? { sources: row.sources as unknown[] } : {}),
  }
}

function serializeSummary(row: ConversationRow, messageCount: number): ConversationSummaryDto {
  return {
    id: row.id,
    title: row.title,
    agentId: row.agentId,
    pinned: row.pinned,
    archived: row.archived,
    activeLeafId: row.activeLeafId,
    createdAt: toMillis(row.createdAt),
    updatedAt: toMillis(row.updatedAt),
    messageCount,
  }
}

/* ------------------------------------------------------------------ */
/* Cursor pagination (keyset on updated_at desc, id desc)              */
/* ------------------------------------------------------------------ */

export function encodeCursor(updatedAt: Date, id: string): string {
  return Buffer.from(`${toMillis(updatedAt)}|${id}`, 'utf8').toString('base64url')
}

function decodeCursor(cursor: string): { updatedAt: Date; id: string } {
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8')
  const [millis, id] = decoded.split('|')
  const parsed = Number(millis)
  if (!Number.isFinite(parsed) || !id) {
    throw badRequest('Invalid pagination cursor.')
  }
  return { updatedAt: new Date(parsed), id }
}

/* ------------------------------------------------------------------ */
/* Service                                                             */
/* ------------------------------------------------------------------ */

export async function listConversations(
  db: ConversationsDatabase,
  workspaceId: string,
  query: ConversationListQuery,
): Promise<Page<ConversationSummaryDto>> {
  const conditions = [eq(conversations.workspaceId, workspaceId)]
  if (query.archived === 'exclude') conditions.push(eq(conversations.archived, false))
  if (query.archived === 'only') conditions.push(eq(conversations.archived, true))
  if (query.cursor) {
    const { updatedAt, id } = decodeCursor(query.cursor)
    conditions.push(
      or(lt(conversations.updatedAt, updatedAt), and(eq(conversations.updatedAt, updatedAt), lt(conversations.id, id)))!,
    )
  }

  // Fetch limit + 1 to detect the next page without a second query.
  const rows = await db
    .select({
      conversation: conversations,
      // Explicit aliasing: drizzle renders column refs inside raw sql
      // templates UNQUALIFIED, so `${conversationNodes.conversationId}` =
      // `${conversations.id}` would both resolve inside the subquery
      // (node.id = node.conversation_id, always false, count 0).
      // Qualifying by the real table names keeps the correlated subquery
      // correct; regression-tested below.
      messageCount: sql<number>`(select count(*)::int from "conversation_node" as counted_nodes where counted_nodes.conversation_id = "conversation"."id")`,
    })
    .from(conversations)
    .where(and(...conditions))
    .orderBy(desc(conversations.updatedAt), desc(conversations.id))
    .limit(query.limit + 1)

  const hasMore = rows.length > query.limit
  const page = hasMore ? rows.slice(0, query.limit) : rows
  const lastRow = page.at(-1)

  return {
    items: page.map((row) => serializeSummary(row.conversation, row.messageCount)),
    nextCursor:
      hasMore && lastRow ? encodeCursor(lastRow.conversation.updatedAt, lastRow.conversation.id) : null,
  }
}

export async function createConversation(
  db: ConversationsDatabase,
  workspaceId: string,
  request: CreateConversationRequest,
): Promise<ConversationSummaryDto> {
  const id = randomUUID()
  const inserted = await db
    .insert(conversations)
    .values({
      id,
      workspaceId,
      title: request.title ?? 'New chat',
      agentId: request.agentId ?? null,
    })
    .returning()
  const row = inserted[0]
  if (!row) throw new Error('Conversation insert returned no row')
  return serializeSummary(row, 0)
}

export async function getConversation(
  db: ConversationsDatabase,
  workspaceId: string,
  conversationId: string,
): Promise<ConversationDetailDto | null> {
  const rows = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.workspaceId, workspaceId)))
    .limit(1)
  const row = rows[0]
  if (!row) return null

  const nodeRows = await db
    .select()
    .from(conversationNodes)
    .where(eq(conversationNodes.conversationId, conversationId))
    .orderBy(conversationNodes.createdAt)

  const summary = serializeSummary(row, nodeRows.length)
  return { ...summary, nodes: nodeRows.map(serializeNode) }
}

export async function patchConversation(
  db: ConversationsDatabase,
  workspaceId: string,
  conversationId: string,
  request: PatchConversationRequest,
): Promise<ConversationDetailDto> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.workspaceId, workspaceId)))
      .limit(1)
    const row = rows[0]
    if (!row) {
      throw notFound('Conversation not found.')
    }

    // Optimistic concurrency: a stale editor must not silently overwrite
    // another tab's changes.
    if (
      request.expectedUpdatedAt !== undefined &&
      request.expectedUpdatedAt !== toMillis(row.updatedAt)
    ) {
      throw conflict('This conversation changed elsewhere. Reload and retry.', {
        currentUpdatedAt: toMillis(row.updatedAt),
      })
    }

    // Active leaf must be a node of THIS conversation.
    if (request.activeLeafId !== undefined && request.activeLeafId !== null) {
      const leaf = await tx
        .select({ id: conversationNodes.id })
        .from(conversationNodes)
        .where(
          and(
            eq(conversationNodes.id, request.activeLeafId),
            eq(conversationNodes.conversationId, conversationId),
          ),
        )
        .limit(1)
      if (leaf.length === 0) {
        throw badRequest('activeLeafId must reference a node in this conversation.')
      }
    }

    const updated = await tx
      .update(conversations)
      .set({
        ...(request.title !== undefined ? { title: request.title } : {}),
        ...(request.pinned !== undefined ? { pinned: request.pinned } : {}),
        ...(request.archived !== undefined ? { archived: request.archived } : {}),
        ...(request.activeLeafId !== undefined ? { activeLeafId: request.activeLeafId } : {}),
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId))
      .returning()
    const updatedRow = updated[0]
    if (!updatedRow) throw new Error('Conversation update returned no row')

    const nodeRows = await tx
      .select()
      .from(conversationNodes)
      .where(eq(conversationNodes.conversationId, conversationId))
      .orderBy(conversationNodes.createdAt)

    const summary = serializeSummary(updatedRow, nodeRows.length)
    return { ...summary, nodes: nodeRows.map(serializeNode) }
  })
}

export async function deleteConversation(
  db: ConversationsDatabase,
  workspaceId: string,
  conversationId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.workspaceId, workspaceId)))
    .returning({ id: conversations.id })
  return deleted.length > 0
}

export interface CreateNodeResult {
  node: MessageNodeDto
  conversation: ConversationDetailDto
  /** True when an existing node was reused via the clientId idempotency key. */
  reused: boolean
}

export async function createNode(
  db: ConversationsDatabase,
  workspaceId: string,
  conversationId: string,
  request: CreateNodeRequest,
): Promise<CreateNodeResult | null> {
  return db.transaction(async (tx) => {
    const conversationRows = await tx
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, conversationId), eq(conversations.workspaceId, workspaceId)))
      .limit(1)
    const conversation = conversationRows[0]
    if (!conversation) return null

    // Idempotency: a repeated clientId returns the existing node unchanged.
    if (request.clientId) {
      const existing = await tx
        .select()
        .from(conversationNodes)
        .where(
          and(
            eq(conversationNodes.conversationId, conversationId),
            eq(conversationNodes.clientId, request.clientId),
          ),
        )
        .limit(1)
      if (existing[0]) {
        const node = serializeNode(existing[0])
        const detail = await snapshotDetail(tx, conversationId)
        return { node, conversation: detail, reused: true }
      }
    }

    // The parent must exist within the same conversation (the composite DB
    // constraint is the backstop; the service check yields a clean 400).
    if (request.parentId !== undefined && request.parentId !== null) {
      const parent = await tx
        .select({ id: conversationNodes.id })
        .from(conversationNodes)
        .where(
          and(
            eq(conversationNodes.id, request.parentId),
            eq(conversationNodes.conversationId, conversationId),
          ),
        )
        .limit(1)
      if (parent.length === 0) {
        throw badRequest('parentId must reference a node in this conversation.')
      }
    }

    const id = randomUUID()
    const insertedNodes = await tx
      .insert(conversationNodes)
      .values({
        id,
        conversationId,
        parentId: request.parentId ?? null,
        role: request.role,
        status: request.status ?? 'complete',
        content: request.content,
        feedback: request.feedback ?? null,
        error: request.error ?? null,
        statusPrefix: request.statusPrefix ?? null,
        tools: request.tools ?? null,
        attachments: request.attachments ?? null,
        sources: request.sources ?? null,
        clientId: request.clientId ?? null,
      })
      .returning()
    const nodeRow = insertedNodes[0]
    if (!nodeRow) throw new Error('Node insert returned no row')

    // Creating a node selects its branch: the new node becomes the active
    // leaf (edit/regenerate produce siblings under the same parent).
    await tx
      .update(conversations)
      .set({ activeLeafId: id, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId))

    const node = serializeNode(nodeRow)
    const refreshed = await tx
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1)
    const refreshedRow = refreshed[0] ?? conversation
    const detail = await snapshotDetail(tx, conversationId, refreshedRow)
    return { node, conversation: detail, reused: false }
  })
}

async function snapshotDetail(
  tx: Parameters<Parameters<ConversationsDatabase['transaction']>[0]>[0],
  conversationId: string,
  rowOverride?: ConversationRow,
): Promise<ConversationDetailDto> {
  const existing =
    rowOverride ??
    (
      await tx
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1)
    )[0]
  if (!existing) {
    throw new Error('Conversation vanished mid-transaction')
  }
  const nodeRows = await tx
    .select()
    .from(conversationNodes)
    .where(eq(conversationNodes.conversationId, conversationId))
    .orderBy(conversationNodes.createdAt)
  const summary = serializeSummary(existing, nodeRows.length)
  return { ...summary, nodes: nodeRows.map(serializeNode) }
}

export { AppError }
