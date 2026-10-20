/**
 * Plugin domain types (milestone 06).
 *
 * A plugin is a typed catalogue entry plus, for built-ins, a local
 * adapter registered with the dispatcher. Enabling a bundled plugin
 * enables code that already ships with the app — there is no download,
 * install, or remote code execution. External examples are honest
 * "integration required" descriptions until a real integration exists.
 *
 * Catalog metadata (the manifest) is static and separate from runtime
 * state (enabled flags, per-agent allow lists, thread grants, run
 * receipts), which lives in the plugins store.
 */

export type PluginCategory =
  | 'documents'
  | 'data'
  | 'productivity'
  | 'development'
  | 'custom'

export type PluginCapability =
  | 'documents.create'
  | 'documents.save'
  | 'data.analyze'
  | 'library.search'
  | 'library.attach'

export type PluginExecutionType = 'local-built-in' | 'integration-required'

export interface PluginManifest {
  id: string
  name: string
  version: string
  author: string
  /** One-line purpose shown on the card. */
  description: string
  category: PluginCategory
  capabilities: PluginCapability[]
  /** Human-readable requested scopes, shown before enabling. */
  scopes: string[]
  execution: PluginExecutionType
  /** Built-ins ship with the app; enabling never installs anything. */
  builtin: boolean
  /** For integration-required entries: what a real integration needs. */
  requirements?: string
}

/** What a card/detail can truthfully claim about a plugin right now. */
export type PluginAvailability =
  | 'available-builtin'
  | 'enabled'
  | 'integration-required'
  | 'error'

/** Where a plugin run happened — receipts render inside that thread.
 * `chat` covers ordinary conversations; `temporary` marks session-only
 * threads whose grants and receipts are never persisted (m07). */
export type PluginThreadRef =
  | { kind: 'work'; taskId: string }
  | { kind: 'agent'; agentId: string; conversationId: string }
  | { kind: 'chat'; conversationId: string; temporary: boolean }

export type PluginRunStatus =
  | 'proposed'
  | 'running'
  | 'success'
  | 'error'
  | 'revoked'
  | 'cancelled'

/**
 * The typed record of one plugin action. Failed and revoked runs are
 * receipts too — a receipt is an honest history, never a success badge.
 */
export interface PluginRunReceipt {
  /** Run id (request and run share it). */
  id: string
  pluginId: string
  capability: PluginCapability
  actionLabel: string
  status: PluginRunStatus
  at: number
  finishedAt: number | null
  summary?: string
  detail?: string
  artifactId?: string | null
  thread: PluginThreadRef | null
  error?: string
}

/** Bounded receipt history kept in local storage. */
export const MAX_PLUGIN_RECEIPTS = 100

export const PLUGIN_CATEGORY_LABELS: Record<PluginCategory, string> = {
  documents: 'Documents',
  data: 'Data',
  productivity: 'Productivity',
  development: 'Development',
  custom: 'Custom',
}
