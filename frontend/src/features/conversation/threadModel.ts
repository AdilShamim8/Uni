import type { Conversation, MessageNode } from '@/domain/types'
import { activePath } from '@/domain/conversationTree'
import type {
  AgentThreadEvent,
  ArchivedReport,
  TaskMessage,
  TaskReport,
  WorkTask,
} from '@/domain/workspaceTypes'

/**
 * Conversation thread model (milestone 06) — one normalized entry list per
 * thread, projected from the existing stores. Sources of truth stay put:
 * chat messages remain chat-store nodes, Work events remain task events,
 * employee thread events remain agent records. This module only describes
 * how they combine into a readable thread.
 */

export type ThreadPurpose = 'chat' | 'work' | 'employee'

interface ThreadEntryBase {
  /** Stable id derived from the source record — dedup and ordering key. */
  entryId: string
  at: number
}

/** A chat-store message (employee threads reuse the real conversation). */
export interface ChatMessageEntry extends ThreadEntryBase {
  kind: 'chat_message'
  node: MessageNode
  conversation: Conversation
}

/** A Work-thread message (goal follow-ups, acknowledgments, streamed output). */
export interface WorkMessageEntry extends ThreadEntryBase {
  kind: 'work_message'
  message: TaskMessage
}

/**
 * Compact card linking to the canonical Work task. Live status/mode are
 * resolved from the work store at render time — the entry never snapshots
 * them, so the card can never go stale.
 */
export interface TaskCardEntry extends ThreadEntryBase {
  kind: 'task_card'
  taskId: string
  title: string
  goal: string
}

/** Clarification question with options plus a free-text answer. */
export interface ClarifyEntry extends ThreadEntryBase {
  kind: 'clarify'
  question: string
  options: string[]
}

export type ActivityTone = 'neutral' | 'accent' | 'warning' | 'success'

export interface ActivityLine {
  id: string
  at: number
  label: string
  detail?: string
  tone: ActivityTone
}

/** Collapsible plan/activity summary for one run. */
export interface ActivityEntry extends ThreadEntryBase {
  kind: 'activity'
  runId: string | null
  title: string
  lines: ActivityLine[]
  /** True while this run is the task's current live run. */
  live: boolean
}

/** Artifact/output card — opens the real record, never a copy. */
export interface OutputCardEntry extends ThreadEntryBase {
  kind: 'output_card'
  title: string
  artifactId: string | null
  /** Owning task — powers save/update/copy actions on the card (m07). */
  taskId: string
  provenance: TaskReport['provenance']
  generatedByLabel: string | null
  stoppedPartial: boolean
  /** Archived outputs come from `previousReports` (prior revisions). */
  archived: boolean
}

export type PluginActionStatus =
  | 'proposed'
  | 'running'
  | 'success'
  | 'error'
  | 'revoked'
  | 'cancelled'

/** Plugin action proposal or result, labeled with execution provenance. */
export interface PluginEntry extends ThreadEntryBase {
  kind: 'plugin'
  runId: string
  pluginId: string
  pluginName: string
  actionLabel: string
  status: PluginActionStatus
  summary?: string
  detail?: string
  artifactId?: string | null
}

export type StatusNoteTone = 'info' | 'warning' | 'error' | 'success'

export interface StatusNoteEntry extends ThreadEntryBase {
  kind: 'status_note'
  tone: StatusNoteTone
  label: string
  detail?: string
}

export type ThreadEntry =
  | ChatMessageEntry
  | WorkMessageEntry
  | TaskCardEntry
  | ClarifyEntry
  | ActivityEntry
  | OutputCardEntry
  | PluginEntry
  | StatusNoteEntry

/* ------------------------------------------------------------------ */
/* Ordering + deduplication                                            */
/* ------------------------------------------------------------------ */

/**
 * Combine entries from any sources, deduplicate by `entryId` (first
 * occurrence wins), and order by timestamp with a stable tie-break on the
 * order they were provided. Structured cards that share a timestamp with a
 * message keep their provided order.
 */
