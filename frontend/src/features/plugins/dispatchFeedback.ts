import type { DispatchOutcome } from '@/services/plugins/dispatcher'
import { usePluginsStore } from '@/state/pluginsStore'
import { useAppStore } from '@/state/store'

/**
 * One result handler for every plugin dispatch caller (milestone 07,
 * fixes F03). Success, denial, cancellation, and failure are all
 * reported — never discarded — and denials carry a recovery path:
 *
 * - not-enabled → toast links to the Plugins catalogue.
 * - not-allowed-for-agent → toast offers a one-tap "Allow for this
 *   employee" that fixes the actual permission (the plugin is still not
 *   run; the user re-invokes it).
 * - not-granted-for-thread → the message points at the composer picker.
 *
 * The dispatcher already recorded an honest receipt for access
 * rejections, so the thread history and the toast agree.
 */

export interface DispatchFeedbackOptions {
  /** Router navigate, for catalogue deep links. */
  navigate?: (to: string) => void
  /** Employee in scope, when the action ran from an employee thread. */
  agentId?: string | null
  /** Plugin the action belonged to (used by the one-tap Allow recovery). */
  pluginId?: string | null
}

export function reportDispatchOutcome(
  outcome: DispatchOutcome,
  options: DispatchFeedbackOptions = {},
): void {
  const { navigate, agentId } = options

  if (outcome.ok) {
    const receipt = usePluginsStore
      .getState()
      .receipts.find((entry) => entry.id === outcome.runId)
    useAppStore
      .getState()
      .showToast(receipt?.summary ?? 'The plugin action completed.')
    return
  }

  switch (outcome.code) {
    case 'not-enabled':
      useAppStore.getState().showToast(outcome.message, {
        actionLabel: 'Open Plugins',
        onAction: () => navigate?.('/plugins'),
      })
      return
    case 'not-allowed-for-agent': {
      const plugins = usePluginsStore.getState()
      if (agentId && options.pluginId) {
        useAppStore.getState().showToast(
          `${outcome.message} The action was not run — allow it, then try again. (Review anytime from the employee’s details → Plugins.)`,
          {
            actionLabel: 'Allow for this employee',
            onAction: () => {
              const current = plugins.agentAllowed[agentId] ?? []
              plugins.setAgentAllowed(agentId, [...current, options.pluginId as string])
            },
          },
        )
      } else {
        useAppStore.getState().showToast(outcome.message)
      }
      return
    }
    case 'not-granted-for-thread':
      useAppStore.getState().showToast(
        `${outcome.message} The plugin picker sits next to the composer in this thread.`,
      )
      return
    default:
      useAppStore.getState().showToast(outcome.message)
  }
}
