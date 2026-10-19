import { create } from 'zustand'
import type {
  AiDraftConfig,
  TaskDeliverable,
  TaskEvent,
  TaskEventKind,
  TaskMessage,
  WorkTask,
  WorkTaskMode,
} from '@/domain/workspaceTypes'
import { canTransition } from '@/domain/taskMachine'
import { makeId } from '@/domain/ids'
import type { AttachmentMeta } from '@/domain/types'
import type { ChatAdapter } from '@/domain/chatAdapter'
import { createLiveAdapter } from '@/services/live/liveChatAdapter'
import {
  clearWorkSlice,
  loadWorkSlice,
  saveWorkSlice,
} from '@/services/storage/workspaceStorage'

/**
 * Work store — task instances with a deterministic local state machine and
 * a demo execution runner.
 *
 * Runner safety properties (milestone-03 audit, reliability section):
 * - Every run has a unique id; events carry it and stale-run events are
 *   dropped by `appendEvent`.
 * - Pause/cancel abort the run's timers; a cancelled run can never accept
 *   a late timer event.
 * - Timer and abort handles live in this module — never in persisted state.
 * - On reload, `initialize()` demotes running/queued tasks to `paused` and
 *   flags them interrupted; nothing pretends to have kept running.
 */

/* ------------------------------------------------------------------ */
/* Runner plan definitions                                             */
/* ------------------------------------------------------------------ */

interface PlanStep {
  kind: TaskEventKind
  label: string
  detail?: string
  /** Pause here and ask the user before continuing. */
  input?: { question: string; options: string[] }
  delayMs?: number
}

interface RunPlan {
  steps: PlanStep[]
  template: 'research' | 'data' | 'email'
}

const PLANS: Record<TaskDeliverable, RunPlan> = {
  'research-report': {
    template: 'research',
    steps: [
      { kind: 'plan', label: 'Read the brief and set the scope' },
      {
        kind: 'input_request',
        label: 'Checking the depth you need',
        input: {
          question: 'Should this report be a quick comparison or a deeper dive?',
          options: ['Quick comparison', 'Deeper dive'],
        },
      },
      {
        kind: 'tool',
        label: 'Searching sources (simulated)',
        detail: '3 example sources — fixture data, no live web access',
      },
      { kind: 'plan', label: 'Outline: options, trade-offs, evidence gaps' },
      { kind: 'tool', label: 'Drafting the comparison (simulated)' },
    ],
  },
  'data-review': {
    template: 'data',
    steps: [
      { kind: 'plan', label: 'Read the brief and inspect the dataset' },
      {
        kind: 'tool',
        label: 'Profiled 4 columns (fixture dataset)',
        detail: 'rows: 128 · numeric: 3 · categorical: 1',
      },
      {
        kind: 'input_request',
        label: 'Deciding how to handle missing values',
        input: {
          question: 'Should rows with missing values be flagged or excluded?',
          options: ['Flag them', 'Exclude them'],
        },
      },
      { kind: 'tool', label: 'Computed summary statistics (fixture data)' },
      { kind: 'plan', label: 'Assemble findings and caveats' },
    ],
  },
  'email-draft': {
    template: 'email',
    steps: [
      { kind: 'plan', label: 'Read the brief: recipient, goal, context' },
      {
        kind: 'input_request',
        label: 'Checking the tone you want',
        input: {
          question: 'What tone should the email take?',
          options: ['Warm and direct', 'Formal'],
        },
      },
      { kind: 'tool', label: 'Drafted the email (simulated)' },
    ],
  },
}

/** Delay between run steps; tests shrink this to keep suites fast. */
let stepDelayMs = 1100

/** Bounded history of outputs preserved across revisions. */
const MAX_PREVIOUS_REPORTS = 5

/** Character budgets for revision requests — explicit, user-visible limits. */
export const FOLLOW_UP_BUDGET_CHARS = 6000
export const PREVIOUS_OUTPUT_BUDGET_CHARS = 6000

function boundChars(text: string, budget: number, keep: 'head' | 'tail'): string {
  if (text.length <= budget) return text
  const marker = '…[truncated to fit the request budget]…'
  return keep === 'head'
    ? `${text.slice(0, budget)}\n${marker}`
    : `${marker}\n${text.slice(text.length - budget)}`
}

export function setRunnerStepMs(ms: number): void {
  stepDelayMs = Math.max(0, ms)
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal.aborted) return resolve()
    const timer = setTimeout(finish, ms)
    function finish() {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    signal.addEventListener('abort', finish, { once: true })
  })
}

