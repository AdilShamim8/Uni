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

/** The editable review deliverable produced at `ready_for_review`. */
export interface TaskReport {
  template: 'research' | 'data' | 'email'
  markdown: string
  /** Library artifact created from this report, once it is saved. */
  artifactId: string | null
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
  /** Execution mode — Work runs are local simulations in this milestone. */
  mode: 'demo'
  createdAt: number
  updatedAt: number
  events: TaskEvent[]
  /** Active run id; guards against late events from stale runs. */
  currentRunId: string | null
  /** True when a reload interrupted a running simulation. */
  interrupted: boolean
  report: TaskReport | null
  /** Pending question from a `needs_input` pause. */
  inputRequest: { question: string; options: string[] } | null
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

export type ArtifactKind = 'report' | 'email' | 'data' | 'notes'

export interface Artifact {
  id: string
  title: string
  kind: ArtifactKind
  taskId: string | null
  projectId: string | null
  markdown: string
  createdAt: number
  updatedAt: number
  /** How this artifact was produced — always shown in the UI. */
  provenance: 'demo-simulation' | 'user-authored'
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
