import { describe, expect, it } from 'vitest'
import { dispatch } from '@/services/plugins/dispatcher'
import { registerBuiltInAdapters } from '@/services/plugins/adapters'
import { usePluginsStore, resetPluginsStoreForTests } from '@/state/pluginsStore'
import { reportDispatchOutcome } from '@/features/plugins/dispatchFeedback'
import { useAppStore } from '@/state/store'

/**
 * Milestone 07 regression suite (F03): plugin actions must always explain
 * their outcome. A denial is visible (toast with a recovery path) and is
 * recorded as an honest receipt — never silently discarded, never labeled
 * as executed.
 */

const AGENT_THREAD = {
  kind: 'agent' as const,
  agentId: 'agent-1',
  conversationId: 'conv-1',
}

const CREATE_REQUEST = {
  pluginId: 'documents',
  capability: 'documents.create' as const,
  actionLabel: 'Create Canvas document',
  thread: AGENT_THREAD,
  agentId: 'agent-1',
}

describe('dispatch denial feedback (F03)', () => {
  it('records an honest receipt for an access rejection and reports it', async () => {
    resetPluginsStoreForTests()
    usePluginsStore.getState().initialize()
    registerBuiltInAdapters()
    useAppStore.getState().initialize()
    useAppStore.getState().dismissToast()

    // Workspace enabled + thread granted, but NOT allowed for the agent —
    // the exact F03 reproduction setup.
    const store = usePluginsStore.getState()
    store.enablePlugin('documents')
    store.grantThread('agent:conv-1', 'documents')
    expect(store.isAgentAllowed('agent-1', 'documents')).toBe(false)

    const receiptsBefore = usePluginsStore.getState().receipts.length
    const outcome = await dispatch(CREATE_REQUEST, { title: 'New document' })

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.code).toBe('not-allowed-for-agent')

    // The rejected attempt is recorded — marked as an error, never success.
    const receipts = usePluginsStore.getState().receipts
    expect(receipts.length).toBe(receiptsBefore + 1)
    const rejection = receipts[0]
    expect(rejection.status).toBe('error')
    expect(rejection.error).toMatch(/Not executed/)
    expect(rejection.thread).toEqual(AGENT_THREAD)

    // The shared feedback handler surfaces the denial with a recovery
    // action instead of discarding it.
    reportDispatchOutcome(outcome, { agentId: 'agent-1', pluginId: 'documents' })
    const toast = useAppStore.getState().toast
    expect(toast?.message).toMatch(/not allowed for this employee/i)
    expect(toast?.actionLabel).toBe('Allow for this employee')

    // The recovery action actually fixes the permission.
    toast?.onAction?.()
    expect(usePluginsStore.getState().isAgentAllowed('agent-1', 'documents')).toBe(true)

    // After allowing, the same action runs for real.
    const retry = await dispatch(CREATE_REQUEST, { title: 'New document' })
    expect(retry.ok).toBe(true)
  })

  it('points at the Plugins catalogue when the plugin is not enabled', async () => {
    resetPluginsStoreForTests()
    usePluginsStore.getState().initialize()
    registerBuiltInAdapters()
    useAppStore.getState().initialize()
    useAppStore.getState().dismissToast()

    const outcome = await dispatch(CREATE_REQUEST, { title: 'New document' })
    expect(outcome.ok).toBe(false)

    let navigatedTo: string | null = null
    reportDispatchOutcome(outcome, {
      navigate: (to) => {
        navigatedTo = to
      },
      pluginId: 'documents',
    })
    expect(useAppStore.getState().toast?.actionLabel).toBe('Open Plugins')
    // The recovery action navigates to the catalogue.
    useAppStore.getState().toast?.onAction?.()
    expect(navigatedTo).toBe('/plugins')
  })

  it('success outcomes surface the receipt summary', async () => {
    resetPluginsStoreForTests()
    usePluginsStore.getState().initialize()
    registerBuiltInAdapters()
    useAppStore.getState().initialize()
    useAppStore.getState().dismissToast()

    const store = usePluginsStore.getState()
    store.enablePlugin('documents')
    store.setAgentAllowed('agent-1', ['documents'])
    store.grantThread('agent:conv-1', 'documents')

    const outcome = await dispatch(CREATE_REQUEST, { title: 'Feedback test doc' })
    expect(outcome.ok).toBe(true)

    reportDispatchOutcome(outcome, { agentId: 'agent-1', pluginId: 'documents' })
    expect(useAppStore.getState().toast?.message).toMatch(/Feedback test doc/)
  })
})
