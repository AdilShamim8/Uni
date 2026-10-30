import type { PersistedState } from '@/domain/types'
import type { AgentsSlice, WorkSlice, LibrarySlice, KnowledgeSlice } from './workspaceStorage'
import {
  isAgentsSlice,
  isWorkSlice,
  isLibrarySlice,
  isKnowledgeSlice,
  saveAgentsSlice,
  saveWorkSlice,
  saveLibrarySlice,
  saveKnowledgeSlice,
  clearKnowledgeSlice,
} from './workspaceStorage'
import { isPersistedState, savePersisted } from './localStorage'
import { useAppStore, serializeAppState } from '@/state/store'
import { useAgentsStore } from '@/state/agentsStore'
import { useWorkStore } from '@/state/workStore'
import { useLibraryStore } from '@/state/libraryStore'
import { useKnowledgeStore } from '@/state/knowledgeStore'
import { useContextStore, type ContextState } from '@/state/contextStore'
import { usePluginsStore } from '@/state/pluginsStore'

/**
 * Versioned workspace backup and restore (m07, fixes F08).
 *
 * Scope — exactly what the Settings page documents:
 *   INCLUDED   chats (temporary chats never are), preferences, provider
 *              profiles, Work tasks/events, employees + memory notes +
 *              routines + thread events, Library artifacts/projects,
 *              knowledge-base documents + chunks, context selections,
 *              plugin configuration + receipts.
 *   EXCLUDED   API keys and every credential, temporary conversations,
 *              ephemeral UI state, drafts not committed to a store,
 *              active controllers.
 *
 * Restore validates every slice with the SAME validators the stores use
 * on load (so migrations and quarantine behavior apply), snapshots the
 * current raw data first (recoverable), writes slice-by-slice, and lets
 * the caller reload — the stores re-hydrate through their existing
 * paths, and running Work is demoted to paused+interrupted exactly like
 * a reload demotes it.
 */

export interface WorkspaceBackup {
  kind: 'uni-workspace-backup'
  version: 1
  savedAt: number
  payload: {
    app: PersistedState
    agents: AgentsSlice
    work: WorkSlice
    library: LibrarySlice
    /** Optional: backups from before the knowledge base parse without it. */
    knowledge?: KnowledgeSlice
    context: { version: 1; savedAt: number; payload: ContextState }
    plugins: {
      version: 1
      savedAt: number
      payload: {
        enabled: string[]
        agentAllowed: Record<string, string[]>
        threadGrants: Record<string, string[]>
        receipts: ReturnType<typeof usePluginsStore.getState>['receipts']
      }
    }
  }
}

export interface BackupCounts {
  conversations: number
  providers: number
  tasks: number
  agents: number
  memoryNotes: number
  artifacts: number
  projects: number
  knowledgeDocuments: number
  enabledPlugins: number
  receipts: number
}

export function backupCountsOf(backup: WorkspaceBackup): BackupCounts {
  return {
    conversations: backup.payload.app.conversations.length,
    providers: backup.payload.app.providers.length,
    tasks: backup.payload.work.tasks.length,
    agents: backup.payload.agents.agents.length,
    memoryNotes: backup.payload.agents.memoryNotes.length,
    artifacts: backup.payload.library.artifacts.length,
    projects: backup.payload.library.projects.length,
    knowledgeDocuments: backup.payload.knowledge?.documents.length ?? 0,
    enabledPlugins: backup.payload.plugins.payload.enabled.length,
    receipts: backup.payload.plugins.payload.receipts.length,
  }
}

export function buildWorkspaceBackup(): WorkspaceBackup {
  const now = Date.now()
  const agents = useAgentsStore.getState()
  const plugins = usePluginsStore.getState()
  return {
    kind: 'uni-workspace-backup',
    version: 1,
    savedAt: now,
    payload: {
      app: serializeAppState(useAppStore.getState()),
      agents: {
        agents: Object.values(agents.agents),
        memoryNotes: Object.values(agents.memoryNotes),
        schedules: Object.values(agents.schedules),
        threadEvents: Object.values(agents.threadEvents),
      },
      work: { tasks: Object.values(useWorkStore.getState().tasks) },
      library: {
        artifacts: Object.values(useLibraryStore.getState().artifacts),
        projects: Object.values(useLibraryStore.getState().projects),
      },
      knowledge: {
        documents: Object.values(useKnowledgeStore.getState().documents),
        chunks: Object.values(useKnowledgeStore.getState().chunks).flat(),
      },
      context: {
        version: 1,
        savedAt: now,
        payload: {
          version: 1,
          savedAt: now,
          selections: useContextStore.getState().selections,
        },
      },
      plugins: {
        version: 1,
        savedAt: now,
        payload: {
          enabled: Object.keys(plugins.enabled),
          agentAllowed: plugins.agentAllowed,
          threadGrants: plugins.threadGrants,
          receipts: plugins.receipts,
        },
      },
    },
  }
}

export type BackupParseResult =
  | { ok: true; backup: WorkspaceBackup; counts: BackupCounts }
  | { ok: false; error: string }

function isContextState(value: unknown): value is ContextState {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ContextState).selections === 'object' &&
    (value as ContextState).selections !== null
  )
}

