import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  resetWorkStoreForTests,
  setAiAdapterFactoryForTests,
  useWorkStore,
} from '@/state/workStore'
import { resetAgentsStoreForTests, useAgentsStore } from '@/state/agentsStore'
import { resetStoreForTests, useAppStore } from '@/state/store'
import { resetPluginsStoreForTests } from '@/state/pluginsStore'
import { resetThreadDraftsForTests } from '@/features/conversation/threadDrafts'
import type { ChatAdapter } from '@/domain/chatAdapter'
import { renderApp, setupAppTest } from './helpers'

/**
 * Milestone-06 regressions the brief calls out explicitly: multi-turn Work
 * context in the live revision request (with the explicit budget), storage
 * migration for pre-milestone slices, and drafts across mode switches.
 */

describe('Work revision request includes real multi-turn context', () => {
  beforeEach(() => {
    resetStoreForTests()
    resetWorkStoreForTests()
    resetAgentsStoreForTests()
    resetPluginsStoreForTests()
    resetThreadDraftsForTests()
    useAppStore.getState().initialize()
    useAgentsStore.getState().initialize()
    useWorkStore.getState().initialize()
  })
  afterEach(() => {
    setAiAdapterFactoryForTests(null)
  })

  function connectFakeProvider(): string {
    // The seeded demo provider is enough — connect a fake credential to it
    // through the real store action (never persisted in these tests).
    const provider = useAppStore.getState().providers[0]
    useAppStore.getState().setCredential(provider.id, {
      providerId: provider.id,
      apiKey: 'test-key-DO-NOT-PERSIST',
      status: 'connected',
      lastCheckedAt: Date.now(),
      lastError: null,
      discoveredModels: [],
    })
    return provider.id
  }

  it('a follow-up revision sends goal, bounded thread, and the previous draft', async () => {
    connectFakeProvider()

    let capturedPrompt = ''
    let capturedSystem = ''
    let callCount = 0
    const fakeAdapter: ChatAdapter = {
      id: 'fake-live',
      label: 'Fake live',
      stream: (request, handlers) => {
        capturedPrompt = request.prompt
        capturedSystem = request.system ?? ''
        callCount += 1
        handlers.onStart?.({})
        handlers.onDelta?.(callCount === 1 ? '# First draft\n\nInitial.' : '# Revised draft\n\nBetter.')
        handlers.onDone?.('complete')
        return Promise.resolve()
      },
    }
    setAiAdapterFactoryForTests(() => fakeAdapter)

    const providerId = connectFakeProvider()
    const provider = useAppStore.getState().providers.find((p) => p.id === providerId)!
    const model = provider.models[0]
    const taskId = useWorkStore.getState().createTask({
      title: 'Launch note',
      goal: 'Draft a launch update from these notes',
      deliverable: 'research-report',
      mode: 'ai-draft',
      draftConfig: {
        model: {
          providerId,
          modelId: model.id,
          providerLabel: provider.label,
          modelLabel: model.label,
        },
        instructions: 'Keep it warm.',
        contextText: 'Ships Friday.',
      },
    })

    useWorkStore.getState().runTask(taskId)
    await waitFor(() => {
      expect(useWorkStore.getState().tasks[taskId].status).toBe('ready_for_review')
    })

    // A real follow-up triggers the revision with the thread included.
    useWorkStore.getState().sendFollowUp(taskId, 'Make it shorter and friendlier')

    await waitFor(() => {
      expect(useWorkStore.getState().tasks[taskId].status).toBe('ready_for_review')
    })

    expect(capturedPrompt).toContain('REVISION request')
    expect(capturedPrompt).toContain('Make it shorter and friendlier')
    expect(capturedPrompt).toContain('Previous draft to revise')
    // Selected context and instructions ride in the system prompt.
    expect(capturedSystem).toContain('Keep it warm.')
    expect(capturedSystem).toContain('Ships Friday.')

    // The previous output was archived, not discarded.
    const task = useWorkStore.getState().tasks[taskId]
    expect(task.previousReports).toHaveLength(1)
    expect(task.previousReports[0].markdown).toContain('First draft') // archived the FIRST draft
    expect(task.report?.markdown).toContain('Better.')
  })

  it('bounds a long follow-up thread to the explicit budget', async () => {
    connectFakeProvider()

    let capturedPrompt = ''
    const fakeAdapter: ChatAdapter = {
      id: 'fake-live',
      label: 'Fake live',
      stream: (request, handlers) => {
        capturedPrompt = request.prompt
        handlers.onStart?.({})
        handlers.onDone?.('complete')
        return Promise.resolve()
      },
    }
    setAiAdapterFactoryForTests(() => fakeAdapter)

    const providerId = connectFakeProvider()
    const provider = useAppStore.getState().providers.find((p) => p.id === providerId)!
    const model = provider.models[0]
    const taskId = useWorkStore.getState().createTask({
      title: 'Long thread',
      goal: 'Draft something',
      deliverable: 'research-report',
      mode: 'ai-draft',
      draftConfig: {
        model: {
          providerId,
          modelId: model.id,
          providerLabel: provider.label,
          modelLabel: model.label,
        },
        instructions: '',
        contextText: '',
      },
    })

    // Store a very long follow-up thread directly (the honest path is the
    // composer; here we verify the request builder's budget).
    useWorkStore.getState().appendTaskMessage(taskId, {
      role: 'user',
      content: `OLD ${'x'.repeat(9000)}`,
    })
    useWorkStore.getState().appendTaskMessage(taskId, {
      role: 'user',
      content: 'the newest instruction',
    })
    // The first run already includes the stored thread, bounded.
    useWorkStore.getState().runTask(taskId)

    await waitFor(() => {
      expect(useWorkStore.getState().tasks[taskId].status).not.toBe('running')
    })

    // The tail is kept (newest instruction), the ancient one is truncated.
    expect(capturedPrompt).toContain('the newest instruction')
    expect(capturedPrompt).not.toContain('x'.repeat(8000))
  })
})

