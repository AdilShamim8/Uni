import { eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { mcpServers } from '../../db/schema.js'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { withTimeout } from '../../lib/timeout.js'
import { createGuardedFetch } from '../../lib/guardedTransport.js'
import { decryptSecret, parseMasterKey } from '../../lib/secretBox.js'
import { TOOL_OUTPUT_CAP, type ToolOutcome } from '../agent/roster.js'
import { slugForServer, type McpEnv } from './mcp.service.js'

/**
 * MCP tool execution (T024): resolve a NAMESPACED tool name to its
 * workspace server, execute over the guarded time-bounded transport,
 * and return a bounded ToolOutcome.
 *
 * Bounds and safety:
 * - The namespace prefix must match exactly one configured server
 *   (slug collision across servers is impossible by construction —
 *   the slug embeds the row id's first 6 chars; a mismatch is an
 *   honest failure, never a fuzzy match).
 * - Every round trip is time-bounded (10s) and honors the run's abort
 *   signal: a cancelled run cancels the remote call.
 * - The remote's result is rendered to text and capped at
 *   TOOL_OUTPUT_CAP before the model sees it; content items are
 *   labelled by type and never executed.
 * - Server rows are read per call (no stale tool cache), so disabling
 *   or reconfiguring a server applies to the next call immediately.
 */

const MCP_CALL_TIMEOUT_MS = 10_000
/** Hard cap on serialized result text (matches the roster's cap). */
const RESULT_TEXT_CAP = TOOL_OUTPUT_CAP

export async function callMcpToolForSession(
  db: NodePgDatabase<typeof schema>,
  env: McpEnv,
  workspaceId: string,
  namespacedTool: string,
  args: Record<string, unknown>,
  signal: AbortSignal,
): Promise<ToolOutcome> {
  const separator = namespacedTool.indexOf('__')
  if (separator <= 0) {
    return { ok: false, output: 'MCP tool names must be <server>__<tool>.' }
  }
  const slug = namespacedTool.slice(0, separator)
  const remoteName = namespacedTool.slice(separator + 2)

  // Slug match only among THIS workspace's servers; a stale slug (the
  // server was renamed/deleted) is an honest failure.
  const rows = await db
    .select()
    .from(mcpServers)
    .where(eq(mcpServers.workspaceId, workspaceId))
  const server = rows.find((row) => slugForServer(row.name, row.id) === slug)
  if (!server) {
    return { ok: false, output: `No MCP server matches "${slug}" in this workspace.` }
  }

  // Bounded argument payload: refuse absurd inputs before the wire.
  const serializedArgs = JSON.stringify(args ?? {})
  if (serializedArgs.length > 100_000) {
    return { ok: false, output: 'MCP tool arguments exceed the 100,000-character limit.' }
  }

  let client: Client | null = null
  try {
    const guardedFetch = createGuardedFetch(env as never, MCP_CALL_TIMEOUT_MS)
    const url = new URL(server.url)
    const headers: Record<string, string> = {}
    if (server.authType === 'bearer' && server.authSecret) {
      const masterKey = parseMasterKey(env.CREDENTIAL_MASTER_KEY)
      const { plaintext } = decryptSecret(masterKey, server.authSecret, {
        workspaceId,
        providerId: `mcp:${server.id}`,
      })
      headers.authorization = `Bearer ${plaintext}`
    }
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: { headers },
      fetch: guardedFetch as unknown as typeof globalThis.fetch,
    })
    client = new Client({ name: 'uni-backend', version: '1.0.0' }, { capabilities: {} })
    await withTimeout(client.connect(transport), MCP_CALL_TIMEOUT_MS, 'mcp connect')

    // The run's abort signal rides the request options: a cancelled
    // run aborts the in-flight remote call.
    const result = await withTimeout(
      client.callTool({ name: remoteName, arguments: args }, undefined, { signal }),
      MCP_CALL_TIMEOUT_MS,
      'mcp callTool',
    )

    const rendered = renderResult(result)
    if (result.isError) {
      return { ok: false, output: bounded(rendered) }
    }
    return { ok: true, output: bounded(rendered) }
  } catch (error) {
    if (signal.aborted) {
      return { ok: false, output: 'The MCP call was cancelled.' }
    }
    const message = error instanceof Error ? error.message : 'MCP call failed.'
    return { ok: false, output: bounded(message.replace(/https?:\/\/[^\s]+/g, '[url]')) }
  } finally {
    if (client) {
      try {
        await withTimeout(client.close(), 2_000, 'mcp close')
      } catch {
        /* best-effort */
      }
    }
  }
}

/** Render an MCP result to text, labelling content types. */
function renderResult(result: unknown): string {
  const content = (result as { content?: unknown }).content
  if (!Array.isArray(content) || content.length === 0) return '(no content)'
  return content
    .map((item) => {
      const typed = item as { type?: unknown; text?: unknown }
      return typed.type === 'text' && typeof typed.text === 'string'
        ? typed.text
        : `[${String(typed.type ?? 'unknown')} content]`
    })
    .join('\n')
}

function bounded(text: string): string {
  return text.length > RESULT_TEXT_CAP
    ? `${text.slice(0, RESULT_TEXT_CAP)}\n…[truncated]`
    : text
}