export function parseWorkspaceBackup(raw: string): BackupParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'That file is not valid JSON — nothing was changed.' }
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return { ok: false, error: 'That file is not a workspace backup — nothing was changed.' }
  }
  const candidate = parsed as Partial<WorkspaceBackup> & { kind?: string; payload?: unknown }
  if (candidate.kind !== 'uni-workspace-backup' || candidate.version !== 1) {
    return { ok: false, error: 'That file is not a Uni workspace backup (version 1) — nothing was changed.' }
  }
  const payload = candidate.payload
  if (typeof payload !== 'object' || payload === null) {
    return { ok: false, error: 'The backup payload is missing — nothing was changed.' }
  }
  const p = payload as Record<string, unknown>

  if (!isPersistedState(p.app)) {
    return { ok: false, error: 'The chats-and-settings section failed validation — nothing was changed.' }
  }
  if (!isAgentsSlice(p.agents)) {
    return { ok: false, error: 'The employees section failed validation — nothing was changed.' }
  }
  if (!isWorkSlice(p.work)) {
    return { ok: false, error: 'The Work section failed validation — nothing was changed.' }
  }
  if (!isLibrarySlice(p.library)) {
    return { ok: false, error: 'The Library section failed validation — nothing was changed.' }
  }
  // Knowledge is optional (older backups predate it); present-but-invalid
  // is still rejected like every other slice.
  if (p.knowledge !== undefined && !isKnowledgeSlice(p.knowledge)) {
    return { ok: false, error: 'The knowledge base section failed validation — nothing was changed.' }
  }
  const context = p.context as { version?: number; savedAt?: number; payload?: unknown } | undefined
  if (!context || context.version !== 1 || !isContextState(context.payload)) {
    return { ok: false, error: 'The context selections section failed validation — nothing was changed.' }
  }
  const plugins = p.plugins as WorkspaceBackup['payload']['plugins'] | undefined
  if (
    !plugins ||
    plugins.version !== 1 ||
    typeof plugins.payload !== 'object' ||
    plugins.payload === null ||
    !Array.isArray(plugins.payload.enabled) ||
    !Array.isArray(plugins.payload.receipts)
  ) {
    return { ok: false, error: 'The plugins section failed validation — nothing was changed.' }
  }

  const backup: WorkspaceBackup = {
    kind: 'uni-workspace-backup',
    version: 1,
    savedAt: candidate.savedAt ?? Date.now(),
    payload: {
      app: p.app,
      agents: p.agents,
      work: p.work,
      library: p.library,
      knowledge: p.knowledge,
      context: { version: 1, savedAt: context.savedAt ?? 0, payload: context.payload as ContextState },
      plugins,
    },
  }
  return { ok: true, backup, counts: backupCountsOf(backup) }
}

/* ------------------------------------------------------------------ */
/* Restore                                                             */
/* ------------------------------------------------------------------ */

const KEYS = [
  'universe:data',
  'universe:agents:v1',
  'universe:work:v1',
  'universe:library:v1',
  'universe:knowledge:v1',
  'universe:context:v1',
  'universe:plugins:v1',
] as const

/**
 * Write a validated backup over the current data.
 *
 * - Every current raw slice is snapshotted first under
 *   `universe:pre-import:<key>:<timestamp>` — recoverable by hand.
 * - Slices are written through the stores' own savers so the on-disk
 *   format matches what `initialize()` expects.
 * - Credentials are never touched: the app slice's serializer never
 *   includes them, and `universe:credentials:v1` is not in KEYS.
 */
export function restoreWorkspaceBackup(backup: WorkspaceBackup): { ok: boolean; error?: string } {
  try {
    const stamp = Date.now()
    for (const key of KEYS) {
      const raw = localStorage.getItem(key)
      if (raw !== null) {
        localStorage.setItem(`universe:pre-import:${key}:${stamp}`, raw)
      }
    }

    savePersisted(backup.payload.app)
    const agentsOk = saveAgentsSlice(backup.payload.agents)
    const workOk = saveWorkSlice(backup.payload.work)
    const libraryOk = saveLibrarySlice(backup.payload.library)
    // Restore REPLACES the workspace: a backup without a knowledge section
    // (pre-knowledge-era) empties the knowledge base too — nothing stale
    // survives a restore silently.
    const knowledgeOk = backup.payload.knowledge
      ? saveKnowledgeSlice(backup.payload.knowledge)
      : (clearKnowledgeSlice(), true)
    localStorage.setItem(
      'universe:context:v1',
      JSON.stringify(backup.payload.context),
    )
    localStorage.setItem(
      'universe:plugins:v1',
      JSON.stringify(backup.payload.plugins),
    )
    if (!agentsOk || !workOk || !libraryOk || !knowledgeOk) {
      return {
        ok: false,
        error: 'Local storage rejected part of the restore (quota or privacy mode). Your snapshot is preserved — nothing was half-written silently.',
      }
    }
    return { ok: true }
  } catch {
    return {
      ok: false,
      error: 'The restore could not be written. Existing data was left untouched where possible.',
    }
  }
}
