import { describe, expect, it, beforeEach } from 'vitest'
import {
  saveTaskReportToLibrary,
  saveActiveReplyToLibrary,
  CanonicalSaveError,
} from '@/services/work/canonicalSave'
import { useWorkStore } from '@/state/workStore'
import { useLibraryStore } from '@/state/libraryStore'
import { useAppStore } from '@/state/store'
import type { WorkTask, TaskReport } from '@/domain/workspaceTypes'

/**
 * Milestone 07 regression suite (F01/F02 + branch-selection observation).
 *
 * The canonical save operation must guarantee: one artifact per report,
 * linked back through `report.artifactId`, provenance preserved, repeated
 * saves are no-ops, deleted links get an explicit recreate path, and
 * employee saves use the ACTIVE branch with live/demo origin kept.
 */

function seedTaskWithReport(): string {
  const taskId = useWorkStore.getState().createTask({
    title: 'Local-first software brief',
    goal: 'Research local-first',
    deliverable: 'research-report',
  })
  const report: TaskReport = {
    template: 'research',
    markdown: '# Brief\n\nSimulated body content.',
    artifactId: null,
    provenance: 'demo-simulation',
    generatedBy: null,
    contextIncluded: false,
    stoppedPartial: false,
    runId: 'run-1',
  }
  useWorkStore.setState((state) => ({
    tasks: {
      ...state.tasks,
      [taskId]: { ...state.tasks[taskId], report } as WorkTask,
    },
  }))
  return taskId
}

function libraryArtifacts() {
  return Object.values(useLibraryStore.getState().artifacts)
}

beforeEach(() => {
  useWorkStore.getState()
  useLibraryStore.getState().resetDemoData()
  useAppStore.getState()
})

describe('canonical Work report save', () => {
  it('creates exactly ONE artifact across repeated saves and links it back', () => {
    const taskId = seedTaskWithReport()

    const first = saveTaskReportToLibrary(taskId)
    const second = saveTaskReportToLibrary(taskId)
    const third = saveTaskReportToLibrary(taskId)

    expect(first.created).toBe(true)
    expect(second.created).toBe(false)
    expect(third.created).toBe(false)
    expect(second.artifactId).toBe(first.artifactId)
    expect(third.artifactId).toBe(first.artifactId)
    expect(libraryArtifacts()).toHaveLength(1)

    // The task no longer reports itself as unsaved.
    const task = useWorkStore.getState().tasks[taskId] as WorkTask
    expect(task.report?.artifactId).toBe(first.artifactId)
  })

  it('preserves demo/provider provenance instead of hard-coding user-authored', () => {
    const taskId = seedTaskWithReport()

    const result = saveTaskReportToLibrary(taskId)
    const artifact = useLibraryStore.getState().artifacts[result.artifactId]
    expect(artifact.provenance).toBe('demo-simulation')
    expect(artifact.taskId).toBe(taskId)

    // A provider-generated report keeps its model snapshot.
    useWorkStore.setState((state) => ({
      tasks: {
        ...state.tasks,
        [taskId]: {
          ...state.tasks[taskId],
          report: {
            ...(state.tasks[taskId].report as TaskReport),
            provenance: 'provider-generated',
            generatedBy: {
              providerId: 'p1',
              modelId: 'm1',
              providerLabel: 'OpenAI',
              modelLabel: 'gpt-test',
            },
          },
        } as WorkTask,
      },
    }))
    useLibraryStore.getState().deleteArtifact(result.artifactId)
    const recreated = saveTaskReportToLibrary(taskId)
    const fresh = useLibraryStore.getState().artifacts[recreated.artifactId]
    expect(recreated.recreated).toBe(true)
    expect(fresh.provenance).toBe('provider-generated')
    expect(fresh.generatedBy?.modelLabel).toBe('gpt-test')
  })

  it('updates in place when the report changes, without duplicates', () => {
    const taskId = seedTaskWithReport()
    const first = saveTaskReportToLibrary(taskId)

    useWorkStore.getState().updateReport(taskId, '# Brief\n\nRevised content.')
    const second = saveTaskReportToLibrary(taskId)

    expect(second.artifactId).toBe(first.artifactId)
    expect(libraryArtifacts()).toHaveLength(1)
    expect(useLibraryStore.getState().artifacts[first.artifactId].markdown).toContain(
      'Revised content',
    )
  })

  it('throws an honest error when there is nothing to save', () => {
    const taskId = useWorkStore.getState().createTask({
      title: 'Empty task',
      goal: 'Nothing yet',
      deliverable: 'research-report',
    })
    expect(() => saveTaskReportToLibrary(taskId)).toThrow(CanonicalSaveError)
  })
})

