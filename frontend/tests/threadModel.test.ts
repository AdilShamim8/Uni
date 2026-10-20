import { describe, expect, it } from 'vitest'
import type { Conversation, MessageNode } from '@/domain/types'
import type { AgentThreadEvent, WorkTask } from '@/domain/workspaceTypes'
import {
  findEntry,
  mergeThreadEntries,
  projectAgentThread,
  projectWorkThread,
} from '@/features/conversation/threadModel'

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const T0 = 1_700_000_000_000

function fixtureTask(overrides: Partial<WorkTask> = {}): WorkTask {
  return {
    id: 'task-1',
    title: 'Compare two routers',
    goal: 'Compare two routers for the new apartment',
    deliverable: 'research-report',
    agentId: null,
    projectId: null,
    attachments: [],
    status: 'ready_for_review',
    mode: 'demo',
    draftConfig: null,
    createdAt: T0,
    updatedAt: T0 + 60_000,
    events: [],
    currentRunId: null,
    planCursor: 0,
    runAnswers: [],
    interrupted: false,
    report: null,
    inputRequest: null,
    error: null,
    messages: [],
    previousReports: [],
    ...overrides,
  }
}

function fixtureConversation(): Conversation {
  const user: MessageNode = {
    id: 'm1',
    parentId: null,
    role: 'user',
    content: 'Hello',
    createdAt: T0,
    status: 'complete',
  }
  const assistant: MessageNode = {
    id: 'm2',
    parentId: 'm1',
    role: 'assistant',
    content: 'Hi — how can I help?',
    createdAt: T0 + 1_000,
    status: 'complete',
  }
  return {
    id: 'c1',
    title: 'Agent chat',
    createdAt: T0,
    updatedAt: T0 + 1_000,
    pinned: false,
    archived: false,
    temporary: false,
    agentId: 'agent-1',
    nodes: { m1: user, m2: assistant },
    activeLeafId: 'm2',
  }
}

/* ------------------------------------------------------------------ */
/* mergeThreadEntries                                                  */
/* ------------------------------------------------------------------ */

describe('mergeThreadEntries', () => {
  it('orders by timestamp and keeps same-timestamp source order', () => {
    const merged = mergeThreadEntries(
      [
        {
          kind: 'status_note',
          entryId: 'b',
          at: T0 + 5,
          tone: 'info',
          label: 'later',
        },
      ],
      [
        {
          kind: 'status_note',
          entryId: 'a',
          at: T0,
          tone: 'info',
          label: 'first',
        },
      ],
    )
    expect(merged.map((entry) => entry.entryId)).toEqual(['a', 'b'])
  })

  it('deduplicates by entryId (first occurrence wins)', () => {
    const first = {
      kind: 'status_note' as const,
      entryId: 'same',
      at: T0,
      tone: 'info' as const,
      label: 'original',
    }
    const duplicate = {
      kind: 'status_note' as const,
      entryId: 'same',
      at: T0 + 100,
      tone: 'error' as const,
      label: 'stale copy',
    }
    const merged = mergeThreadEntries([first], [duplicate])
    expect(merged).toHaveLength(1)
    const survivor = merged[0]
    if (survivor.kind !== 'status_note') throw new Error('expected status note')
    expect(survivor.label).toBe('original')
  })
})

/* ------------------------------------------------------------------ */
/* projectWorkThread                                                   */
/* ------------------------------------------------------------------ */