function fixtureReport(
  task: WorkTask,
  template: RunPlan['template'],
  answers: string[],
): string {
  // Guidance combines the run's recorded answers with the task's follow-up
  // messages — a demo rerun reflects what the user actually asked for.
  const guidanceParts = [
    ...answers,
    ...(task.messages ?? [])
      .filter((message) => message.role === 'user' && message.status === 'complete')
      .map((message) => message.content),
  ]
  const guidance =
    guidanceParts.length > 0 ? `\n**Your guidance:** ${guidanceParts.join(' · ')}\n` : '\n'
  if (template === 'research') {
    return [
      `# ${task.title}`,
      '',
      '> Example report — simulated output. This content is fixture data; edit it before downloading.',
      '',
      `## Goal`,
      task.goal || '—',
      guidance,
      '## Comparison',
      '',
      '| Option | Strengths | Trade-offs |',
      '| --- | --- | --- |',
      '| Option A | Simple, quick to adopt | Fewer advanced features |',
      '| Option B | More powerful, flexible | Steeper learning curve |',
      '',
      '## What the evidence supports',
      '',
      '- Both options cover the core need described in the brief.',
      '- The choice mostly depends on how much flexibility you need later.',
      '',
      '## Gaps in this example',
      '',
      '- This is a local simulation: no live sources were consulted.',
      '- Replace the rows above with your own findings before using this.',
    ].join('\n')
  }
  if (template === 'data') {
    return [
      `# ${task.title}`,
      '',
      '> Example review — simulated output computed from a bundled fixture dataset.',
      '',
      `## Goal`,
      task.goal || '—',
      guidance,
      '## Dataset profile',
      '',
      '- 128 rows, 4 columns (fixture data bundled with the app)',
      '- No values left the device; nothing was uploaded',
      '',
      '## Findings',
      '',
      '- Column A: mean 42.1, range 3–97 (example values)',
      '- Column B: 12 rows with missing values (example values)',
      '- Column C: strongly skewed; median is the safer summary',
      '',
      '## Caveats',
      '',
      '- All numbers are fixture data for demonstration, not your upload.',
    ].join('\n')
  }
  return [
    `# ${task.title}`,
    '',
    '> Example email draft — simulated output. Sending is not available; save or download instead.',
    '',
    `## Goal`,
    task.goal || '—',
    guidance,
    '## Draft',
    '',
    'Subject: Following up on our conversation',
    '',
    'Hi there,',
    '',
    'Thanks for making time earlier. I put together the summary we discussed —',
    'the main points are below, and I am happy to adjust anything.',
    '',
    'Best,',
    'Universe (example draft)',
  ].join('\n')
}

/* ------------------------------------------------------------------ */
/* Runner handles (module-scoped, never persisted)                     */
/* ------------------------------------------------------------------ */

interface RunHandle {
  taskId: string
  runId: string
  abort: AbortController
  inputWaiter: { resolve: (answer: string) => void } | null
}

const activeRuns = new Map<string, RunHandle>()

export function activeRunCount(): number {
  return activeRuns.size
}

export function abortAllRunsForTests(): void {
  for (const handle of activeRuns.values()) handle.abort.abort()
  activeRuns.clear()
  for (const handle of aiRuns.values()) handle.abort.abort()
  aiRuns.clear()
}

async function executeRun(taskId: string, runId: string): Promise<void> {
  const handle: RunHandle = { taskId, runId, abort: new AbortController(), inputWaiter: null }
  activeRuns.set(taskId, handle)

  try {
    while (true) {
      const task = useWorkStore.getState().tasks[taskId]
      if (!task || task.currentRunId !== runId || task.status !== 'running') return

      const plan = PLANS[task.deliverable]
      const cursor = task.planCursor
      if (cursor >= plan.steps.length) {
        useWorkStore.getState().finishRun(taskId, runId)
        return
      }

      const step = plan.steps[cursor]
      useWorkStore.getState().appendEvent(taskId, {
        id: makeId('ev'),
        runId,
        at: Date.now(),
        kind: step.kind,
        label: step.label,
        detail: step.detail,
      })
      useWorkStore.getState().setCursor(taskId, runId, cursor + 1)

      await sleep(step.delayMs ?? stepDelayMs, handle.abort.signal)
      if (handle.abort.signal.aborted) return

      if (step.input) {
        // Park: hand the question to the UI and wait for the answer.
        const answered = useWorkStore.getState().parkForInput(
          taskId,
          runId,
          step.input,
        )
        if (!answered) return
        const answer = await new Promise<string>((resolve) => {
          handle.inputWaiter = { resolve }
        })
        if (handle.abort.signal.aborted) return
        const resumed = useWorkStore.getState().resumeAfterInput(taskId, runId, answer)
        if (!resumed) return
      }
    }
  } finally {
    if (activeRuns.get(taskId) === handle) activeRuns.delete(taskId)
  }
}

/* ------------------------------------------------------------------ */
/* AI-draft runner (live BYOK request)                                 */
/* ------------------------------------------------------------------ */

/**
 * Live drafting requests — one controller per task, keyed by task id.
 * Completely separate from the demo runner's handles above, from chat's
 * generation controller, and from Compare's per-slot controllers: stopping
 * one never touches another surface. Only run ids and abort handles live
 * here; nothing is persisted, and credentials are read at request time and
 * kept solely inside the streaming closure.
 */
interface AiRunHandle {
  runId: string
  abort: AbortController
}

