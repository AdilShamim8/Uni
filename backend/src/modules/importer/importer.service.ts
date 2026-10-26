import { createHash, randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { conversationNodes, conversations, importBatches, importIdMap } from '../../db/schema.js'
import {
  badRequest,
} from '../../lib/errors.js'
import {
  UNSUPPORTED_SECTION_LABELS,
  workspaceBackupSchema,
  type BackupConversation,
  type ImportCommitResponse,
  type ImportPreviewResponse,
  type WorkspaceBackup,
} from '@uni/contracts'

export type ImporterDatabase = NodePgDatabase<typeof schema>

/* ------------------------------------------------------------------ */
/* Canonicalization + checksum                                         */
/* ------------------------------------------------------------------ */

/** Deterministic JSON canonicalization (sorted keys, stable arrays). */
export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    return Object.fromEntries(entries.map(([key, item]) => [key, canonicalize(item)]))
  }
  return value
}

export function backupChecksum(backup: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(backup))).digest('hex')
}

/* ------------------------------------------------------------------ */
/* Preview (dry run — nothing is stored)                               */
/* ------------------------------------------------------------------ */

export interface PreviewIssue {
  conversationId: string
  message: string
}

export function parseBackup(input: unknown): WorkspaceBackup {
  const result = workspaceBackupSchema.safeParse(input)
  if (!result.success) {
    throw badRequest('The backup is not a valid uni-workspace-backup (version 1).', {
      issues: result.error.issues.slice(0, 20).map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    })
  }
  return result.data
}

export function unsupportedSections(backup: WorkspaceBackup): string[] {
  const payload = backup.payload as Record<string, unknown>
  return Object.keys(UNSUPPORTED_SECTION_LABELS).filter((section) => section in payload)
}

/** Structural checks per conversation: parent refs + active leaf exist. */
function reviewConversation(conversation: BackupConversation): PreviewIssue[] {
  const issues: PreviewIssue[] = []
  const nodeIds = new Set(Object.keys(conversation.nodes))

  for (const node of Object.values(conversation.nodes)) {
    if (node.parentId !== null && node.parentId !== undefined && !nodeIds.has(node.parentId)) {
      issues.push({
        conversationId: conversation.id,
        message: `Node ${node.id} references missing parent ${node.parentId}.`,
      })
    }
    if (node.status === 'streaming') {
      // Streaming is a transient client state; import it as stopped.
    }
  }

  if (conversation.activeLeafId != null && !nodeIds.has(conversation.activeLeafId)) {
    issues.push({
      conversationId: conversation.id,
      message: `activeLeafId ${conversation.activeLeafId} is not a node of this conversation.`,
    })
  }

  return issues
}

export function previewImport(backupInput: unknown): ImportPreviewResponse {
  const backup = parseBackup(backupInput)
  const issues: PreviewIssue[] = []
  let messages = 0
  let skippedTemporary = 0

  for (const conversation of backup.payload.app.conversations) {
    if (conversation.temporary === true) {
      skippedTemporary += 1
      continue
    }
    issues.push(...reviewConversation(conversation))
    messages += Object.keys(conversation.nodes).length
  }

  const importable = backup.payload.app.conversations.filter(
    (conversation) => conversation.temporary !== true,
  )

  return {
    checksum: backupChecksum(backup),
    counts: {
      conversations: importable.length,
      messages,
      skippedTemporary,
    },
    errors: issues,
    unsupported: unsupportedSections(backup),
  }
}

/* ------------------------------------------------------------------ */
/* Commit (transactional + idempotent)                                 */
/* ------------------------------------------------------------------ */

/**
 * Import conversations and their message trees into the workspace inside
 * ONE transaction. The (workspace_id, checksum) unique constraint makes
 * importing the same backup twice a replay: the second call returns the
 * original batch's summary and ID mapping without creating records.
 * Conversations with structural errors are rejected up front; temporary
 * conversations are skipped defensively (the exporter already excludes
 * them).
 */