export function mergeThreadEntries(...groups: ThreadEntry[][]): ThreadEntry[] {
  const seen = new Set<string>()
  const merged: ThreadEntry[] = []
  for (const group of groups) {
    for (const entry of group) {
      if (seen.has(entry.entryId)) continue
      seen.add(entry.entryId)
      merged.push(entry)
    }
  }
  // Array.prototype.sort is stable in every runtime this app targets, so
  // same-timestamp entries keep their source order.
  return merged.sort((a, b) => a.at - b.at)
}

/** Find an entry by id (tests + inspector helpers). */
export function findEntry(entries: ThreadEntry[], entryId: string): ThreadEntry | undefined {
  return entries.find((entry) => entry.entryId === entryId)
}

/* ------------------------------------------------------------------ */
/* Work projection                                                     */
/* ------------------------------------------------------------------ */

const ACTIVITY_EVENT_KINDS = new Set(['plan', 'tool', 'info', 'input_response', 'status'])

function activityTone(kind: string): ActivityTone {
  if (kind === 'input_response') return 'success'
  if (kind === 'tool') return 'accent'
  return 'neutral'
}

function reportModelLabel(
  report: TaskReport | ArchivedReport,
): string | null {
  return report.generatedBy
    ? `${report.generatedBy.modelLabel} — ${report.generatedBy.providerLabel}`
    : null
}

/**
 * Project a Work task into a readable thread — a pure function over stored
 * state. It never mutates the task, reruns anything, or duplicates records:
 * existing tasks (created before milestone 06, without `messages`) render
 * their goal, events, and report as a transcript.
 */
export function projectWorkThread(task: WorkTask): ThreadEntry[] {
  const entries: ThreadEntry[] = []

  // 1. The original goal is the thread's opening user message.
  const goalText = task.goal.trim() || task.title.trim()
  if (goalText) {
    entries.push({
      kind: 'work_message',
      entryId: `work:goal:${task.id}`,
      at: task.createdAt,
      message: {
        id: `goal-${task.id}`,
        role: 'user',
        content: goalText,
        at: task.createdAt,
        status: 'complete',
      },
    })
  }

  // 2. Conversational messages (follow-ups, acknowledgments).
  for (const message of task.messages ?? []) {
    entries.push({
      kind: 'work_message',
      entryId: `work:msg:${message.id}`,
      at: message.at,
      message,
    })
  }

  // 3. Events — grouped per run into collapsible activity cards. The
  //    `created` event is represented by the goal message; a pending input
  //    request renders as a clarify card; output events are represented by
  //    the report entries below; honest notes (interruptions, failures)
  //    render as status notes.
  const runs = new Map<string, ActivityLine[]>()
  const manual: ActivityLine[] = []
  for (const event of task.events ?? []) {
    if (event.kind === 'created' || event.kind === 'output' || event.kind === 'input_request') {
      continue
    }
    if (event.kind === 'note') {
      entries.push({
        kind: 'status_note',
        entryId: `work:ev:${event.id}`,
        at: event.at,
        tone: 'warning',
        label: event.label,
        detail: event.detail,
      })
      continue
    }
    if (!ACTIVITY_EVENT_KINDS.has(event.kind)) continue
    const line: ActivityLine = {
      id: event.id,
      at: event.at,
      label: event.label,
      detail: event.detail,
      tone: activityTone(event.kind),
    }
    if (event.runId === null) {
      manual.push(line)
    } else {
      const bucket = runs.get(event.runId)
      if (bucket) bucket.push(line)
      else runs.set(event.runId, [line])
    }
  }

  // ONE unified activity presentation (m07, F10): run-scoped and manual
  // events merge into a single chronological card. Run ids stay internal
  // to the events (late-event rejection is unchanged); the user sees one
  // understandable summary instead of two near-identical ones.
  const allLines = [...runs.values()].flat().concat(manual).sort((a, b) => a.at - b.at)
  if (allLines.length > 0) {
    const live = task.status === 'running'
    entries.push({
      kind: 'activity',
      entryId: 'work:activity',
      at: allLines[0].at,
      runId: task.currentRunId ?? null,
      title: live ? 'Working…' : 'Activity',
      lines: allLines,
      live,
    })
  }

  // 4. A pending input request renders as a clarify card at the live end
  //    of the thread (positioned by the task's latest update).
  if (task.status === 'needs_input' && task.inputRequest) {
    entries.push({
      kind: 'clarify',
      entryId: `work:clarify:${task.id}`,
      at: task.updatedAt,
      question: task.inputRequest.question,
      options: task.inputRequest.options,
    })
  }

  // 5. Prior outputs (archived by a revision) render as collapsed cards.
  for (const previous of task.previousReports ?? []) {
    entries.push({
      kind: 'output_card',
      entryId: `work:prev:${previous.savedAt}`,
      at: previous.savedAt,
      title: 'Previous output',
      artifactId: previous.artifactId,
      taskId: task.id,
      provenance: previous.provenance,
      generatedByLabel: reportModelLabel(previous),
      stoppedPartial: previous.stoppedPartial,
      archived: true,
    })
  }

  // 6. The current report renders as the assistant's response plus an
  //    artifact card. Streaming tasks update this entry in place (stable
  //    entryId from the producing run).
  if (task.report && task.report.markdown.trim().length > 0) {
    const report = task.report
    const streaming = task.status === 'running' && task.mode === 'ai-draft'
    const status: TaskMessage['status'] = streaming
      ? 'streaming'
      : report.stoppedPartial
        ? 'stopped'
        : 'complete'
    entries.push({
      kind: 'work_message',
      entryId: `work:report:${report.runId ?? 'current'}`,
      at: task.updatedAt,
      message: {
        id: `report-${report.runId ?? 'current'}`,
        role: 'assistant',
        content: report.markdown,
        at: task.updatedAt,
        status,
        statusPrefix:
          report.provenance === 'provider-generated'
            ? report.generatedBy
              ? `Draft from ${report.generatedBy.modelLabel}`
              : 'Provider-generated draft'
            : 'Example output — simulated',
        provenance: report.provenance === 'provider-generated' ? 'live' : 'demo',
        modelLabel: report.generatedBy?.modelLabel ?? null,
      },
    })
    entries.push({
      kind: 'output_card',
      entryId: `work:output:${report.runId ?? 'current'}`,
      at: task.updatedAt + 1,
      title: 'Output — ready to review',
      artifactId: report.artifactId,
      taskId: task.id,
      provenance: report.provenance,
      generatedByLabel: reportModelLabel(report),
      stoppedPartial: report.stoppedPartial,
      archived: false,
    })
  }

  return mergeThreadEntries(entries)
}

