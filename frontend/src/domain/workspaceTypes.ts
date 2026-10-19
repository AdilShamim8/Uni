/**
 * Workspace domain types — Agents, Work tasks, Library artifacts.
 *
 * These slices live in their own stores and their own persisted namespace
 * (`universe:workspace:v1`), separate from the schema-v1 chat state in
 * `universe:data`. Adding workspace data can never quarantine or rewrite
 * existing conversations, preferences, or provider profiles.
 */

import type { AttachmentMeta, ToolId } from './types'

/* ------------------------------------------------------------------ */
/* Work — task instances and their execution log                        */
/* ------------------------------------------------------------------ */

/**
 * Deterministic local task state machine. Valid transitions:
 *
 *   draft → queued → running → needs_input | ready_for_review → completed
 *
 * with paused / cancelled / failed as support states. A task can never
 * reach `completed` straight from `cancelled` or `failed` — those require
 * a deliberate path back through `queued` (retry) or `draft` (re-plan).
 */
export type TaskStatus =
  | 'draft'
  | 'queued'
  | 'running'
  | 'needs_input'
  | 'ready_for_review'
  | 'completed'
  | 'paused'
  | 'cancelled'
  | 'failed'

export type TaskDeliverable = 'research-report' | 'data-review' | 'email-draft'

/** How a task executes: local simulation or a live BYOK drafting request. */
export type WorkTaskMode = 'demo' | 'ai-draft'

/**
 * The connected model an AI-draft task sends its single drafting request
 * to. Labels are snapshotted at configuration time so the task's history
 * stays readable even if the profile is later renamed or removed.
 */
export interface AiDraftModel {
  providerId: string
  modelId: string
  providerLabel: string
  modelLabel: string
}

/** Configuration for the AI-draft mode — never contains credentials. */
export interface AiDraftConfig {
  model: AiDraftModel
  /** Extra drafting instructions beyond the goal and agent profile. */
  instructions: string
  /** Explicitly selected text context sent with the request. */
  contextText: string
}

export type TaskEventKind =
  | 'created'
  | 'status'
  | 'plan'
  | 'tool'
  | 'info'
  | 'input_request'
  | 'input_response'
  | 'output'
  | 'note'

/**
 * One entry in a task's activity log. Events belonging to a run carry that
 * run's id so a cancelled run's late timer events can be rejected.
 */
export interface TaskEvent {
  id: string
  /** null for user actions (edits, manual status changes). */
  runId: string | null
  at: number
  kind: TaskEventKind
  label: string
  detail?: string
}

/**
 * A message-style entry on a Work task's conversational thread
 * (milestone 06): the original goal is projected from `goal`, follow-ups
 * and assistant acknowledgments are stored here with stable ids.
 */
export interface TaskMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  at: number
  status: 'complete' | 'streaming' | 'stopped' | 'error'
  error?: string | null
  /** Concise prefix like "Revising" or "Noted". */
  statusPrefix?: string | null
  /** How an assistant message was produced — never fabricated. */
  provenance?: 'demo' | 'live' | null
  /** Effective model label for live messages. */
  modelLabel?: string | null
}

/**
 * The editable review deliverable produced at `ready_for_review`.
 *
 * `provenance` records honestly how the content came to exist: demo runs
 * produce simulated fixtures; AI-draft runs stream provider-generated text
 * (with the effective model snapshotted in `generatedBy`). Partial output
 * kept after a stop or failure is flagged with `stoppedPartial`.
 */
export interface TaskReport {
  template: 'research' | 'data' | 'email' | 'draft'
  markdown: string
  /** Library artifact created from this report, once it is saved. */
  artifactId: string | null
  provenance: 'demo-simulation' | 'provider-generated'
  /** Effective model for provider-generated reports; null for demo. */
  generatedBy: AiDraftModel | null
  /** True when user-selected context was included in the request. */
  contextIncluded: boolean
  /** True when this content is a preserved partial from a stopped/failed run. */
  stoppedPartial: boolean
  /** Run that produced this report; null on reports saved before milestone 06. */
  runId?: string | null
}

/** A report archived when a revision replaced it. Bounded history. */
export interface ArchivedReport extends TaskReport {
  savedAt: number
}

