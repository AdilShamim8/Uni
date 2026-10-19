import { useMemo, useRef, useState } from 'react'
import { FileText, Puzzle, X } from 'lucide-react'
import type { PluginManifest, PluginThreadRef } from '@/domain/pluginTypes'
import { PLUGIN_CATALOG, findPlugin } from './registry'
import { usePluginsStore } from '@/state/pluginsStore'
import { useLibraryStore } from '@/state/libraryStore'
import { dispatch, revokeAndCancelThreadRuns, type DispatchRequest } from '@/services/plugins/dispatcher'
import { registerBuiltInAdapters } from '@/services/plugins/adapters'
import { Menu, MenuItem } from '@/components/ui/Menu'
import '@/services/plugins/adapters'
import { PLUGIN_ACTIONS } from './pluginActions'
import type { PluginActionSpec } from './pluginActions'

/**
 * The composer plugin bar (milestone 06): granted-plugin chips with their
 * real actions, and a picker that grants/revokes per thread. Granting
 * happens in the composer so the user returns to the same draft; the
 * dispatcher still enforces every check at execution time.
 */


function threadKeyOf(thread: PluginThreadRef): string {
  return thread.kind === 'work' ? `work:${thread.taskId}` : `agent:${thread.conversationId}`
}

export function ThreadPluginBar({
  thread,
  agentId,
}: {
  thread: PluginThreadRef
  agentId: string | null
}) {
  registerBuiltInAdapters()
  const enabled = usePluginsStore((state) => state.enabled)
  const threadGrants = usePluginsStore((state) => state.threadGrants)
  const grantThread = usePluginsStore((state) => state.grantThread)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false)

  const key = threadKeyOf(thread)
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
          ? { title: thread.kind === 'work' ? 'New document' : 'New document' }
          : undefined
    await dispatch(requestFor(spec, plugin), input)
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
          if (!result.ok) {
            const { useAppStore } = await import('@/state/store')
            useAppStore.getState().showToast(result.message)
          }
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
            <MenuItem disabled hint="Enable built-ins in Plugins first">
              No enabled plugins
            </MenuItem>
          ) : (
            enabledBuiltins.map((plugin) => {
              const isGranted = granted.includes(plugin.id)
              return (
                <MenuItem
                  key={plugin.id}
                  hint={isGranted ? 'Granted to this thread' : plugin.description}
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
    await dispatch(
      {
        pluginId: plugin.id,
        capability: 'library.attach',
        actionLabel: 'Attach Library context',
        thread,
        agentId,
      },
      { artifactId, thread },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-scrim" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Attach Library context"
        className="relative flex w-full max-w-md flex-col overflow-hidden rounded-[20px] border border-line bg-mat-sidebar shadow-float"
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
          <p className="text-[14px] font-semibold text-ink">Attach Library context</p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="min-touch rounded-full p-1.5 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
          >
            <X size={16} />
          </button>
        </div>
        <p className="px-4 text-xs leading-relaxed text-ink-soft">
          Only the document you pick is attached, within the thread’s explicit context limits.
          Nothing is attached automatically.
        </p>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your documents"
          aria-label="Search your documents"
          className="mx-4 mt-3 min-touch rounded-control border border-line bg-panel px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
        />
        <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto p-3">
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
      </div>
    </div>
  )
}
