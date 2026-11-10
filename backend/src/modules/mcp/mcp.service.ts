import { randomUUID } from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { mcpServers } from '../../db/schema.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
  mcpServerDtoSchema,
  mcpToolDtoSchema,
  type McpAuthConfig,
  type McpServerDto,
  type McpToolDto,
} from '@uni/contracts'
import { AppError } from '../../lib/errors.js'
import { encryptSecret, decryptSecret } from '../../lib/secretBox.js'
import { createGuardedFetch } from '../../lib/guardedTransport.js'
import { withTimeout } from '../../lib/timeout.js'

/**
 * The MCP service (T023): workspace-scoped remote MCP servers over the
 * time-bounded, SSRF-guarded HTTP transport.
 *
 * - Auth: bearer tokens are sealed in the SAME encrypted envelope as
 *   provider credentials (secretBox, aes-256-gcm, workspace+server
 *   scope) and are never returned by any read path.
 * - Transport: the SDK's StreamableHTTPClientTransport wired to the
 *   guarded fetch (SSRF guard + timeout) — every remote call is
 *   time-bounded, so a hung server can never hang the API.
 * - States are honest: 'connected' only after a successful
 *   connect/test; failures store the user-safe reason and flip to
 *   'error'. Disconnect resets to 'disconnected' and clears
 *   serverInfo.
 */

export type McpDatabase = NodePgDatabase<typeof schema>

/** Bound for a single remote MCP round trip. */
const MCP_CALL_TIMEOUT_MS = 10_000

export interface McpEnv {
  CREDENTIAL_MASTER_KEY?: Buffer
  CREDENTIAL_KEY_ID: string
  NODE_ENV: string
  [key: string]: unknown
}

function serialize(row: typeof mcpServers.$inferSelect): McpServerDto {
  const info = row.serverInfo as { name?: string | null; version?: string | null } | null
  return mcpServerDtoSchema.parse({
    id: row.id,
    name: row.name,
    url: row.url,
    status: row.status,
    authConfigured: row.authType === 'bearer' && row.authSecret !== null,
    authType: row.authType === 'bearer' ? 'bearer' : 'none',
    lastError: row.lastError,
    serverInfo:
      info && typeof info === 'object'
        ? { name: info.name ?? null, version: info.version ?? null }
        : null,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

function sealAuth(env: McpEnv, auth: McpAuthConfig, workspaceId: string, serverId: string): {
  authType: string
  authSecret: string | null
} {
  if (auth.type === 'none') return { authType: 'none', authSecret: null }
  if (!env.CREDENTIAL_MASTER_KEY) {
    throw new AppError('UNAVAILABLE', 'Credential storage is not configured on this server.', 503)
  }
  const envelope = encryptSecret(env.CREDENTIAL_MASTER_KEY, env.CREDENTIAL_KEY_ID, auth.token, {
    workspaceId,
    providerId: `mcp:${serverId}`,
  })
  return { authType: 'bearer', authSecret: JSON.stringify(envelope) }
}

function openAuth(env: McpEnv, row: typeof mcpServers.$inferSelect): string | null {
  if (row.authType !== 'bearer' || !row.authSecret) return null
  if (!env.CREDENTIAL_MASTER_KEY) {
    throw new AppError('UNAVAILABLE', 'Credential storage is not configured on this server.', 503)
  }
  const { plaintext } = decryptSecret(env.CREDENTIAL_MASTER_KEY, row.authSecret, {
    workspaceId: row.workspaceId,
    providerId: `mcp:${row.id}`,
  })
  return plaintext
}

/** Build a connected SDK client over the guarded transport. */
async function connectClient(
  env: McpEnv,
  row: typeof mcpServers.$inferSelect,
): Promise<Client> {
  const guardedFetch = createGuardedFetch(env as never, MCP_CALL_TIMEOUT_MS)
  const url = new URL(row.url)
  const headers: Record<string, string> = {}
  const token = openAuth(env, row)
  if (token !== null) headers.authorization = `Bearer ${token}`

  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers },
    fetch: guardedFetch as unknown as typeof globalThis.fetch,
  })
  const client = new Client(
    { name: 'uni-backend', version: '1.0.0' },
    { capabilities: {} },
  )
  await withTimeout(client.connect(transport), MCP_CALL_TIMEOUT_MS, 'mcp connect')
  return client
}

/* ------------------------------------------------------------------ */
/* CRUD                                                                */
/* ------------------------------------------------------------------ */

export async function listMcpServers(db: McpDatabase, workspaceId: string): Promise<McpServerDto[]> {
  const rows = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.workspaceId, workspaceId))
    .orderBy(mcpServers.name)
  return rows.map(serialize)
}

export async function createMcpServer(
  db: McpDatabase,
  env: McpEnv,
  workspaceId: string,
  request: { name: string; url: string; auth?: McpAuthConfig },
): Promise<McpServerDto> {
  // Dev-only guard parity with the guarded transport: localhost/https
  // rules are enforced by createGuardedFetch at connect time; here we
  // only reject obviously malformed URLs the schema already caught.
  const id = randomUUID()
  const auth = sealAuth(env, request.auth ?? { type: 'none' }, workspaceId, id)
  const inserted = await db
    .insert(mcpServers)
    .values({
      id,
      workspaceId,
      name: request.name,
      url: request.url,
      authType: auth.authType,
      authSecret: auth.authSecret,
      status: 'disconnected',
      lastError: null,
      serverInfo: null,
    })
    .returning()
  const row = inserted[0]
  if (!row) throw new Error('MCP server insert returned no row')
  return serialize(row)
}