export interface WorkTask {
  id: string
  title: string
  goal: string
  deliverable: TaskDeliverable
  agentId: string | null
  projectId: string | null
  /** Local attachment metadata (names/sizes), never file contents. */
  attachments: AttachmentMeta[]
  status: TaskStatus
  /** Execution mode — local demo simulation or live BYOK AI draft. */
  mode: WorkTaskMode
  /** AI-draft configuration; null for demo tasks. Never holds credentials. */
  draftConfig: AiDraftConfig | null
  createdAt: number
  updatedAt: number
  events: TaskEvent[]
  /** Active run id; guards against late events from stale runs. */
  currentRunId: string | null
  /** Index of the next plan step to execute (persisted for resume). */
  planCursor: number
  /** Answers given to this execution's input requests (persisted for resume). */
  runAnswers: string[]
  /** True when a reload interrupted a running simulation. */
  interrupted: boolean
  report: TaskReport | null
  /** Pending question from a `needs_input` pause. */
  inputRequest: { question: string; options: string[] } | null
  /** Last run failure message (AI-draft requests); cleared on the next run. */
  error: string | null
  /**
   * Conversational thread entries (milestone 06). Older tasks default to
   * `[]` on load — the projection renders their goal/events/report as a
   * readable transcript without rerunning anything.
   */
  messages: TaskMessage[]
  /** Prior outputs preserved when a revision replaced them (bounded). */
  previousReports: ArchivedReport[]
}

/* ------------------------------------------------------------------ */
/* Agents — reusable instruction profiles                              */
/* ------------------------------------------------------------------ */

export type AgentCategory = 'personal' | 'specialist'

export interface AgentProfile {
  id: string
  name: string
  description: string
  instructions: string
  category: AgentCategory
  /** Provider/model preference — resolved explicitly at send time. */
  providerId: string | null
  modelId: string | null
  tools: ToolId[]
  projectIds: string[]
  starters: string[]
  archived: boolean
  /** Built-in profiles cannot be deleted, only archived or edited. */
  builtin: boolean
  createdAt: number
  updatedAt: number
}

/** User-authored memory note attached to an agent's memory. */
export interface MemoryNote {
  id: string
  agentId: string
  text: string
  createdAt: number
  updatedAt: number
}

export type AgentThreadEventKind =
  | 'assignment'
  | 'memory_note'
  | 'plugin_action'
  | 'routine'
  | 'note'

/**
 * A structured entry on an employee's thread (milestone 06): assignments,
 * memory confirmations, plugin actions, routines. Links reference the
 * canonical records — never copies of them.
 */
export interface AgentThreadEvent {
  id: string
  agentId: string
  kind: AgentThreadEventKind
  at: number
  label: string
  detail?: string
  taskId?: string | null
  noteId?: string | null
  scheduleId?: string | null
  /** Dispatcher run id when this event records a plugin action. */
  pluginRunId?: string | null
}

export type ScheduleCadence = 'once' | 'recurring' | 'event'

/**
 * A locally saved schedule draft. Execution is unavailable in this
 * milestone — drafts are labeled honestly and never shown as "active".
 */
export interface ScheduleDraft {
  id: string
  agentId: string
  name: string
  cadence: ScheduleCadence
  timezone: string
  instructions: string
  /** When should the agent notify (described by the user, not evaluated). */
  condition: string
  /** The user's intent to enable it once a runtime exists. */
  enabledIntent: boolean
  createdAt: number
  updatedAt: number
}

/* ------------------------------------------------------------------ */
/* Library — shared artifacts and lightweight project context           */
/* ------------------------------------------------------------------ */

export type ArtifactKind = 'report' | 'email' | 'data' | 'notes' | 'document' | 'code'

/**
 * A saved point in an artifact's history. Working drafts are kept
 * separately from snapshots — a version is never created per keystroke,
 * only on explicit saves, named snapshots, and restores.
 */
export interface ArtifactVersion {
  id: string
  label: string
  createdAt: number
  markdown: string
  kind: 'initial' | 'snapshot' | 'restore'
}

/** Where an artifact came from — links back without overwriting sources. */
export interface ArtifactSource {
  conversationId: string | null
  messageId: string | null
  taskId: string | null
}

export interface Artifact {
  id: string
  title: string
  kind: ArtifactKind
  taskId: string | null
  projectId: string | null
  /** Latest committed content (the newest version's markdown). */
  markdown: string
  /**
   * Unsaved working draft, autosaved separately from snapshots. `null`
   * means the editing surface matches the committed content.
   */
  workingDraft: string | null
  draftUpdatedAt: number | null
  /** Bounded version history, newest first. */
  versions: ArtifactVersion[]
  source: ArtifactSource | null
  createdAt: number
  updatedAt: number
  /** How this artifact was produced — always shown in the UI. */
  provenance:
    | 'demo-simulation'
    | 'user-authored'
    | 'model-output'
    | 'local-computation'
    | 'provider-generated'
  /** For provider-generated artifacts: the effective model snapshot. */
  generatedBy: AiDraftModel | null
}

export interface Project {
  id: string
  name: string
  description: string
  createdAt: number
}

/* ------------------------------------------------------------------ */
/* Persisted workspace envelope                                         */
/* ------------------------------------------------------------------ */

export interface WorkspaceState {
  version: 1
  savedAt: number
  agents: AgentProfile[]
  memoryNotes: MemoryNote[]
  schedules: ScheduleDraft[]
  tasks: WorkTask[]
  artifacts: Artifact[]
  projects: Project[]
}