export async function commitImport(
  db: ImporterDatabase,
  workspaceId: string,
  backupInput: unknown,
): Promise<ImportCommitResponse> {
  const backup = parseBackup(backupInput)
  const checksum = backupChecksum(backup)

  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(importBatches)
      .where(and(eq(importBatches.workspaceId, workspaceId), eq(importBatches.checksum, checksum)))
      .limit(1)
    const existingBatch = existing[0]
    if (existingBatch) {
      const mappingRows = await tx
        .select({ localId: importIdMap.localId, serverId: importIdMap.serverId })
        .from(importIdMap)
        .where(eq(importIdMap.batchId, existingBatch.id))
      return {
        batchId: existingBatch.id,
        imported: {
          conversations: existingBatch.importedConversations,
          messages: existingBatch.importedMessages,
        },
        skippedTemporary: existingBatch.skippedTemporary,
        unsupported: unsupportedSections(backup),
        idempotentReplay: true,
        conversationIdMap: Object.fromEntries(
          mappingRows.map((row) => [row.localId, row.serverId]),
        ),
      }
    }

    // Validate everything BEFORE writing anything (fail closed).
    const importable: BackupConversation[] = []
    let skippedTemporary = 0
    const issues: PreviewIssue[] = []
    for (const conversation of backup.payload.app.conversations) {
      if (conversation.temporary === true) {
        skippedTemporary += 1
        continue
      }
      issues.push(...reviewConversation(conversation))
      importable.push(conversation)
    }
    if (issues.length > 0) {
      throw badRequest('The backup contains structural errors; nothing was imported.', {
        errors: issues.slice(0, 50),
      })
    }

    const batchId = randomUUID()
    const conversationIdMap: Record<string, string> = {}
    const nodeIdMapEntries: Array<{ batchId: string; kind: string; localId: string; serverId: string }> = []
    let importedMessages = 0

    for (const conversation of importable) {
      const conversationServerId = randomUUID()
      conversationIdMap[conversation.id] = conversationServerId
      nodeIdMapEntries.push({
        batchId,
        kind: 'conversation',
        localId: conversation.id,
        serverId: conversationServerId,
      })

      await tx.insert(conversations).values({
        id: conversationServerId,
        workspaceId,
        title: conversation.title,
        agentId: conversation.agentId ?? null,
        pinned: conversation.pinned ?? false,
        archived: conversation.archived ?? false,
        activeLeafId: null, // set after nodes are inserted
        createdAt: new Date(conversation.createdAt),
        updatedAt: new Date(conversation.updatedAt),
      })

      // Map local node IDs to server IDs up front, preserving structure.
      const localToServer = new Map<string, string>()
      for (const nodeId of Object.keys(conversation.nodes)) {
        localToServer.set(nodeId, randomUUID())
      }

      // Insert parents before children (topological by dependency).
      const inserted = new Set<string>()
      const pending = [...Object.values(conversation.nodes)]
      let guard = 0
      while (pending.length > 0) {
        guard += 1
        if (guard > 10_000) {
          throw badRequest(`Conversation ${conversation.id} has a node structure that cannot be ordered (cycle?).`)
        }
        const node = pending.shift()!
        const parentLocal =
          node.parentId !== null && node.parentId !== undefined ? node.parentId : null
        if (parentLocal !== null && !inserted.has(parentLocal)) {
          pending.push(node)
          continue
        }
        const serverId = localToServer.get(node.id)
        if (!serverId) continue
        await tx.insert(conversationNodes).values({
          id: serverId,
          conversationId: conversationServerId,
          parentId: parentLocal !== null ? localToServer.get(parentLocal) ?? null : null,
          role: node.role,
          status: node.status === 'streaming' ? 'stopped' : node.status,
          content: node.content,
          feedback: node.feedback ?? null,
          error: node.error ?? null,
          statusPrefix: node.statusPrefix ?? null,
          tools: node.tools ?? null,
          attachments: node.attachments ?? null,
          sources: node.sources ?? null,
          clientId: `import:${batchId}:${node.id}`,
          createdAt: new Date(node.createdAt),
          updatedAt: new Date(node.createdAt),
        })
        inserted.add(node.id)
        importedMessages += 1
        nodeIdMapEntries.push({
          batchId,
          kind: 'node',
          localId: node.id,
          serverId,
        })
      }

      // Active leaf: map if present and valid; otherwise the newest node.
      const activeLeafLocal = conversation.activeLeafId ?? null
      const activeLeafServer =
        activeLeafLocal !== null && localToServer.has(activeLeafLocal)
          ? localToServer.get(activeLeafLocal)!
          : [...localToServer.values()].at(-1) ?? null
      await tx
        .update(conversations)
        .set({ activeLeafId: activeLeafServer })
        .where(eq(conversations.id, conversationServerId))
    }

    await tx.insert(importBatches).values({
      id: batchId,
      workspaceId,
      checksum,
      source: 'workspace-backup-v1',
      importedConversations: importable.length,
      importedMessages,
      skippedTemporary,
    })
    for (const entry of nodeIdMapEntries) {
      await tx.insert(importIdMap).values(entry)
    }

    return {
      batchId,
      imported: { conversations: importable.length, messages: importedMessages },
      skippedTemporary,
      unsupported: unsupportedSections(backup),
      idempotentReplay: false,
      conversationIdMap,
    }
  })
}
