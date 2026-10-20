import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Puzzle, X } from 'lucide-react'
import type { PluginManifest, PluginThreadRef } from '@/domain/pluginTypes'
import { PLUGIN_CATALOG, findPlugin } from './registry'
import { usePluginsStore } from '@/state/pluginsStore'
import { useLibraryStore } from '@/state/libraryStore'
import {
  dispatch,
  revokeAndCancelThreadRuns,
  threadKeyOf,
  type DispatchRequest,
} from '@/services/plugins/dispatcher'
import { registerBuiltInAdapters } from '@/services/plugins/adapters'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { Dialog } from '@/components/ui/Dialog'
import '@/services/plugins/adapters'
import { PLUGIN_ACTIONS } from './pluginActions'
import type { PluginActionSpec } from './pluginActions'
import { reportDispatchOutcome } from './dispatchFeedback'

/**
 * The composer plugin bar (milestone 06): granted-plugin chips with their
 * real actions, and a picker that grants/revokes per thread. Granting
 * happens in the composer so the user returns to the same draft; the
 * dispatcher still enforces every check at execution time.
 */


export function ThreadPluginBar({
  thread,
  agentId,
}: {
  thread: PluginThreadRef
  agentId: string | null
}) {
  registerBuiltInAdapters()
  const navigate = useNavigate()
  const enabled = usePluginsStore((state) => state.enabled)
  const agentAllowed = usePluginsStore((state) => state.agentAllowed)
  const threadGrants = usePluginsStore((state) => state.threadGrants)
  const grantThread = usePluginsStore((state) => state.grantThread)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false)

  const key = threadKeyOf(thread) ?? ''
  const granted = threadGrants[key] ?? []
  const enabledBuiltins = useMemo(
    () => PLUGIN_CATALOG.filter((plugin) => plugin.builtin && enabled[plugin.id]),
    [enabled],
  )

  function requestFor(spec: PluginActionSpec, plugin: PluginManifest): DispatchRequest {
    return {
      pluginId: plugin.id,
      capability: spec.capability,
      actionLabel: spec.actionLabel,
      thread,
      agentId,
    }
  }

  async function runAction(plugin: PluginManifest, spec: PluginActionSpec) {
    if (spec.capability === 'data.analyze') {
      fileInputRef.current?.click()
      return
    }
    if (spec.capability === 'library.search') {
      setLibraryPickerOpen(true)
      return
    }
    // documents.create / documents.save — the adapter derives content
    // from the thread itself.
    const input =
      spec.capability === 'documents.save' && thread.kind === 'work'
        ? { taskId: thread.taskId }
        : spec.capability === 'documents.create'
          ? { title: 'New document' }
          : undefined
    // Every outcome is reported — success, denial, cancellation, error.
    // Denials carry a recovery path (enable / allow / grant).
    const outcome = await dispatch(requestFor(spec, plugin), input)
    reportDispatchOutcome(outcome, { navigate, agentId, pluginId: plugin.id })
  }

  return (
    <div className="mx-auto w-full max-w-column px-3 pt-1 sm:px-4">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        aria-label="Select a CSV file to analyze"
        onChange={async (event) => {
          const file = event.target.files?.[0] ?? null
          event.target.value = ''
          if (!file) return
          const plugin = findPlugin('data-analysis')
          if (!plugin) return
          const result = await dispatch(
            {
              pluginId: plugin.id,
              capability: 'data.analyze',
              actionLabel: `Analyze ${file.name}`,
              thread,
              agentId,
            },
            { file },
          )
          reportDispatchOutcome(result, { navigate, agentId, pluginId: plugin.id })
        }}
      />

      <div className="flex flex-wrap items-center gap-1.5">
        {granted
          .map((pluginId) => findPlugin(pluginId))
          .filter((plugin): plugin is PluginManifest => !!plugin)
          .map((plugin) => (
            <div
              key={plugin.id}
              className="inline-flex items-center overflow-hidden rounded-full border border-accent/40 bg-accent-soft/60"
            >
              <Menu
                label={`${plugin.name} actions`}
                trigger={
                  <button
                    type="button"
                    aria-label={`${plugin.name} actions`}
                    className="min-touch flex items-center gap-1.5 py-1.5 pl-2.5 pr-1 text-xs font-medium text-accent transition-colors hover:bg-accent/10"
                  >
                    <Puzzle size={12} />
                    {plugin.name}
                  </button>
                }
              >
                {(PLUGIN_ACTIONS[plugin.id] ?? []).map((spec) => (
                  <MenuItem
                    key={spec.capability}
                    onClick={() => {
                      void runAction(plugin, spec)
                    }}
                  >
                    {spec.actionLabel}
                  </MenuItem>
                ))}
                <MenuItem
                  danger
                  onClick={() => revokeAndCancelThreadRuns(thread, plugin.id)}
                >
                  Revoke from this thread
                </MenuItem>
              </Menu>
              <button
                type="button"
                aria-label={`Revoke ${plugin.name} from this thread`}
                onClick={() => revokeAndCancelThreadRuns(thread, plugin.id)}
                className="min-touch py-1.5 pr-2 text-accent/70 transition-colors hover:text-accent"
              >
                <X size={11} />
              </button>
            </div>
          ))}

        <Menu
          label="Plugin picker"
          trigger={
            <button
              type="button"
              aria-label="Plugin picker"
              title="Grant plugins to this thread"
              className="min-touch inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-subtle hover:text-ink"
            >
              <Puzzle size={12} />
              Plugins
            </button>
          }
        >
          {enabledBuiltins.length === 0 ? (
            <>
              <MenuItem disabled hint="Enable built-ins in Plugins first">
                No enabled plugins
              </MenuItem>
              <MenuItem
                hint="Opens the plugin catalogue"
                onClick={() => navigate('/plugins')}
              >
                Manage Plugins…
              </MenuItem>
            </>
          ) : (
            enabledBuiltins.map((plugin) => {
              const isGranted = granted.includes(plugin.id)
              // Surface the same intersection the dispatcher enforces:
              // workspace enabled vs employee allowed vs thread granted.
              const notAllowedForAgent = !!agentId && !(agentAllowed[agentId] ?? []).includes(plugin.id)
              const hint = notAllowedForAgent
                ? 'Enabled, but not allowed for this employee yet'
                : isGranted
                  ? 'Granted to this thread'
                  : plugin.description
              return (
                <MenuItem
                  key={plugin.id}
                  hint={hint}
                  onClick={() => {
                    if (isGranted) {
                      revokeAndCancelThreadRuns(thread, plugin.id)
                    } else {
                      grantThread(key, plugin.id)
                    }
                  }}
                >
                  {isGranted ? `✓ ${plugin.name}` : plugin.name}
                </MenuItem>
              )
            })
          )}
        </Menu>
      </div>

      {libraryPickerOpen && (
        <LibraryContextDialog
          thread={thread}
          agentId={agentId}
          onClose={() => setLibraryPickerOpen(false)}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Library context — pick a real document, attach it explicitly         */
/* ------------------------------------------------------------------ */

function LibraryContextDialog({
  thread,
  agentId,
  onClose,
}: {
  thread: PluginThreadRef
  agentId: string | null
  onClose: () => void
}) {
  const artifacts = useLibraryStore((state) => state.artifacts)
  const searchRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLowerCase()
  const list = useMemo(
    () =>
      Object.values(artifacts)
        .filter((artifact) =>
          normalized ? artifact.title.toLowerCase().includes(normalized) : true,
        )
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 8),
    [artifacts, normalized],
  )

  async function attach(artifactId: string) {
    const plugin = findPlugin('library-context')
    if (!plugin) return
    onClose()
    const result = await dispatch(
      {
        pluginId: plugin.id,
        capability: 'library.attach',
        actionLabel: 'Attach Library context',
        thread,
        agentId,
      },
      { artifactId, thread },
    )
    reportDispatchOutcome(result, { agentId, pluginId: plugin.id })
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Attach Library context"
      description="Only the document you pick is attached, within the thread’s explicit context limits. Nothing is attached automatically."
      size="sm"
      initialFocusRef={searchRef}
    >
      <input
        ref={searchRef}
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search your documents"
        aria-label="Search your documents"
        className="mb-3 min-touch w-full rounded-control border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
      />
      <ul className="flex max-h-72 flex-col gap-1">
        {list.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-ink-faint">
            No local documents{normalized ? ' match that search' : ' yet'}.
          </li>
        ) : (
          list.map((artifact) => (
            <li key={artifact.id}>
              <button
                type="button"
                onClick={() => void attach(artifact.id)}
                className="flex w-full items-center gap-3 rounded-control px-2.5 py-2 text-left transition-colors hover:bg-subtle"
              >
                <FileText size={15} className="shrink-0 text-ink-faint" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {artifact.title}
                  </span>
                  <span className="block text-xs text-ink-faint">
                    {artifact.kind} · ≈{artifact.markdown.length} characters
                  </span>
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
    </Dialog>
  )
}
