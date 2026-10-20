import { cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { MessageNode } from '@/domain/types'
import type { WorkTask } from '@/domain/workspaceTypes'
import { projectWorkThread } from '@/features/conversation/threadModel'
import { ThreadView } from '@/features/conversation/ThreadView'
import { ThreadComposer } from '@/features/conversation/ThreadComposer'
import { resetThreadDraftsForTests } from '@/features/conversation/threadDrafts'
import { resetStoreForTests, useAppStore } from '@/state/store'
import { resetWorkStoreForTests } from '@/state/workStore'
import { resetLibraryStoreForTests } from '@/state/libraryStore'

function renderWithRouter(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>)
}

afterEach(() => {
  cleanup()
  resetThreadDraftsForTests()
  resetStoreForTests()
  resetWorkStoreForTests()
  resetLibraryStoreForTests()
})

const T0 = 1_700_000_000_000

function fixtureRunningTask(): WorkTask {
  return {
    id: 'task-1',
    title: 'Compare two routers',
    goal: 'Compare two routers for the new apartment',
    deliverable: 'research-report',
    agentId: null,
    projectId: null,
    attachments: [],
    status: 'needs_input',
    mode: 'demo',
    draftConfig: null,
    createdAt: T0,
    updatedAt: T0 + 5_000,
    events: [
      { id: 'e1', runId: 'run-1', at: T0 + 100, kind: 'status', label: 'Run started (demo execution)' },
      { id: 'e2', runId: 'run-1', at: T0 + 200, kind: 'plan', label: 'Read the brief and set the scope' },
      {
        id: 'e3',
        runId: 'run-1',
        at: T0 + 300,
        kind: 'input_request',
        label: 'Checking the depth you need',
      },
    ],
    currentRunId: 'run-1',
    planCursor: 2,
    runAnswers: [],
    interrupted: false,
    report: null,
    inputRequest: { question: 'Quick comparison or deeper dive?', options: ['Quick comparison', 'Deeper dive'] },
    error: null,
    messages: [],
    previousReports: [],
  }
}

describe('ThreadView', () => {
  it('renders a projected task as a readable thread with clarify card and activity', async () => {
    const task = fixtureRunningTask()
    const entries = projectWorkThread(task)
    const onAnswer = vi.fn()
    renderWithRouter(
      <ThreadView entries={entries} ariaLabel="Task thread" onAnswerClarify={onAnswer} />,
    )

    // Goal message renders
    expect(screen.getByText(/Compare two routers for the new apartment/)).toBeInTheDocument()

    // Activity card lists the run's steps (collapsed initially — expand)
    await userEvent.click(screen.getByRole('button', { name: /^Activity/i }))
    expect(screen.getByText('Read the brief and set the scope')).toBeInTheDocument()

    // Clarify card with options
    expect(screen.getByText('Quick comparison or deeper dive?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Quick comparison' }))
    expect(onAnswer).toHaveBeenCalledWith('Quick comparison')

    // Free-text answer path
    await userEvent.type(screen.getByLabelText('Free-text answer'), 'Something custom')
    await userEvent.click(screen.getByRole('button', { name: 'Send free-text answer' }))
    expect(onAnswer).toHaveBeenCalledWith('Something custom')
  })

  it('renders chat messages through the shared entry view', () => {
    const user: MessageNode = {
      id: 'm1',
      parentId: null,
      role: 'user',
      content: 'Hello from the employee thread',
      createdAt: T0,
      status: 'complete',
    }
    const conversation = {
      id: 'c1',
      title: 'Agent chat',
      createdAt: T0,
      updatedAt: T0,
      pinned: false,
      archived: false,
      temporary: false,
      agentId: 'agent-1',
      nodes: { m1: user },
      activeLeafId: 'm1',
    }
    const entries = [
      {
        kind: 'chat_message' as const,
        entryId: 'agent:msg:m1',
        at: T0,
        node: user,
        conversation,
      },
      {
        kind: 'status_note' as const,
        entryId: 'agent:ev:1',
        at: T0 + 1_000,
        tone: 'success' as const,
        label: 'Remembered: prefers concise answers',
      },
    ]
    renderWithRouter(<ThreadView entries={entries} ariaLabel="Employee thread" />)
    expect(screen.getByText('Hello from the employee thread')).toBeInTheDocument()
    expect(screen.getByText('Remembered: prefers concise answers')).toBeInTheDocument()
  })
})