describe('storage migration — pre-milestone slices keep loading', () => {
  it('an agents slice without threadEvents loads with empty events (no wipe)', () => {
    const legacy = {
      version: 1,
      savedAt: Date.now(),
      payload: {
        agents: [
          {
            id: 'agent-legacy',
            name: 'Legacy Assistant',
            description: 'Old',
            instructions: 'Be helpful.',
            category: 'personal',
            providerId: null,
            modelId: null,
            tools: [],
            projectIds: [],
            starters: [],
            archived: false,
            builtin: false,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
        memoryNotes: [],
        schedules: [],
      },
    }
    localStorage.setItem('universe:agents:v1', JSON.stringify(legacy))
    resetAgentsStoreForTests({ keepStorage: true })
    useAgentsStore.getState().initialize()

    expect(useAgentsStore.getState().agents['agent-legacy']?.name).toBe('Legacy Assistant')
    expect(Object.keys(useAgentsStore.getState().threadEvents)).toHaveLength(0)
  })

  it('a work slice without messages/previousReports projects an empty thread', () => {
    const legacyTask = {
      id: 'task-legacy',
      title: 'Old task',
      goal: 'Old goal',
      deliverable: 'research-report',
      agentId: null,
      projectId: null,
      attachments: [],
      status: 'completed',
      mode: 'demo',
      draftConfig: null,
      createdAt: 1,
      updatedAt: 2,
      events: [
        { id: 'e1', runId: 'r1', at: 1, kind: 'plan', label: 'Old plan step' },
      ],
      currentRunId: null,
      planCursor: 1,
      runAnswers: [],
      interrupted: false,
      report: null,
      inputRequest: null,
      error: null,
      // No messages / previousReports — the pre-m06 shape.
    }
    localStorage.setItem(
      'universe:work:v1',
      JSON.stringify({ version: 1, savedAt: Date.now(), payload: { tasks: [legacyTask] } }),
    )
    resetWorkStoreForTests({ keepStorage: true })
    useWorkStore.getState().initialize()

    const task = useWorkStore.getState().tasks['task-legacy']
    expect(task).toBeTruthy()
    expect(task?.messages).toEqual([])
    expect(task?.previousReports).toEqual([])
    expect(task?.events).toHaveLength(1)
  })
})

describe('drafts survive switching between Chat, Work, and an employee', () => {
  setupAppTest()

  it('keeps three separate drafts and restores each on return', async () => {
    renderApp('/')

    // Chat draft
    await userEvent.type(screen.getByLabelText(/Message Uni/i), 'chat draft thought')

    // Work draft
    const primaryNav = screen.getByRole('navigation', { name: 'Primary' })
    await userEvent.click(within(primaryNav).getByRole('button', { name: 'Work' }))
    await userEvent.type(
      screen.getByLabelText('Describe an outcome'),
      'work draft thought',
    )

    // Employee draft
    await userEvent.click(within(primaryNav).getByRole('button', { name: 'Agents' }))
    await userEvent.click(
      await within(screen.getByRole('main')).findByText('Research Analyst'),
    )
    await userEvent.type(
      screen.getByLabelText(/Message Research Analyst/i),
      'employee draft thought',
    )

    // Return to Work: its draft is intact and the others did not leak in.
    await userEvent.click(within(primaryNav).getByRole('button', { name: 'Work' }))
    expect(await screen.findByLabelText('Describe an outcome')).toHaveValue('work draft thought')

    // Back to the employee: its draft survived too (the chat draft belongs
    // to the chat surface and is covered by the composerDrafts suite).
    await userEvent.click(within(primaryNav).getByRole('button', { name: 'Agents' }))
    await userEvent.click(
      await within(screen.getByRole('main')).findByText('Research Analyst'),
    )
    expect(
      await screen.findByLabelText(/Message Research Analyst/i),
    ).toHaveValue('employee draft thought')
  })
})

vi.mock('@/features/chat/exportUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/chat/exportUtils')>()
  return { ...actual, downloadText: vi.fn() }
})