/* ------------------------------------------------------------------ */
/* Employee (agent) projection                                         */
/* ------------------------------------------------------------------ */

/**
 * Project an employee's thread from its real chat conversation plus the
 * structured agent thread events (assignments, memory confirmations,
 * plugin actions). The conversation is referenced, never copied; the task
 * card resolves live status from the work store at render time.
 */
export function projectAgentThread(
  conversation: Conversation | null,
  events: AgentThreadEvent[],
): ThreadEntry[] {
  const entries: ThreadEntry[] = []

  if (conversation) {
    for (const node of activePath(conversation)) {
      entries.push({
        kind: 'chat_message',
        entryId: `agent:msg:${node.id}`,
        at: node.createdAt,
        node,
        conversation,
      })
    }
  }

  for (const event of events) {
    if (event.kind === 'assignment' && event.taskId) {
      entries.push({
        kind: 'task_card',
        entryId: `agent:ev:${event.id}`,
        at: event.at,
        taskId: event.taskId,
        title: event.label,
        goal: event.detail ?? '',
      })
      continue
    }
    if (event.kind === 'memory_note') {
      entries.push({
        kind: 'status_note',
        entryId: `agent:ev:${event.id}`,
        at: event.at,
        tone: 'success',
        label: event.label,
        detail: event.detail,
      })
      continue
    }
    entries.push({
      kind: 'status_note',
      entryId: `agent:ev:${event.id}`,
      at: event.at,
      tone: 'info',
      label: event.label,
      detail: event.detail,
    })
  }

  return mergeThreadEntries(entries)
}
