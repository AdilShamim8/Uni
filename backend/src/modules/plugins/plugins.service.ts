import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { pluginGrants, pluginReceipts, workspaces } from '../../db/schema.js'
import {
  pluginDescriptorSchema,
  pluginGrantDtoSchema,
  pluginRunReceiptDtoSchema,
  type PluginDescriptor,
  type PluginGrantDto,
  type PluginRunReceiptDto,
} from '@uni/contracts'
import { AppError } from '../../lib/errors.js'

/**
 * The plugin service (T021/T022): one server-side tool registry with
 * two distinct gates.
 *
 * - Workspace enablement (enabledPlugins on the workspace row): the
 *   administrator's choice that a plugin's tools exist here at all.
 * - Per-thread grants (plugin_grant rows): the user's choice that one
 *   thread may use one plugin.
 *
 * A run may invoke a plugin only when BOTH hold. Revocation deletes the
 * grant row — in-flight invocations re-check access at execution time,
 * so a revoked plugin is refused immediately. Receipts record every
 * invocation (ok/error/denied) with bounded, user-safe detail.
 *
 * T022: the built-in plugins run their compute as pure functions here
 * (document/Library-context tools over the Library service); the
 * registry is the single place a future MCP tool joins.
 */

export type PluginsDatabase = NodePgDatabase<typeof schema>

/**
 * The registry — static descriptors, the same catalog the UI shows.
 * Built-ins execute locally in the API process (pure Library/domain
 * logic); external ones are honestly integration-required until their
 * connectors land (P08).
 */
export const PLUGIN_REGISTRY: PluginDescriptor[] = [
  pluginDescriptorSchema.parse({
    id: 'documents',
    name: 'Documents',
    description: 'Create Library documents and save thread output.',
    capabilities: ['documents.create', 'documents.save'],
    integrationRequired: false,
  }),
  pluginDescriptorSchema.parse({
    id: 'data-analysis',
    name: 'Data analysis',
    description: 'Compute summaries and groupings over a CSV the thread attaches.',
    capabilities: ['data.analyze'],
    integrationRequired: false,
  }),
  pluginDescriptorSchema.parse({
    id: 'library-context',
    name: 'Library context',
    description: 'Search Library artifacts and attach selected content to a thread.',
    capabilities: ['library.search', 'library.attach'],
    integrationRequired: false,
  }),
  pluginDescriptorSchema.parse({
    id: 'github',
    name: 'GitHub',
    description: 'Read repositories and issues through the GitHub connector.',
    capabilities: ['github.search', 'github.read'],
    integrationRequired: true,
  }),
]

export function findPluginDescriptor(pluginId: string): PluginDescriptor | null {
  return PLUGIN_REGISTRY.find((plugin) => plugin.id === pluginId) ?? null
}

function serializeGrant(row: typeof pluginGrants.$inferSelect): PluginGrantDto {
  return pluginGrantDtoSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    pluginId: row.pluginId,
    kind: row.kind,
    threadId: row.threadId,
    createdAt: row.createdAt.getTime(),
  })
}

function serializeReceipt(row: typeof pluginReceipts.$inferSelect): PluginRunReceiptDto {
  return pluginRunReceiptDtoSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    pluginId: row.pluginId,
    capability: row.capability,
    kind: row.kind,
    threadId: row.threadId,
    runId: row.runId,
    status: row.status,
    detail: row.detail,
    createdAt: row.createdAt.getTime(),
  })
}

/* ------------------------------------------------------------------ */
/* Workspace enablement                                                */
/* ------------------------------------------------------------------ */

export async function listEnabledPlugins(db: PluginsDatabase, workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ enabledPlugins: workspaces.enabledPlugins })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1)
  return rows[0]?.enabledPlugins ?? []
}

export async function setPluginEnabled(
  db: PluginsDatabase,
  workspaceId: string,
  pluginId: string,
  enabled: boolean,
): Promise<string[]> {
  const descriptor = findPluginDescriptor(pluginId)
  if (!descriptor) throw new AppError('NOT_FOUND', 'Unknown plugin.', 404)
  const current = await listEnabledPlugins(db, workspaceId)
  const next = enabled
    ? Array.from(new Set([...current, pluginId]))
    : current.filter((id) => id !== pluginId)
  await db
    .update(workspaces)
    .set({ enabledPlugins: next })
    .where(eq(workspaces.id, workspaceId))
  return next
}

/* ------------------------------------------------------------------ */
/* Grants                                                             */
/* ------------------------------------------------------------------ */

export async function listGrantsForThread(
  db: PluginsDatabase,
  workspaceId: string,
  threadId: string,
): Promise<PluginGrantDto[]> {
  const rows = await db
    .select()
    .from(pluginGrants)
    .where(and(eq(pluginGrants.workspaceId, workspaceId), eq(pluginGrants.threadId, threadId)))
    .orderBy(desc(pluginGrants.createdAt))
  return rows.map(serializeGrant)
}