describe('projectWorkThread', () => {
  it('renders the goal as the opening user message', () => {
    const entries = projectWorkThread(fixtureTask())
    expect(entries[0]).toMatchObject({
      kind: 'work_message',
      entryId: 'work:goal:task-1',
    })
    const message = entries[0]
    if (message.kind !== 'work_message') throw new Error('expected message')
    expect(message.message.role).toBe('user')
    expect(message.message.content).toContain('routers')
  })

  it('groups a run’s events into one collapsible activity card with statuses', () => {
    const task = fixtureTask({
      status: 'completed',
      events: [
        { id: 'e1', runId: 'run-1', at: T0 + 100, kind: 'created', label: 'Task created' },
        { id: 'e2', runId: 'run-1', at: T0 + 200, kind: 'status', label: 'Run started (demo execution)' },
        { id: 'e3', runId: 'run-1', at: T0 + 300, kind: 'plan', label: 'Read the brief and set the scope' },
        { id: 'e4', runId: 'run-1', at: T0 + 400, kind: 'tool', label: 'Searching sources (simulated)' },
        { id: 'e5', runId: 'run-1', at: T0 + 500, kind: 'output', label: 'Example output ready' },
      ],
    })
    const entries = projectWorkThread(task)
    const activity = entries.find((entry) => entry.kind === 'activity')
    if (!activity || activity.kind !== 'activity') throw new Error('expected activity card')
    // created + output are represented by the goal message / report entries
    expect(activity.lines.map((line) => line.id)).toEqual(['e2', 'e3', 'e4'])
    expect(activity.live).toBe(false)
    // m07/F10: one unified task-level activity card (run ids stay internal).
    expect(activity.title).toBe('Activity')
  })

  it('renders a pending input request as a clarify card, not an activity line', () => {
    const task = fixtureTask({
      status: 'needs_input',
      inputRequest: { question: 'Quick comparison or deeper dive?', options: ['Quick', 'Deep'] },
      events: [
        { id: 'e1', runId: 'run-1', at: T0 + 100, kind: 'status', label: 'Run started' },
        {
          id: 'e2',
          runId: 'run-1',
          at: T0 + 200,
          kind: 'input_request',
          label: 'Checking the depth you need',
        },
      ],
    })
    const entries = projectWorkThread(task)
    const clarify = findEntry(entries, 'work:clarify:task-1')
    if (!clarify || clarify.kind !== 'clarify') throw new Error('expected clarify card')
    expect(clarify.question).toContain('deeper dive')
    expect(clarify.options).toEqual(['Quick', 'Deep'])
    const activity = entries.find((entry) => entry.kind === 'activity')
    if (!activity || activity.kind !== 'activity') throw new Error('expected activity card')
    expect(activity.lines.map((line) => line.id)).toEqual(['e1'])
  })

  it('renders the current report as an assistant message plus an output card, with streaming state while running', () => {
    const task = fixtureTask({
      status: 'running',
      currentRunId: 'run-2',
      mode: 'ai-draft',
      report: {
        template: 'draft',
        markdown: '# Partial draft so far',
        artifactId: null,
        provenance: 'provider-generated',
        generatedBy: {
          providerId: 'p1',
          modelId: 'm1',
          providerLabel: 'Local Test',
          modelLabel: 'test-model',
        },
        contextIncluded: false,
        stoppedPartial: false,
        runId: 'run-2',
      },
    })
    const entries = projectWorkThread(task)
    const reportEntry = findEntry(entries, 'work:report:run-2')
    if (!reportEntry || reportEntry.kind !== 'work_message') throw new Error('expected report message')
    expect(reportEntry.message.status).toBe('streaming')
    expect(reportEntry.message.provenance).toBe('live')
    expect(reportEntry.message.statusPrefix).toBe('Draft from test-model')
    const outputCard = findEntry(entries, 'work:output:run-2')
    if (!outputCard || outputCard.kind !== 'output_card') throw new Error('expected output card')
    expect(outputCard.generatedByLabel).toBe('test-model — Local Test')
    expect(outputCard.archived).toBe(false)
  })

  it('renders prior revisions as archived output cards and keeps the newest current', () => {
    const task = fixtureTask({
      report: {
        template: 'draft',
        markdown: '# Version 2',
        artifactId: null,
        provenance: 'provider-generated',
        generatedBy: null,
        contextIncluded: false,
        stoppedPartial: false,
        runId: 'run-2',
      },
      previousReports: [
        {
          template: 'draft',
          markdown: '# Version 1',
          artifactId: null,
          provenance: 'provider-generated',
          generatedBy: null,
          contextIncluded: false,
          stoppedPartial: false,
          runId: 'run-1',
          savedAt: T0 + 30_000,
        },
      ],
    })
    const entries = projectWorkThread(task)
    const archived = findEntry(entries, `work:prev:${T0 + 30_000}`)
    if (!archived || archived.kind !== 'output_card') throw new Error('expected archived output')
    expect(archived.archived).toBe(true)
    expect(archived.title).toBe('Previous output')
    expect(findEntry(entries, 'work:report:run-2')).toBeTruthy()
  })

  it('renders honest interruption notes as warning status notes', () => {
    const task = fixtureTask({
      status: 'paused',
      interrupted: true,
      events: [
        {
          id: 'e9',
          runId: null,
          at: T0 + 900,
          kind: 'note',
          label: 'Run interrupted by a reload — resume to continue.',
        },
      ],
    })
    const entries = projectWorkThread(task)
    const note = findEntry(entries, 'work:ev:e9')
    if (!note || note.kind !== 'status_note') throw new Error('expected status note')
    expect(note.tone).toBe('warning')
    expect(note.label).toContain('interrupted')
  })

  it('projects old tasks (pre-milestone-06, no messages field) without rerunning or duplicating', () => {
    // Simulate a persisted pre-m06 task: no `messages`, no `previousReports`.
    const legacy = fixtureTask({
      events: [
        { id: 'e1', runId: 'run-1', at: T0 + 100, kind: 'created', label: 'Task created' },
        { id: 'e2', runId: 'run-1', at: T0 + 200, kind: 'plan', label: 'Read the brief' },
      ],
      report: {
        template: 'research',
        markdown: '# Legacy report',
        artifactId: 'art-1',
        provenance: 'demo-simulation',
        generatedBy: null,
        contextIncluded: false,
        stoppedPartial: false,
      },
    }) as unknown as Record<string, unknown>
    // Simulate the persisted shape: the field is simply absent.
    delete legacy.messages
    delete legacy.previousReports
    const entries = projectWorkThread(legacy as unknown as WorkTask)
    expect(findEntry(entries, 'work:goal:task-1')).toBeTruthy()
    expect(entries.some((entry) => entry.kind === 'activity')).toBe(true)
    const reportEntry = entries.find(
      (entry) => entry.kind === 'work_message' && entry.message.content.includes('Legacy'),
    )
    expect(reportEntry).toBeTruthy()
    // Report without a run id falls back to a stable "current" id.
    expect(findEntry(entries, 'work:report:current')).toBeTruthy()
  })

  it('interleaves follow-up messages between runs by timestamp', () => {
    const task = fixtureTask({
      status: 'running',
      currentRunId: 'run-2',
      events: [
        { id: 'e1', runId: 'run-1', at: T0 + 100, kind: 'plan', label: 'First run plan' },
        { id: 'e2', runId: 'run-2', at: T0 + 3_000, kind: 'status', label: 'Revision started' },
      ],
      messages: [
        {
          id: 'f1',
          role: 'user',
          content: 'Make it shorter and friendlier',
          at: T0 + 2_000,
          status: 'complete',
        },
        {
          id: 'f2',
          role: 'assistant',
          content: 'Revising with your changes — one new live request.',
          at: T0 + 2_500,
          status: 'complete',
          statusPrefix: 'Revising',
        },
      ],
    })
    const entries = projectWorkThread(task)
    const ids = entries.map((entry) => entry.entryId)
    // m07/F10: run-scoped and manual activity merged into ONE card
    // ('work:activity'), still ordered before the follow-up messages
    // that arrived after its first event.
    expect(ids).toContain('work:activity')
    expect(ids.indexOf('work:msg:f1')).toBeGreaterThan(ids.indexOf('work:activity'))
    expect(ids.indexOf('work:msg:f2')).toBeGreaterThan(ids.indexOf('work:msg:f1'))
    const activity = entries.find((entry) => entry.entryId === 'work:activity')
    if (!activity || activity.kind !== 'activity') throw new Error('expected activity card')
    expect(activity.lines.map((line) => line.id)).toEqual(['e1', 'e2'])
  })
})