export async function deleteMcpServer(
  db: McpDatabase,
  workspaceId: string,
  serverId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(mcpServers)
    .where(and(eq(mcpServers.id, serverId), eq(mcpServers.workspaceId, workspaceId)))
    .returning({ id: mcpServers.id })
  return deleted.length > 0
}

export async function patchMcpServer(
  db: McpDatabase,
  env: McpEnv,
  workspaceId: string,
  serverId: string,
  patch: { name?: string; url?: string; auth?: McpAuthConfig },
): Promise<McpServerDto | null> {
  const rows = await db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.id, serverId), eq(mcpServers.workspaceId, workspaceId)))
    .limit(1)
  const row = rows[0]
  if (!row) return null

  // Any credential-affecting change resets the connection honestly.
  const auth = patch.auth !== undefined ? sealAuth(env, patch.auth, workspaceId, row.id) : null
  const resets = patch.url !== undefined || auth !== null

  const updated = await db
    .update(mcpServers)
    .set({
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.url !== undefined ? { url: patch.url } : {}),
      ...(auth !== null ? { authType: auth.authType, authSecret: auth.authSecret } : {}),
      ...(resets ? { status: 'disconnected', serverInfo: null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(mcpServers.id, row.id))
    .returning()
  return updated[0] ? serialize(updated[0]) : null
}

/* ------------------------------------------------------------------ */
/* Connect / test / list / disconnect                                  */
/* ------------------------------------------------------------------ */

async function findRow(db: McpDatabase, workspaceId: string, serverId: string) {
  const rows = await db
    .select()
    .from(mcpServers)
    .where(and(eq(mcpServers.id, serverId), eq(mcpServers.workspaceId, workspaceId)))
    .limit(1)
  const row = rows[0]
  if (!row) throw new AppError('NOT_FOUND', 'MCP server not found.', 404)
  return row
}

/**
 * Connect + initialize: performs the MCP handshake over the guarded
 * transport, records serverInfo, flips status honestly. A failure
 * stores the user-safe reason and sets 'error' — never a silent fake.
 */
export async function testMcpServer(
  db: McpDatabase,
  env: McpEnv,
  workspaceId: string,
  serverId: string,
): Promise<McpServerDto> {
  const row = await findRow(db, workspaceId, serverId)
  let client: Client | null = null
  try {
    client = await connectClient(env, row)
    // getServerVersion is sync — the handshake populated it.
    const info = client.getServerVersion()
    const updated = await db
      .update(mcpServers)
      .set({
        status: 'connected',
        lastError: null,
        serverInfo: { name: info?.name ?? null, version: info?.version ?? null },
        updatedAt: new Date(),
      })
      .where(eq(mcpServers.id, row.id))
      .returning()
    return updated[0] ? serialize(updated[0]) : serialize(row)
  } catch (error) {
    const reason = userSafeError(error)
    const updated = await db
      .update(mcpServers)
      .set({ status: 'error', lastError: reason, updatedAt: new Date() })
      .where(eq(mcpServers.id, row.id))
      .returning()
    return updated[0] ? serialize(updated[0]) : serialize(row)
  } finally {
    await closeClient(client)
  }
}

/** List tools from a connected server, namespaced by server identity (T024). */
export async function listMcpTools(
  db: McpDatabase,
  env: McpEnv,
  workspaceId: string,
  serverId: string,
): Promise<McpToolDto[]> {
  const row = await findRow(db, workspaceId, serverId)
  let client: Client | null = null
  try {
    client = await connectClient(env, row)
    const result = await withTimeout(client.listTools(), MCP_CALL_TIMEOUT_MS, 'mcp listTools')
    const slug = slugForServer(row.name, row.id)
    return (result.tools ?? []).slice(0, 200).map((tool) =>
      mcpToolDtoSchema.parse({
        name: String(tool.name ?? '').slice(0, 200),
        description:
          typeof tool.description === 'string' ? tool.description.slice(0, 4_000) : null,
        namespacedName: `${slug}__${String(tool.name ?? '').slice(0, 200)}`,
        // Untrusted remote hint — display only, never an access decision.
        readOnlyHint:
          typeof (tool as { annotations?: { readOnlyHint?: boolean } }).annotations?.readOnlyHint ===
          'boolean'
            ? (tool as { annotations?: { readOnlyHint?: boolean } }).annotations!.readOnlyHint!
            : null,
      }),
    )
  } finally {
    await closeClient(client)
  }
}

/** Disconnect: reset to the honest disconnected state, clear serverInfo. */
export async function disconnectMcpServer(
  db: McpDatabase,
  workspaceId: string,
  serverId: string,
): Promise<McpServerDto | null> {
  const row = await findRow(db, workspaceId, serverId)
  const updated = await db
    .update(mcpServers)
    .set({ status: 'disconnected', lastError: null, serverInfo: null, updatedAt: new Date() })
    .where(eq(mcpServers.id, row.id))
    .returning()
  return updated[0] ? serialize(updated[0]) : null
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

/** Stable, collision-free slug for namespacing: name (slugified) + short id. */
export function slugForServer(name: string, id: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const suffix = id.replace(/-/g, '').slice(0, 6)
  return `${base || 'server'}-${suffix}`
}

function userSafeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Connection failed.'
  // Never leak URLs with embedded credentials or long stack noise.
  return message.replace(/https?:\/\/[^\s]+/g, '[url]').slice(0, 1_000)
}

async function closeClient(client: Client | null): Promise<void> {
  if (!client) return
  try {
    await withTimeout(client.close(), 2_000, 'mcp close')
  } catch {
    /* close is best-effort */
  }
}