describe('canonical employee reply save', () => {
  it('saves the ACTIVE branch reply, not the most recently created sibling', () => {
    const { initialize } = useAppStore.getState()
    initialize()
    const state = useAppStore.getState()
    const conversationId = state.newConversation()
    const conversation = useAppStore.getState().conversations[conversationId]

    // Visible branch: user asks, assistant answers (older creation time).
    const userNode = {
      id: 'u1',
      parentId: null,
      role: 'user' as const,
      content: 'What is local-first?',
      createdAt: 1000,
      status: 'complete' as const,
    }
    const visibleReply = {
      id: 'a1',
      parentId: 'u1',
      role: 'assistant' as const,
      content: 'Local-first means your data lives on your devices.',
      createdAt: 2000,
      status: 'complete' as const,
      statusPrefix: undefined,
    }
    // Unseen sibling on another branch, created LATER (the old bug picked this).
    const unseenReply = {
      id: 'a2',
      parentId: 'u1',
      role: 'assistant' as const,
      content: 'WRONG BRANCH — regenerate output',
      createdAt: 3000,
      status: 'complete' as const,
      statusPrefix: undefined,
    }
    useAppStore.setState((s) => ({
      conversations: {
        ...s.conversations,
        [conversationId]: {
          ...conversation,
          nodes: { u1: userNode, a1: visibleReply, a2: unseenReply },
          activeLeafId: 'a1',
        },
      },
    }))

    const result = saveActiveReplyToLibrary(conversationId)
    const artifact = useLibraryStore.getState().artifacts[result.artifactId]
    expect(artifact.markdown).toContain('Local-first means')
    expect(artifact.markdown).not.toContain('WRONG BRANCH')
    expect(artifact.source?.messageId).toBe('a1')
  })

  it('keeps live origin: a Live reply saves as provider-generated', () => {
    useAppStore.getState().initialize()
    const state = useAppStore.getState()
    const conversationId = state.newConversation()
    const conversation = useAppStore.getState().conversations[conversationId]
    useAppStore.setState((s) => ({
      conversations: {
        ...s.conversations,
        [conversationId]: {
          ...conversation,
          nodes: {
            u1: {
              id: 'u1',
              parentId: null,
              role: 'user',
              content: 'hi',
              createdAt: 1000,
              status: 'complete',
            },
            a1: {
              id: 'a1',
              parentId: 'u1',
              role: 'assistant',
              content: 'A live reply.',
              createdAt: 2000,
              status: 'complete',
              statusPrefix: 'Live reply from OpenAI · GPT',
            },
          },
          activeLeafId: 'a1',
        },
      },
    }))

    const result = saveActiveReplyToLibrary(conversationId)
    const artifact = useLibraryStore.getState().artifacts[result.artifactId]
    expect(artifact.provenance).toBe('provider-generated')
    expect(artifact.generatedBy?.providerLabel).toBe('OpenAI · GPT')
  })

  it('re-saving the same reply updates the same artifact (no twin)', () => {
    useAppStore.getState().initialize()
    const state = useAppStore.getState()
    const conversationId = state.newConversation()
    const conversation = useAppStore.getState().conversations[conversationId]
    useAppStore.setState((s) => ({
      conversations: {
        ...s.conversations,
        [conversationId]: {
          ...conversation,
          nodes: {
            u1: {
              id: 'u1',
              parentId: null,
              role: 'user',
              content: 'hi',
              createdAt: 1000,
              status: 'complete',
            },
            a1: {
              id: 'a1',
              parentId: 'u1',
              role: 'assistant',
              content: 'Demo reply body.',
              createdAt: 2000,
              status: 'complete',
            },
          },
          activeLeafId: 'a1',
        },
      },
    }))

    const first = saveActiveReplyToLibrary(conversationId)
    const second = saveActiveReplyToLibrary(conversationId)
    expect(second.created).toBe(false)
    expect(second.artifactId).toBe(first.artifactId)
    expect(
      Object.values(useLibraryStore.getState().artifacts).filter(
        (artifact) => artifact.source?.messageId === 'a1',
      ),
    ).toHaveLength(1)
  })
})
