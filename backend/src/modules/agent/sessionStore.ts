import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { isValidRootDir } from '@uni/contracts'
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
 * A rootDir that is not a safe relative path can never reach the
 * filesystem, whatever stored it (F01): fail closed, loudly.
 */
export class UnsafeRootDirError extends Error {
  constructor(readonly rootDir: string) {
    super('Session rootDir is not a safe relative path.')
    this.name = 'UnsafeRootDirError'
  }
}

/**
 * The server-derived unique rootDir for a NEW session (F01): always
 * prefixed with the session's own id, so two sessions can never share a
 * root and a client can never aim one at another session's directory. A
 * client-provided value (already contract-validated) nests INSIDE that
 * owned directory as sub-organization, never beside it.
 */
export function deriveSessionRootDir(sessionId: string, clientRootDir?: string): string {
  const base = `sessions/${sessionId}`
  if (clientRootDir == null || clientRootDir.trim().length === 0) return base
  if (!isValidRootDir(clientRootDir)) throw new UnsafeRootDirError(clientRootDir)
  return `${base}/${clientRootDir.replace(/\/+$/, '')}`
}

/**
 * The absolute session root for a row: <agentRoot>/<workspaceId>/<rootDir>.
 * rootDir is re-validated here at runtime — the contract check guards the
 * API, this check guards the filesystem against any row that predates it
 * or bypassed it — and the joined path is verified to stay inside the
 * owning workspace's directory. The gate re-verifies containment again
 * at every tool call (symlinks included).
 */
export function sessionRootPath(agentRoot: string, workspaceId: string, rootDir: string): string {
  if (!isValidRootDir(rootDir)) throw new UnsafeRootDirError(rootDir)
  const base = path.resolve(agentRoot, workspaceId)
  const root = path.resolve(base, rootDir)
  if (root !== base && !root.startsWith(`${base}${path.sep}`)) {
    throw new UnsafeRootDirError(rootDir)
  }
  return root
}

/**
 * Provision the session root before tools run (lazy, idempotent): a
 * fresh session's first write/list/bash must not fail with ENOENT, and
 * an unused session still owns no directory until execution needs one.
 * An unwritable agent root fails the run honestly (the catch belongs to
 * the caller's terminal handling) rather than crashing the process.
 */
export async function ensureSessionRoot(root: string): Promise<void> {
  try {
    await fsp.mkdir(root, { recursive: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      // Re-raise as a typed error the run engine maps to a terminal.
      throw new UnsafeAgentRootError(root, (error as Error).message)
    }
    throw error
  }
}

/** The agent root itself is not usable (permissions/path). Fail honest. */
export class UnsafeAgentRootError extends Error {
  constructor(readonly root: string, readonly causeMessage: string) {
    super(`The agent storage root is not usable: ${causeMessage}`)
    this.name = 'UnsafeAgentRootError'
  }
}
