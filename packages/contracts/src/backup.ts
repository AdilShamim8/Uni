import { z } from 'zod'
import { feedbackSchema, nodeRoleSchema } from './conversations.js'

/**
 * The versioned local WorkspaceBackup format (produced by the frontend's
 * Settings > Backup export) — ported to shared zod schemas so the server
 * validates imports with the same semantics. Sections the server has not
 * implemented yet (agents, work, library, context, plugins, providers,
 * preferences) are tolerated in the payload and reported as unsupported
 * rather than silently dropped or rejected.
 */

export const BACKUP_KIND = 'uni-workspace-backup' as const

const backupNodeSchema = z.object({
  id: z.string().min(1),
  parentId: z.string().nullable().optional(),
  role: nodeRoleSchema,
  content: z.string(),
  createdAt: z.number(),
  status: z.enum(['complete', 'streaming', 'stopped', 'error']),
  feedback: feedbackSchema.nullable().optional(),
  error: z.string().optional(),
  statusPrefix: z.string().optional(),
  tools: z.array(z.string()).optional(),
  attachments: z.array(z.unknown()).optional(),
  sources: z.array(z.unknown()).optional(),
})

export type BackupNode = z.infer<typeof backupNodeSchema>

const backupConversationSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  /** Temporary chats must never be imported while labeled temporary. */
  temporary: z.boolean().optional(),
  agentId: z.string().nullable().optional(),
  nodes: z.record(z.string(), backupNodeSchema),
  activeLeafId: z.string().nullable().optional(),
})

export type BackupConversation = z.infer<typeof backupConversationSchema>

export const workspaceBackupSchema = z
  .object({
    kind: z.literal(BACKUP_KIND),
    version: z.literal(1),
    savedAt: z.number(),
    payload: z
      .object({
        app: z
          .object({
            version: z.number().optional(),
            savedAt: z.number().optional(),
            conversations: z.array(backupConversationSchema),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough()

export type WorkspaceBackup = z.infer<typeof workspaceBackupSchema>

/** Sections the server can import today; everything else is reported. */
export const IMPORTABLE_SECTIONS = ['conversations'] as const

export const UNSUPPORTED_SECTION_LABELS: Record<string, string> = {
  providers: 'Provider profiles are local-only; re-enter connection settings (B03 adds server credentials).',
  agents: 'Employees import lands with B04 (server-side agents/memory).',
  work: 'Work tasks import lands with B06 (durable runs).',
  library: 'Library artifacts import lands with B04.',
  context: 'Context selections import lands with B04.',
  plugins: 'Plugin configuration import lands with B05.',
  preferences: 'Preferences stay local to the browser profile.',
}

/** Dry-run preview — nothing is stored. */
export const importPreviewResponseSchema = z.object({
  checksum: z.string().min(8),
  counts: z.object({
    conversations: z.number().int().nonnegative(),
    messages: z.number().int().nonnegative(),
    skippedTemporary: z.number().int().nonnegative(),
  }),
  errors: z.array(
    z.object({
      conversationId: z.string(),
      message: z.string(),
    }),
  ),
  unsupported: z.array(z.string()),
})

export type ImportPreviewResponse = z.infer<typeof importPreviewResponseSchema>

/** Commit result — importing the same checksum again replays this. */
export const importCommitResponseSchema = z.object({
  batchId: z.string().min(1),
  imported: z.object({
    conversations: z.number().int().nonnegative(),
    messages: z.number().int().nonnegative(),
  }),
  skippedTemporary: z.number().int().nonnegative(),
  unsupported: z.array(z.string()),
  /** True when this exact backup was already imported (no new records). */
  idempotentReplay: z.boolean(),
  conversationIdMap: z.record(z.string(), z.string()),
})

export type ImportCommitResponse = z.infer<typeof importCommitResponseSchema>
