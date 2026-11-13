/**
 * The unattended allowlist vocabulary — adapted from abacusai-bot
 * packages/agent/src/tool-policy.ts (UNATTENDED_TOOLS /
 * UNATTENDED_EXCLUDED_TOOLS), trimmed to the tools a Uni server session
 * can register.
 *
 * A routine nobody is watching never asks: it is refused everything
 * except what this table names under its rule. The table is deliberate,
 * not a default — adding a tool here is a decision someone makes.
 */

/** The rule an unattended tool runs under. */
export type UnattendedRule =
  | 'allow'
  /** Reads confined to the routine's session root, never a secret file. */
  | 'workspace-read'
  /** Only the exact origins the routine was set up to read. */
  | 'sources';

/** The allowlist itself: tool name → rule. Not in the table = refused. */
export const UNATTENDED_TOOLS: Readonly<Record<string, UnattendedRule>> = {
  current_time: 'allow',
  exit_plan_mode: 'allow',
  todo: 'allow',
  // P10 — reads only this workspace's own indexed documents with
  // bounded excerpts; no filesystem, no network, no side effects.
  knowledge_search: 'allow',
  read: 'workspace-read',
  list: 'workspace-read',
  grep: 'workspace-read',
};

/** Tools explicitly named as excluded, for message clarity. */
export const UNATTENDED_EXCLUDED_TOOLS: Readonly<Record<string, string>> = {
  bash: 'a routine never runs shell commands unattended',
  write: 'a routine never writes files on its own',
  edit: 'a routine never edits files on its own',
  web_fetch:
    'a routine fetches only the exact pages it was set up to read, and none are configured here',
};

/**
 * The origins an unattended run may fetch: none in Uni today (the policy
 * shape exists so the scheduler can carry it when sources land).
 */
export interface UnattendedPolicy {
  /** Whether files under the session root may be read at all. */
  files: boolean
  /** Exact URL prefixes the run may fetch (empty = none). */
  sources: readonly string[]
}

export const DEFAULT_UNATTENDED_POLICY: UnattendedPolicy = {
  files: true,
  sources: [],
};

/** Whether a URL is under one of the allowed source prefixes. */
export function sourceAllows(
  rawUrl: string,
  sources: readonly string[],
  /** Kept for parity: unattended fetches are always held upstream. */
  _held: boolean,
): boolean {
  if (sources.length === 0) return false
  return sources.some((source) => rawUrl === source || rawUrl.startsWith(`${source}/`) || rawUrl.startsWith(`${source}?`))
}