describe('ThreadComposer', () => {
  it('sends typed text and clears the draft', async () => {
    const onSend = vi.fn()
    renderWithRouter(
      <ThreadComposer
        draftKey="work:task-1"
        textareaId="work-composer"
        ariaLabel="Describe the outcome"
        placeholder="Describe an outcome…"
        statusLabel="Demo execution — local"
        onSend={onSend}
      />,
    )
    const textarea = screen.getByLabelText('Describe the outcome')
    await userEvent.type(textarea, 'Draft a launch update')
    await userEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(onSend).toHaveBeenCalledWith('Draft a launch update')
    await waitFor(() => expect(screen.getByLabelText('Describe the outcome')).toHaveValue(''))
  })

  it('shows Stop instead of Send while busy', () => {
    const onStop = vi.fn()
    renderWithRouter(
      <ThreadComposer
        draftKey="work:task-1"
        textareaId="work-composer"
        ariaLabel="Describe the outcome"
        placeholder="Describe an outcome…"
        statusLabel="Running"
        onSend={() => undefined}
        busy
        onStop={onStop}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument()
    screen.getByRole('button', { name: 'Stop' })
  })

  it('preserves drafts per thread key across remounts', async () => {
    const onSend = vi.fn()
    const { unmount } = renderWithRouter(
      <ThreadComposer
        draftKey="work:task-1"
        textareaId="work-composer"
        ariaLabel="Describe the outcome"
        placeholder="Describe an outcome…"
        statusLabel="x"
        onSend={onSend}
      />,
    )
    await userEvent.type(screen.getByLabelText('Describe the outcome'), 'unfinished thought')
    unmount()

    renderWithRouter(
      <ThreadComposer
        draftKey="work:task-2"
        textareaId="work-composer"
        ariaLabel="Describe the outcome"
        placeholder="Describe an outcome…"
        statusLabel="x"
        onSend={onSend}
      />,
    )
    // Different thread → its own (empty) draft, no mixing.
    expect(screen.getByLabelText('Describe the outcome')).toHaveValue('')
    // Unmount so the next assertion is not ambiguous (RTL queries are
    // document-scoped while multiple renders stay mounted).
    cleanup()

    const second = renderWithRouter(
      <ThreadComposer
        draftKey="work:task-1"
        textareaId="work-composer"
        ariaLabel="Describe the outcome"
        placeholder="Describe an outcome…"
        statusLabel="x"
        onSend={onSend}
      />,
    )
    // Same thread → the draft survived the unmount.
    await waitFor(() =>
      expect(second.getByLabelText('Describe the outcome')).toHaveValue('unfinished thought'),
    )
  })

  it('renders quick actions and honors disabled state', async () => {
    const onSend = vi.fn()
    const onAction = vi.fn()
    renderWithRouter(
      <ThreadComposer
        draftKey="agent:agent-1"
        textareaId="agent-composer"
        ariaLabel="Message your assistant"
        placeholder="Message…"
        statusLabel="Local demo"
        onSend={onSend}
        disabled
        disabledHint="This employee is unavailable"
        actions={[{ id: 'assign', label: 'Assign work', onRun: onAction }]}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Assign work' }))
    expect(onAction).toHaveBeenCalled()
    const textarea = screen.getByLabelText('Message your assistant')
    await userEvent.type(textarea, 'hello')
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
    expect(onSend).not.toHaveBeenCalled()
  })
})

describe('thread drafts are separate from app data', () => {
  it('never appear in the app export', () => {
    useAppStore.getState().initialize()
    const onSend = vi.fn()
    renderWithRouter(
      <ThreadComposer
        draftKey="work:task-1"
        textareaId="work-composer"
        ariaLabel="Describe the outcome"
        placeholder="Describe an outcome…"
        statusLabel="x"
        onSend={onSend}
      />,
    )
    const exported = JSON.stringify(useAppStore.getState().exportAllData())
    expect(exported).not.toContain('unfinished')
    expect(exported).not.toContain('thread-drafts')
  })
})