const aiRuns = new Map<string, AiRunHandle>()

/** Test seam: replace the live adapter construction (never a real key). */
let adapterFactoryForTests: ((providerId: string) => ChatAdapter | null) | null = null

export function setAiAdapterFactoryForTests(
  factory: ((providerId: string) => ChatAdapter | null) | null,
): void {
  adapterFactoryForTests = factory
}

export function aiRunCount(): number {
  return aiRuns.size
}

/** Compose the single drafting request from the task's own configuration. */
function buildDraftRequest(
  task: WorkTask,
  agentInstructions: string,
  revision?: { previousMarkdown: string },
) {
  const config = task.draftConfig!
  const system = [
    'You are drafting a work document for the Uni workspace.',
    agentInstructions.trim()
      ? `Agent instructions for this task:\n${agentInstructions.trim()}`
      : '',
    config.instructions.trim() ? `Additional instructions:\n${config.instructions.trim()}` : '',
    config.contextText.trim()
      ? `Selected context supplied by the user (use only this material; do not invent sources or citations):\n\n${config.contextText.trim()}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n')

  // Follow-ups are the task's real message thread, bounded to an explicit
  // budget so a long thread can never silently grow the request.
  const followUps = (task.messages ?? [])
    .filter((message) => message.status === 'complete')
    .map((message) => `${message.role === 'user' ? 'User' : 'Assistant'}: ${message.content}`)
    .join('\n\n')

  return {
    prompt: [
      revision
        ? 'This is a REVISION request: the user reviewed the previous draft and gave follow-up instructions. Write a complete, updated draft that reflects them.'
        : 'Write the draft deliverable for this task.',
      `Title: ${task.title}`,
      `Goal: ${task.goal.trim() || '(none provided)'}`,
      followUps
        ? `Conversation with the user about this task (oldest first, most recent last):\n\n${boundChars(followUps, FOLLOW_UP_BUDGET_CHARS, 'tail')}`
        : '',
      revision && revision.previousMarkdown.trim()
        ? `Previous draft to revise (may be truncated):\n\n${boundChars(revision.previousMarkdown, PREVIOUS_OUTPUT_BUDGET_CHARS, 'head')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    system,
  }
}

async function executeAiDraft(
  taskId: string,
  runId: string,
  revision?: { previousMarkdown: string },
): Promise<void> {
  const handle: AiRunHandle = { runId, abort: new AbortController() }
  aiRuns.set(taskId, handle)

  try {
    const task = useWorkStore.getState().tasks[taskId]
    if (!task || task.mode !== 'ai-draft' || !task.draftConfig) return
    const config = task.draftConfig

    // Credentials are read at the moment of the explicit request and never
    // leave this closure — they are not written to the task, the store
    // snapshot, or persistence.
    const { useAppStore } = await import('@/state/store')
    const appState = useAppStore.getState()
    const provider = appState.providers.find((p) => p.id === config.model.providerId)
    const credential = appState.credentials[config.model.providerId]
    const apiKey = credential?.status === 'connected' ? credential.apiKey : null

    if (!provider || !apiKey) {
      useWorkStore.getState().failAiRun(taskId, runId, {
        message:
          'The provider for this task is not connected. Reconnect it in Settings, then generate again.',
      })
      return
    }

    if (handle.abort.signal.aborted) return

    const adapter =
      adapterFactoryForTests?.(provider.id) ?? createLiveAdapter(provider, apiKey, config.model.modelId)

    const agent = task.agentId
      ? (await import('@/state/agentsStore')).useAgentsStore.getState().agents[task.agentId]
      : null
    const { prompt, system } = buildDraftRequest(task, agent?.instructions ?? '', revision)

    await adapter.stream(
      {
        prompt,
        history: [],
        tools: [],
        attachments: [],
        nickname: '',
        traits: '',
        system: system || undefined,
      },
      {
        onStart: () => {
          useWorkStore.getState().appendEvent(taskId, {
            id: makeId('ev'),
            runId,
            at: Date.now(),
            kind: 'tool',
            label: `Streaming draft content from ${config.model.modelLabel}…`,
          })
        },
        onDelta: (text) => useWorkStore.getState().appendAiContent(taskId, runId, text),
        onDone: (reason) => useWorkStore.getState().finishAiRun(taskId, runId, reason),
        onError: (error) => useWorkStore.getState().failAiRun(taskId, runId, error),
      },
      handle.abort.signal,
    )
  } finally {
    const entry = aiRuns.get(taskId)
    if (entry?.runId === runId) aiRuns.delete(taskId)
  }
}

/* ------------------------------------------------------------------ */
/* Store                                                               */
/* ------------------------------------------------------------------ */

export interface CreateTaskInput {
  title: string
  goal: string
  deliverable: TaskDeliverable
  agentId?: string | null
  projectId?: string | null
  attachments?: AttachmentMeta[]
  mode?: WorkTaskMode
  draftConfig?: AiDraftConfig | null
}

export interface WorkStore {
  hydrated: boolean
  tasks: Record<string, WorkTask>

  initialize: () => void
  resetDemoData: () => void

  createTask: (input: CreateTaskInput) => string
  updateTask: (
    id: string,
    patch: Partial<Pick<WorkTask, 'title' | 'goal' | 'deliverable' | 'agentId' | 'projectId'>>,
  ) => void
  deleteTask: (id: string) => void
  /** Clear a deleted project's id from every task that referenced it. */
  detachProject: (projectId: string) => void

  runTask: (id: string) => void
  /** Internal — shared start-of-run state. Exposed for testability. */
  startRun: (id: string, runId: string, startLabel: string) => void
  pauseTask: (id: string) => void
  resumeTask: (id: string) => void
  cancelTask: (id: string) => void
  retryTask: (id: string) => void
  reopenTask: (id: string) => void
  completeTask: (id: string) => void
  answerInput: (id: string, answer: string) => void

  /** Append a message to the task's conversational thread. */
  appendTaskMessage: (
    taskId: string,
    message: Pick<TaskMessage, 'role' | 'content'> &
      Partial<Pick<TaskMessage, 'status' | 'statusPrefix' | 'provenance' | 'modelLabel' | 'error'>>,
  ) => string | null
  /**
   * Send a follow-up in the task thread. Depending on the task's state
   * this stores the message, starts the first run, or triggers a real
   * revision run — never a decorative bubble over an unchanged task.
   */
  sendFollowUp: (taskId: string, text: string) => 'stored' | 'started' | 'revising' | 'rejected'
  /** Start a revision run that includes follow-ups and the previous output. */
  reviseTask: (id: string) => void

  /** Update the AI-draft configuration of a draft task. */
  updateDraftConfig: (id: string, patch: Partial<AiDraftConfig>) => void

  /** Internal — AI-draft runner callbacks. Exposed for testability. */
  appendAiContent: (taskId: string, runId: string, text: string) => void
  finishAiRun: (taskId: string, runId: string, reason: 'complete' | 'stopped') => void
  failAiRun: (
    taskId: string,
    runId: string,
    error: { code?: string; message: string },
  ) => void

  updateReport: (id: string, markdown: string) => void
  /** Link (or re-link) the library artifact produced from the report. */
  attachArtifactToReport: (id: string, artifactId: string) => void

  /** Internal — called by the runner. Exposed on the store for testability. */
  appendEvent: (taskId: string, event: TaskEvent) => void
  setCursor: (taskId: string, runId: string, cursor: number) => void
  parkForInput: (
    taskId: string,
    runId: string,
    request: { question: string; options: string[] },
  ) => boolean
  resumeAfterInput: (taskId: string, runId: string, answer: string) => boolean
  finishRun: (taskId: string, runId: string) => void
}

function nowEvent(kind: TaskEventKind, label: string, runId: string | null = null): TaskEvent {
  return { id: makeId('ev'), runId, at: Date.now(), kind, label }
}

export const useWorkStore = create<WorkStore>()((set, get) => ({
  hydrated: false,
  tasks: {},

  initialize: () => {
    if (get().hydrated) return
    const loaded = loadWorkSlice()
    const tasks: Record<string, WorkTask> = {}
    if (loaded.state) {
      for (const raw of loaded.state.tasks) {
        // Pre-AI-draft tasks (and any future partial writes) normalize to
        // demo mode with an empty config; reports gain their provenance
        // defaults. Old demo tasks and artifacts keep loading untouched.
        const task: WorkTask = {
          ...raw,
          mode: raw.mode === 'ai-draft' ? 'ai-draft' : 'demo',
          draftConfig: raw.draftConfig ?? null,
          error: raw.error ?? null,
          // Milestone-06 conversational fields: old tasks default to empty —
          // their history is projected, never rewritten or wiped.
          messages: Array.isArray(raw.messages) ? raw.messages : [],
          previousReports: Array.isArray(raw.previousReports) ? raw.previousReports : [],
          report: raw.report
            ? {
                template: raw.report.template,
                markdown: raw.report.markdown,
                artifactId: raw.report.artifactId ?? null,
                provenance: raw.report.provenance ?? 'demo-simulation',
                generatedBy: raw.report.generatedBy ?? null,
                contextIncluded: raw.report.contextIncluded ?? false,
                stoppedPartial: raw.report.stoppedPartial ?? false,
                runId: raw.report.runId ?? null,
              }
            : null,
        }
        // A reload ends any live simulation honestly: running/queued tasks
        // become paused and interrupted, with a clear Resume action. A live
        // drafting request equally cannot continue through a reload — the
        // network handle existed only in the closed page.
        if (task.status === 'running' || task.status === 'queued') {
          tasks[task.id] = {
            ...task,
            status: 'paused',
            interrupted: true,
            currentRunId: null,
            events: [
              ...task.events,
              nowEvent(
                'note',
                task.mode === 'ai-draft'
                  ? 'Draft request interrupted by a reload — the request did not continue in the background. Generate again to start a new one.'
                  : 'Run interrupted by a reload — resume to continue.',
              ),
            ],
          }
        } else {
          tasks[task.id] = { ...task, currentRunId: null }
        }
      }
      set({ hydrated: true, tasks })
    } else {
      set({ hydrated: true, tasks: {} })
    }
  },

  resetDemoData: () => {
    clearWorkSlice()
    set({ hydrated: true, tasks: {} })
  },

  createTask: (input) => {
    const now = Date.now()
    const mode: WorkTaskMode = input.mode === 'ai-draft' ? 'ai-draft' : 'demo'
    const task: WorkTask = {
      id: makeId('task'),
      title: input.title.trim() || 'Untitled task',
      goal: input.goal.trim(),
      deliverable: input.deliverable,
      agentId: input.agentId ?? null,
      projectId: input.projectId ?? null,
      attachments: input.attachments ?? [],
      status: 'draft',
      mode,
      draftConfig: mode === 'ai-draft' ? (input.draftConfig ?? null) : null,
      createdAt: now,
      updatedAt: now,
      events: [
        nowEvent(
          'created',
          mode === 'ai-draft'
            ? 'Task created — AI draft mode (live request on demand)'
            : 'Task created',
        ),
      ],
      currentRunId: null,
      planCursor: 0,
      runAnswers: [],
      interrupted: false,
      report: null,
      inputRequest: null,
      error: null,
      messages: [],
      previousReports: [],
    }
    set((state) => ({ tasks: { ...state.tasks, [task.id]: task } }))
    return task.id
  },

  updateTask: (id, patch) => {
    set((state) => {
      const task = state.tasks[id]
      if (!task) return state
      return {
        tasks: { ...state.tasks, [id]: { ...task, ...patch, updatedAt: Date.now() } },
      }
    })
  },

  detachProject: (projectId) => {
    set((state) => {
      let changed = false
      const tasks: Record<string, WorkTask> = {}
      for (const [id, task] of Object.entries(state.tasks)) {
        if (task.projectId === projectId) {
          tasks[id] = { ...task, projectId: null, updatedAt: Date.now() }
          changed = true
        } else {
          tasks[id] = task
        }
      }
      return changed ? { tasks } : state
    })
  },

  deleteTask: (id) => {
    activeRuns.get(id)?.abort.abort()
    aiRuns.get(id)?.abort.abort()
    set((state) => {
      const tasks = { ...state.tasks }
      delete tasks[id]
      return { tasks }
    })
  },

  /** Shared start-of-run state for both modes. */
  startRun: (id, runId, startLabel) => {
    set((state) => {
      const task = state.tasks[id]
      if (!task) return state
      // A revision archives the previous output (bounded) instead of
      // silently discarding it; the new run starts from a clean report.
      const previousReports =
        task.report && task.report.markdown.trim().length > 0
          ? [{ ...task.report, savedAt: Date.now() }, ...task.previousReports].slice(0, MAX_PREVIOUS_REPORTS)
          : task.previousReports
      return {
        tasks: {
          ...state.tasks,
          [id]: {
            ...task,
            status: 'running',
            currentRunId: runId,
            planCursor: 0,
            runAnswers: [],
            interrupted: false,
            inputRequest: null,
            error: null,
            // A new run is a new draft: the report resets (partial output
            // from earlier runs was already preserved until this explicit
            // new request — the user can edit/save it before regenerating).
            report: null,
            previousReports,
            updatedAt: Date.now(),
            events: [...task.events, nowEvent('status', startLabel)],
          },
        },
      }
    })
  },

  runTask: (id) => {
    const task = get().tasks[id]
    if (!task || !canTransition(task.status, 'queued')) return
    const runId = makeId('run')
    if (task.mode === 'ai-draft') {
      get().startRun(
        id,
        runId,
        `Draft generation started — live request to ${task.draftConfig?.model.providerLabel ?? 'provider'}`,
      )
      void executeAiDraft(id, runId)
      return
    }
    get().startRun(id, runId, 'Run started (demo execution)')
    void executeRun(id, runId)
  },

  pauseTask: (id) => {
    const task = get().tasks[id]
    if (!task || !canTransition(task.status, 'paused')) return
    activeRuns.get(id)?.abort.abort()
    aiRuns.get(id)?.abort.abort()
    set((state) => {
      const task = state.tasks[id]
      if (!task) return state
      const hadPartial =
        task.mode === 'ai-draft' && !!task.report && task.report.markdown.trim().length > 0
      return {
        tasks: {
          ...state.tasks,
          [id]: {
            ...task,
            status: 'paused',
            currentRunId: null,
            report: task.report
              ? { ...task.report, stoppedPartial: task.mode === 'ai-draft' }
              : null,
            updatedAt: Date.now(),
            events: [
              ...task.events,
              nowEvent(
                'status',
                task.mode === 'ai-draft'
                  ? hadPartial
                    ? 'Generation stopped — partial draft preserved below'
                    : 'Generation stopped before any content arrived'
                  : 'Run paused',
              ),
            ],
          },
        },
      }
    })
  },

  resumeTask: (id) => {
    const task = get().tasks[id]
    if (!task || !canTransition(task.status, 'running')) return
    const runId = makeId('run')
    if (task.mode === 'ai-draft') {
      // Resuming an AI draft is an explicit NEW request (a network stream
      // cannot continue through the pause); the preserved partial stays
      // until this run replaces it.
      get().startRun(id, runId, 'Draft generation restarted — new live request')
      void executeAiDraft(id, runId)
      return
    }
    set((state) => ({
      tasks: {
        ...state.tasks,
        [id]: {
          ...state.tasks[id],
          status: 'running',
          currentRunId: runId,
          interrupted: false,
          updatedAt: Date.now(),
          events: [
            ...state.tasks[id].events,
            nowEvent('status', 'Run resumed'),
          ],
        },
      },
    }))
    void executeRun(id, runId)
  },

  cancelTask: (id) => {
    const task = get().tasks[id]
    if (!task || !canTransition(task.status, 'cancelled')) return
    activeRuns.get(id)?.abort.abort()
    aiRuns.get(id)?.abort.abort()
    set((state) => ({
      tasks: {
        ...state.tasks,
        [id]: {
          ...state.tasks[id],
          status: 'cancelled',
          currentRunId: null,
          updatedAt: Date.now(),
          events: [
            ...state.tasks[id].events,
            nowEvent('status', 'Run cancelled — late events from this run are rejected'),
          ],
        },
      },
    }))
  },

  retryTask: (id) => {
    const task = get().tasks[id]
    if (!task || !canTransition(task.status, 'queued')) return
    const runId = makeId('run')
    if (task.mode === 'ai-draft') {
      get().startRun(id, runId, 'Retry started — new live draft request')
      void executeAiDraft(id, runId)
      return
    }
    set((state) => ({
      tasks: {
        ...state.tasks,
        [id]: {
          ...state.tasks[id],
          status: 'running',
          currentRunId: runId,
          planCursor: 0,
          runAnswers: [],
          interrupted: false,
          inputRequest: null,
          updatedAt: Date.now(),
          events: [...state.tasks[id].events, nowEvent('status', 'Retry started')],
        },
      },
    }))
    void executeRun(id, runId)
  },

  reopenTask: (id) => {
    const task = get().tasks[id]
    if (!task || !canTransition(task.status, 'draft')) return
    set((state) => ({
      tasks: {
        ...state.tasks,
        [id]: {
          ...state.tasks[id],
          status: 'draft',
          updatedAt: Date.now(),
          events: [...state.tasks[id].events, nowEvent('status', 'Task reopened as draft')],
        },
      },
    }))
  },

  completeTask: (id) => {
    const task = get().tasks[id]
    if (!task || !canTransition(task.status, 'completed')) return
    set((state) => ({
      tasks: {
        ...state.tasks,
        [id]: {
          ...state.tasks[id],
          status: 'completed',
          updatedAt: Date.now(),
          events: [...state.tasks[id].events, nowEvent('status', 'Reviewed and completed')],
        },
      },
    }))
  },

  answerInput: (id, answer) => {
    const handle = activeRuns.get(id)
    if (handle?.inputWaiter) {
      handle.inputWaiter.resolve(answer)
    } else {
      // Post-reload answer: no live run exists, so record the answer on
      // the task (so the report can use it) and continue with a fresh run
      // from the stored cursor.
      const task = get().tasks[id]
      if (!task || task.status !== 'needs_input') return
      set((state) => ({
        tasks: {
          ...state.tasks,
          [id]: {
            ...state.tasks[id],
            runAnswers: [...state.tasks[id].runAnswers, answer],
            events: [
              ...state.tasks[id].events,
              nowEvent('input_response', `Answered: ${answer}`),
            ],
          },
        },
      }))
      get().resumeTask(id)
    }
  },

  appendTaskMessage: (taskId, message) => {
    const task = get().tasks[taskId]
    if (!task) return null
    const entry: TaskMessage = {
      id: makeId('tm'),
      role: message.role,
      content: message.content,
      at: Date.now(),
      status: message.status ?? 'complete',
      statusPrefix: message.statusPrefix ?? null,
      provenance: message.provenance ?? null,
      modelLabel: message.modelLabel ?? null,
      error: message.error ?? null,
    }
    set((state) => ({
      tasks: {
        ...state.tasks,
        [taskId]: {
          ...task,
          messages: [...task.messages, entry],
          updatedAt: entry.at,
        },
      },
    }))
    return entry.id
  },

  sendFollowUp: (taskId, text) => {
    const task = get().tasks[taskId]
    const trimmed = text.trim()
    if (!task || !trimmed) return 'rejected'

    const send = get().appendTaskMessage
    send(taskId, { role: 'user', content: trimmed })

    switch (task.status) {
      case 'draft': {
        if (task.mode === 'demo') {
          send(taskId, {
            role: 'assistant',
            content:
              'Got it — starting a local demo run. Steps and the example output are simulated on this device; nothing is sent anywhere.',
            statusPrefix: 'Starting demo run',
            provenance: 'demo',
          })
          get().runTask(taskId)
          return 'started'
        }
        send(taskId, {
          role: 'assistant',
          content: `Added to the brief. Generate the draft whenever you're ready — one live request to ${task.draftConfig?.model.modelLabel ?? 'the connected model'}, and your key stays in this browser.`,
          statusPrefix: 'Noted',
        })
        return 'stored'
      }
      case 'ready_for_review':
      case 'paused': {
        if (task.mode === 'demo') {
          send(taskId, {
            role: 'assistant',
            content:
              'Revising — rerunning the local demo with your guidance included in the example output. The previous output is kept below.',
            statusPrefix: 'Revising (demo)',
            provenance: 'demo',
          })
        } else {
          send(taskId, {
            role: 'assistant',
            content:
              `Revising with your changes — one new live request to ${task.draftConfig?.model.modelLabel ?? 'the connected model'} that includes the original goal, this conversation (bounded), and the previous draft. The previous output is kept below.`,
            statusPrefix: 'Revising',
          })
        }
        get().reviseTask(taskId)
        return 'revising'
      }
      case 'failed': {
        send(taskId, {
          role: 'assistant',
          content:
            'Retrying with your follow-up included — the previous attempt failed, and any partial content it produced is preserved below.',
          statusPrefix: 'Retrying',
        })
        get().retryTask(taskId)
        return 'revising'
      }
      case 'running':
      case 'queued': {
        send(taskId, {
          role: 'assistant',
          content:
            'Noted — this message is saved with the task and will be included in the next request or run.',
          statusPrefix: 'Noted',
        })
        return 'stored'
      }
      case 'needs_input': {
        send(taskId, {
          role: 'assistant',
          content:
            'Noted — answer the question above to continue the current run; this message stays with the thread either way.',
          statusPrefix: 'Noted',
        })
        return 'stored'
      }
      case 'completed':
      case 'cancelled': {
        send(taskId, {
          role: 'assistant',
          content:
            'This task is closed — the message is saved with its history. Reopen it as a draft from the task menu to run a revision.',
          statusPrefix: 'Saved with history',
        })
        return 'stored'
      }
      default:
        return 'stored'
    }
  },

  reviseTask: (id) => {
    const task = get().tasks[id]
    if (!task) return
    // ready_for_review → running and paused → running are legal; failed
    // must route through retry (failed → queued).
    if (task.status === 'failed') {
      get().retryTask(id)
      return
    }
    if (!canTransition(task.status, 'running')) return
    const previousMarkdown = task.report?.markdown ?? ''
    const runId = makeId('run')
    if (task.mode === 'ai-draft') {
      get().startRun(id, runId, 'Revision started — new live request with your follow-ups')
      void executeAiDraft(id, runId, { previousMarkdown })
      return
    }
    get().startRun(id, runId, 'Revision started — demo run with your guidance')
    void executeRun(id, runId)
  },

  updateDraftConfig: (id, patch) => {
    set((state) => {
      const task = state.tasks[id]
      if (!task || task.mode !== 'ai-draft' || !task.draftConfig) return state
      if (task.status !== 'draft') return state
      return {
        tasks: {
          ...state.tasks,
          [id]: {
            ...task,
            draftConfig: { ...task.draftConfig, ...patch },
            updatedAt: Date.now(),
          },
        },
      }
    })
  },

  appendAiContent: (taskId, runId, text) => {
    set((state) => {
      const task = state.tasks[taskId]
      if (!task || task.currentRunId !== runId || task.status !== 'running') return state
      const config = task.draftConfig
      const report = task.report ?? {
        template: 'draft' as const,
        markdown: '',
        artifactId: null,
        provenance: 'provider-generated' as const,
        generatedBy: config?.model ?? null,
        contextIncluded: !!config?.contextText.trim(),
        stoppedPartial: false,
        runId,
      }
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            report: { ...report, markdown: report.markdown + text },
            updatedAt: Date.now(),
          },
        },
      }
    })
  },

  finishAiRun: (taskId, runId, reason) => {
    set((state) => {
      const task = state.tasks[taskId]
      if (!task || task.currentRunId !== runId || task.status !== 'running') return state
      const model = task.draftConfig?.model
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            status: 'ready_for_review',
            currentRunId: null,
            inputRequest: null,
            report: task.report
              ? { ...task.report, stoppedPartial: reason === 'stopped' }
              : null,
            updatedAt: Date.now(),
            events: [
              ...task.events,
              {
                ...nowEvent(
                  'output',
                  reason === 'stopped'
                    ? `Draft stopped — partial content preserved (${model?.modelLabel ?? 'provider'})`
                    : `Draft ready for review — provider-generated by ${model?.modelLabel ?? 'provider'}`,
                ),
                runId,
              },
            ],
          },
        },
      }
    })
  },

  failAiRun: (taskId, runId, error) => {
    set((state) => {
      const task = state.tasks[taskId]
      if (!task || task.currentRunId !== runId) return state
      // Partial content already streamed stays with the task for review;
      // only the status records the failure. Retrying is always explicit.
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            status: 'failed',
            currentRunId: null,
            error: error.message,
            report: task.report ? { ...task.report, stoppedPartial: true } : null,
            updatedAt: Date.now(),
            events: [
              ...task.events,
              {
                ...nowEvent('note', `Draft request failed — ${error.message}`),
                runId,
              },
            ],
          },
        },
      }
    })
  },

  updateReport: (id, markdown) => {
    set((state) => {
      const task = state.tasks[id]
      if (!task?.report) return state
      return {
        tasks: {
          ...state.tasks,
          [id]: {
            ...task,
            report: { ...task.report, markdown },
            updatedAt: Date.now(),
          },
        },
      }
    })
  },

  attachArtifactToReport: (id, artifactId) => {
    set((state) => {
      const task = state.tasks[id]
      if (!task?.report) return state
      return {
        tasks: {
          ...state.tasks,
          [id]: {
            ...task,
            report: { ...task.report, artifactId },
            updatedAt: Date.now(),
          },
        },
      }
    })
  },

  appendEvent: (taskId, event) => {
    set((state) => {
      const task = state.tasks[taskId]
      if (!task) return state
      // Stale-run guard: events from an old or cancelled run are dropped.
      if (event.runId !== null && task.currentRunId !== event.runId) return state
      if (event.runId !== null && task.status !== 'running') return state
      return {
        tasks: {
          ...state.tasks,
          [taskId]: { ...task, events: [...task.events, event], updatedAt: Date.now() },
        },
      }
    })
  },

  setCursor: (taskId, runId, cursor) => {
    set((state) => {
      const task = state.tasks[taskId]
      if (!task || task.currentRunId !== runId) return state
      return {
        tasks: { ...state.tasks, [taskId]: { ...task, planCursor: cursor } },
      }
    })
  },

  parkForInput: (taskId, runId, request) => {
    let parked = false
    set((state) => {
      const task = state.tasks[taskId]
      if (!task || task.currentRunId !== runId || task.status !== 'running') return state
      parked = true
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            status: 'needs_input',
            inputRequest: request,
            updatedAt: Date.now(),
          },
        },
      }
    })
    return parked
  },

  resumeAfterInput: (taskId, runId, answer) => {
    let resumed = false
    set((state) => {
      const task = state.tasks[taskId]
      if (!task || task.currentRunId !== runId || task.status !== 'needs_input') return state
      resumed = true
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            status: 'running',
            inputRequest: null,
            // Persisted with the task so a post-reload resume still sees it.
            runAnswers: [...task.runAnswers, answer],
            updatedAt: Date.now(),
            events: [
              ...task.events,
              { ...nowEvent('input_response', `Answered: ${answer}`), runId },
            ],
          },
        },
      }
    })
    return resumed
  },

  finishRun: (taskId, runId) => {
    set((state) => {
      const task = state.tasks[taskId]
      if (!task || task.currentRunId !== runId || task.status !== 'running') return state
      const plan = PLANS[task.deliverable]
      const markdown = fixtureReport(task, plan.template, task.runAnswers)
      return {
        tasks: {
          ...state.tasks,
          [taskId]: {
            ...task,
            status: 'ready_for_review',
            currentRunId: null,
            inputRequest: null,
            report: {
              template: plan.template,
              markdown,
              artifactId: null,
              provenance: 'demo-simulation',
              generatedBy: null,
              contextIncluded: false,
              stoppedPartial: false,
              runId,
            },
            updatedAt: Date.now(),
            events: [
              ...task.events,
              {
                ...nowEvent('output', 'Example output ready for review — simulated content'),
                runId,
              },
            ],
          },
        },
      }
    })
  },
}))

/* ------------------------------------------------------------------ */
/* Persistence wiring                                                  */
/* ------------------------------------------------------------------ */

let saveTimer: ReturnType<typeof setTimeout> | undefined

let workStorageWarned = false

export function flushWorkPersistence(): void {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  const state = useWorkStore.getState()
  if (!state.hydrated) return
  const saved = saveWorkSlice({ tasks: Object.values(state.tasks) })
  if (!saved && !workStorageWarned) {
    workStorageWarned = true
    import('@/state/store').then(({ useAppStore }) => {
      useAppStore.getState().showToast(
        'Local storage is full or blocked — task changes may not survive a reload.',
      )
    })
  }
}

useWorkStore.subscribe(() => {
  const state = useWorkStore.getState()
  if (!state.hydrated) return
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(flushWorkPersistence, 400)
})

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushWorkPersistence)
}

/** Test-only: wipe work state (and optionally storage). */
export function resetWorkStoreForTests(options: { keepStorage?: boolean } = {}): void {
  if (!options.keepStorage) clearWorkSlice()
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = undefined
  }
  abortAllRunsForTests()
  useWorkStore.setState({ hydrated: false, tasks: {} })
}
