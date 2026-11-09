import { agentSessions } from '../../db/schema.js'

/**
 * The agent session store: where session roots live on disk and how rows
 * map to directories. File tools are confined to a per-session directory
 * under the workspace agent root (env-configurable), created lazily on
 * first use, never on session create — an unused session owns no
 * filesystem footprint.
 */

export { agentSessions }

/** Env override for tests and operators; the default sits under the data dir. */
export const AGENT_ROOT_ENV = 'UNI_AGENT_ROOT'

export function defaultAgentRoot(): string {
  const override = process.env[AGENT_ROOT_ENV]
  if (override && override.trim().length > 0) return override.trim()
  return '/var/lib/uni/agent'
}

/**
 * The absolute session root for a row: <agentRoot>/<workspaceId>/<rootDir>.
 * rootDir is contract-validated (relative, safe charset) so the join cannot
 * escape via ../ — and the gate re-verifies containment at every tool call.
 */
export function sessionRootPath(agentRoot: string, workspaceId: string, rootDir: string): string {
  const clean = rootDir.replace(/\/+$/, '')
  return `${agentRoot.replace(/\/+$/, '')}/${workspaceId}/${clean}`
}