/* ------------------------------------------------------------------ */
/* projectAgentThread                                                  */
/* ------------------------------------------------------------------ */

describe('projectAgentThread', () => {
  it('projects the real conversation messages in order', () => {
    const entries = projectAgentThread(fixtureConversation(), [])
    expect(entries.map((entry) => entry.entryId)).toEqual(['agent:msg:m1', 'agent:msg:m2'])
    const first = entries[0]
    if (first.kind !== 'chat_message') throw new Error('expected chat message')
    expect(first.node.content).toBe('Hello')
  })

  it('renders assignment events as task cards that link the canonical task', () => {
    const events: AgentThreadEvent[] = [
      {
        id: 'ev1',
        agentId: 'agent-1',
        kind: 'assignment',
        at: T0 + 5_000,
        label: 'Assigned: Draft a launch update',
        detail: 'Draft a launch update from these notes',
        taskId: 'task-9',
      },
    ]
    const entries = projectAgentThread(fixtureConversation(), events)
    const card = findEntry(entries, 'agent:ev:ev1')
    if (!card || card.kind !== 'task_card') throw new Error('expected task card')
    expect(card.taskId).toBe('task-9')
    // Positioned after the conversation messages by timestamp.
    expect(entries.map((entry) => entry.entryId)).toEqual([
      'agent:msg:m1',
      'agent:msg:m2',
      'agent:ev:ev1',
    ])
  })

  it('renders memory notes as success status notes', () => {
    const events: AgentThreadEvent[] = [
      {
        id: 'ev2',
        agentId: 'agent-1',
        kind: 'memory_note',
        at: T0 + 2_000,
        label: 'Remembered: prefers concise answers',
      },
    ]
    const entries = projectAgentThread(fixtureConversation(), events)
    const note = findEntry(entries, 'agent:ev:ev2')
    if (!note || note.kind !== 'status_note') throw new Error('expected status note')
    expect(note.tone).toBe('success')
  })

  it('handles a null conversation (fresh employee) with events only', () => {
    const events: AgentThreadEvent[] = [
      {
        id: 'ev3',
        agentId: 'agent-1',
        kind: 'note',
        at: T0,
        label: 'Welcome — this thread stays with this assistant.',
      },
    ]
    const entries = projectAgentThread(null, events)
    expect(entries).toHaveLength(1)
    expect(entries[0].kind).toBe('status_note')
  })
})