export async function grantPluginForThread(
  db: PluginsDatabase,
  workspaceId: string,
  pluginId: string,
  kind: 'conversation' | 'agent-session' | 'work-task',
  threadId: string,
): Promise<PluginGrantDto> {
  const descriptor = findPluginDescriptor(pluginId)
  if (!descriptor) throw new AppError('NOT_FOUND', 'Unknown plugin.', 404)

  // Idempotent: an existing identical grant is returned as-is.
  const existing = await db
    .select()
    .from(pluginGrants)
    .where(
      and(
        eq(pluginGrants.workspaceId, workspaceId),
        eq(pluginGrants.pluginId, pluginId),
        eq(pluginGrants.kind, kind),
        eq(pluginGrants.threadId, threadId),
      ),
    )
    .limit(1)
  if (existing[0]) return serializeGrant(existing[0])

  const inserted = await db
    .insert(pluginGrants)
    .values({ id: randomUUID(), workspaceId, pluginId, kind, threadId })
    .returning()
  const row = inserted[0]
  if (!row) throw new Error('Plugin grant insert returned no row')
  return serializeGrant(row)
}

export async function revokePluginForThread(
  db: PluginsDatabase,
  workspaceId: string,
  pluginId: string,
  kind: 'conversation' | 'agent-session' | 'work-task',
  threadId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(pluginGrants)
    .where(
      and(
        eq(pluginGrants.workspaceId, workspaceId),
        eq(pluginGrants.pluginId, pluginId),
        eq(pluginGrants.kind, kind),
        eq(pluginGrants.threadId, threadId),
      ),
    )
    .returning({ id: pluginGrants.id })
  return deleted.length > 0
}

/* ------------------------------------------------------------------ */
/* Access + receipts                                                   */
/* ------------------------------------------------------------------ */

export interface PluginAccess {
  exists: boolean
  enabled: boolean
  granted: boolean
  integrationRequired: boolean
  allowed: boolean
  reason: string | null
}

/**
 * The two-gate check a run (or any caller) must pass. Pure read; the
 * dispatcher calls this BEFORE executing any plugin capability.
 */
export async function pluginAccess(
  db: PluginsDatabase,
  workspaceId: string,
  pluginId: string,
  kind: 'conversation' | 'agent-session' | 'work-task',
  threadId: string,
): Promise<PluginAccess> {
  const descriptor = findPluginDescriptor(pluginId)
  if (!descriptor) {
    return { exists: false, enabled: false, granted: false, integrationRequired: false, allowed: false, reason: 'Unknown plugin.' }
  }
  const enabled = (await listEnabledPlugins(db, workspaceId)).includes(pluginId)
  const grantRows = await db
    .select({ id: pluginGrants.id })
    .from(pluginGrants)
    .where(
      and(
        eq(pluginGrants.workspaceId, workspaceId),
        eq(pluginGrants.pluginId, pluginId),
        eq(pluginGrants.kind, kind),
        eq(pluginGrants.threadId, threadId),
      ),
    )
    .limit(1)
  const granted = grantRows.length > 0

  if (!enabled) {
    return { exists: true, enabled: false, granted, integrationRequired: descriptor.integrationRequired, allowed: false, reason: 'This plugin is not enabled for the workspace.' }
  }
  if (!granted) {
    return { exists: true, enabled: true, granted: false, integrationRequired: descriptor.integrationRequired, allowed: false, reason: 'This plugin is not granted to this thread.' }
  }
  if (descriptor.integrationRequired) {
    return { exists: true, enabled: true, granted: true, integrationRequired: true, allowed: false, reason: 'This plugin needs an external connection first.' }
  }
  return { exists: true, enabled: true, granted: true, integrationRequired: false, allowed: true, reason: null }
}

/** Record one execution receipt (bounded detail enforced here). */
export async function recordPluginReceipt(
  db: PluginsDatabase,
  input: {
    workspaceId: string
    pluginId: string
    capability: string
    kind: 'conversation' | 'agent-session' | 'work-task'
    threadId: string
    runId?: string | null
    status: 'ok' | 'error' | 'denied'
    detail: string
  },
): Promise<PluginRunReceiptDto> {
  const inserted = await db
    .insert(pluginReceipts)
    .values({
      id: randomUUID(),
      workspaceId: input.workspaceId,
      pluginId: input.pluginId,
      capability: input.capability,
      kind: input.kind,
      threadId: input.threadId,
      runId: input.runId ?? null,
      status: input.status,
      detail: input.detail.slice(0, 2_000),
    })
    .returning()
  const row = inserted[0]
  if (!row) throw new Error('Plugin receipt insert returned no row')
  return serializeReceipt(row)
}

export async function listReceiptsForThread(
  db: PluginsDatabase,
  workspaceId: string,
  threadId: string,
): Promise<PluginRunReceiptDto[]> {
  const rows = await db
    .select()
    .from(pluginReceipts)
    .where(and(eq(pluginReceipts.workspaceId, workspaceId), eq(pluginReceipts.threadId, threadId)))
    .orderBy(desc(pluginReceipts.createdAt))
    .limit(200)
  return rows.map(serializeReceipt)
}
