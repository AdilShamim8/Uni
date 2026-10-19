import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart3,
  Check,
  FolderOpen,
  Github,
  Globe,
  Mail,
  Puzzle,
  Search,
  Settings2,
  X,
} from 'lucide-react'
import { PLUGIN_CATEGORY_LABELS, type PluginCategory, type PluginManifest } from '@/domain/pluginTypes'
import { PLUGIN_CATALOG } from './registry'
import { usePluginsStore } from '@/state/pluginsStore'
import { Button } from '@/components/ui/Button'
import { StatusPill } from '@/components/ui/StatusPill'
import { HeaderExtras } from '@/components/layout/HeaderExtras'
import { PageToolbar } from '@/components/layout/PageToolbar'
import { MobileMenuButton } from '@/components/layout/MobileMenuButton'

/**
 * Plugins — a calm tools destination: discover, enable, configure, and
 * inspect integrations. Enabling a built-in enables local code that
 * already ships (Enable/Disable — no fictitious install flow). External
 * entries stay honest "Integration required" descriptions and can never
 * show a connected state.
 */
export function PluginsPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = selectedId ? PLUGIN_CATALOG.find((p) => p.id === selectedId) : undefined

  if (selected) {
    return (
      <PluginDetail
        plugin={selected}
        onBack={() => setSelectedId(null)}
      />
    )
  }
  return <PluginCatalogue onOpen={setSelectedId} />
}

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

const CATEGORY_ICON: Record<PluginCategory, React.ReactNode> = {
  documents: <FolderOpen size={16} />,
  data: <BarChart3 size={16} />,
  productivity: <Settings2 size={16} />,
  development: <Github size={16} />,
  custom: <Puzzle size={16} />,
}

function PluginCatalogue({ onOpen }: { onOpen: (id: string) => void }) {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<PluginCategory | 'all'>('all')
  const [view, setView] = useState<'discover' | 'enabled'>('discover')
  const enabled = usePluginsStore((state) => state.enabled)

  const visible = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    return PLUGIN_CATALOG.filter((plugin) => {
      if (view === 'enabled' && !enabled[plugin.id]) return false
      if (category !== 'all' && plugin.category !== category) return false
      if (
        normalized &&
        !plugin.name.toLowerCase().includes(normalized) &&
        !plugin.description.toLowerCase().includes(normalized)
      ) {
        return false
      }
      return true
    })
  }, [query, category, view, enabled])

  const categories: (PluginCategory | 'all')[] = [
    'all',
    'documents',
    'data',
    'productivity',
    'development',
  ]

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageToolbar>
        <div className="lg:hidden">
          <MobileMenuButton />
        </div>
        <h1 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
          <Puzzle size={16} className="text-ink-faint" />
          Plugins
        </h1>
        <span className="hidden text-xs text-ink-faint sm:inline">
          Local tools — enabled per workspace
        </span>
        <div className="flex-1" />
        <HeaderExtras />
      </PageToolbar>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-column px-3 py-6 sm:px-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-ink">Plugins</h2>
              <p className="mt-0.5 text-sm text-ink-soft">
                Enable local tools for threads and employees. Nothing here connects to an
                external service on its own.
              </p>
            </div>
            <div
              role="tablist"
              aria-label="Plugin views"
              className="flex gap-1 rounded-control border border-line bg-raised p-1"
            >
              {(['discover', 'enabled'] as const).map((entry) => (
                <button
                  key={entry}
                  type="button"
                  role="tab"
                  aria-selected={view === entry}
                  onClick={() => setView(entry)}
                  className={`min-touch rounded-[10px] px-3 py-1 text-[13px] font-medium capitalize transition-colors ${
                    view === entry ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-subtle'
                  }`}
                >
                  {entry}
                </button>
              ))}
            </div>
          </div>

          <div className="relative mt-5">
            <Search
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search plugins"
              aria-label="Search plugins"
              className="min-touch w-full rounded-control border border-line bg-raised py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
            {categories.map((entry) => {
              const active = category === entry
              return (
                <button
                  key={entry}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(entry)}
                  className={`min-touch shrink-0 rounded-full border px-3 py-1 text-[13px] transition-colors ${
                    active
                      ? 'border-accent bg-accent-soft font-medium text-accent'
                      : 'border-line text-ink-soft hover:bg-subtle'
                  }`}
                >
                  {entry === 'all' ? 'All' : PLUGIN_CATEGORY_LABELS[entry]}
                </button>
              )
            })}
          </div>

          {visible.length === 0 ? (
            <div className="mt-4 rounded-group border border-line bg-raised px-6 py-10 text-center">
              <Puzzle size={28} className="mx-auto text-ink-faint" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-ink">
                {view === 'enabled' ? 'No enabled plugins in this view' : 'No plugins match'}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-soft">
                {view === 'enabled'
                  ? 'Enable a built-in from Discover to give threads and employees local tools.'
                  : 'Try a different search or category.'}
              </p>
            </div>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {visible.map((plugin) => (
                <li key={plugin.id}>
                  <PluginCard plugin={plugin} onOpen={() => onOpen(plugin.id)} />
                </li>
              ))}
            </ul>
          )}

          <p className="mt-6 px-1 text-xs leading-relaxed text-ink-faint">
            Built-in plugins run local code that already ships with Uni — enabling them never
            downloads or installs anything. External entries describe what a real integration
            would need and stay unconnected until one exists.
          </p>
        </div>
      </div>
    </div>
  )
}

function availabilityOf(plugin: PluginManifest, enabled: Record<string, true>) {
  if (plugin.execution === 'integration-required') {
    return { label: 'Integration required', tone: 'neutral' as const }
  }
  return enabled[plugin.id]
    ? { label: 'Enabled locally', tone: 'success' as const }
    : { label: 'Available built-in', tone: 'accent' as const }
}

function PluginCard({ plugin, onOpen }: { plugin: PluginManifest; onOpen: () => void }) {
  const enabled = usePluginsStore((state) => state.enabled)
  const availability = availabilityOf(plugin, enabled)

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-3.5 rounded-group border border-line bg-raised px-4 py-3.5 text-left transition-colors hover:bg-subtle"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft text-accent">
        {CATEGORY_ICON[plugin.category]}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-ink">{plugin.name}</span>
          <span className="rounded-full bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">
            {PLUGIN_CATEGORY_LABELS[plugin.category]}
          </span>
          {plugin.builtin && (
            <span className="rounded-full bg-subtle px-1.5 py-0.5 text-[10px] font-medium text-ink-faint">
              Built-in
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-soft">
          {plugin.description}
        </span>
        <span className="mt-1 block text-[11px] text-ink-faint">
          {plugin.author} · v{plugin.version}
        </span>
      </span>
      <StatusPill label={availability.label} tone={availability.tone} />
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Detail                                                              */
/* ------------------------------------------------------------------ */

function PluginDetail({ plugin, onBack }: { plugin: PluginManifest; onBack: () => void }) {
  const navigate = useNavigate()
  const enabled = usePluginsStore((state) => state.enabled[plugin.id] === true)
  const enablePlugin = usePluginsStore((state) => state.enablePlugin)
  const disablePlugin = usePluginsStore((state) => state.disablePlugin)
  const [confirmDisable, setConfirmDisable] = useState(false)
  const isEnabled = enabled && plugin.execution === 'local-built-in'

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageToolbar>
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Plugins"
          className="min-touch -ml-1 flex items-center gap-1 rounded-control px-1.5 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
        >
          <X size={15} className="rotate-90" aria-hidden="true" />
          Plugins
        </button>
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-ink">
          {plugin.name}
        </h1>
      </PageToolbar>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-column px-3 py-6 sm:px-4">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-accent-soft text-accent">
              {CATEGORY_ICON[plugin.category]}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold tracking-tight text-ink">{plugin.name}</h2>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{plugin.description}</p>
              <p className="mt-1 text-xs text-ink-faint">
                {plugin.author} · v{plugin.version} · {PLUGIN_CATEGORY_LABELS[plugin.category]}
              </p>
            </div>
            <StatusPill
              label={availabilityOf(plugin, enabled ? { [plugin.id]: true } : {}).label}
              tone={availabilityOf(plugin, enabled ? { [plugin.id]: true } : {}).tone}
            />
          </div>

          {plugin.execution === 'local-built-in' ? (
            <section className="mt-5 rounded-group border border-line bg-raised p-4 sm:p-5">
              <h3 className="text-[12px] font-medium text-ink-faint">What it can do</h3>
              <ul className="mt-2 flex flex-col gap-1.5">
                {plugin.capabilities.map((capability) => (
                  <li
                    key={capability}
                    className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-soft"
                  >
                    <Check size={13} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                    {capability === 'documents.create'
                      ? 'Create a persistent Canvas document from a thread'
                      : capability === 'documents.save'
                        ? 'Save thread output to your Library as a versioned artifact'
                        : capability === 'data.analyze'
                          ? 'Run the real local CSV analysis on a file you select'
                          : capability === 'library.search'
                            ? 'Find documents stored in this app'
                            : 'Attach explicitly selected content to the current thread'}
                  </li>
                ))}
              </ul>

              <h3 className="mt-4 text-[12px] font-medium text-ink-faint">Access it requests</h3>
              <ul className="mt-2 flex flex-col gap-1.5">
                {plugin.scopes.map((scope) => (
                  <li
                    key={scope}
                    className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-soft"
                  >
                    <Globe size={13} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden="true" />
                    {scope}
                  </li>
                ))}
              </ul>

              <p className="mt-4 rounded-[12px] bg-subtle px-3.5 py-2.5 text-xs leading-relaxed text-ink">
                <strong className="font-medium text-ink">Access preview:</strong> after enabling,
                {plugin.name} still needs to be allowed per employee and granted per thread
                before any action runs — the dispatcher enforces all three, not just the button.
                Disabling cancels in-flight actions and rejects their late results.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {isEnabled ? (
                  confirmDisable ? (
                    <>
                      <Button variant="danger" onClick={() => {
                        disablePlugin(plugin.id)
                        setConfirmDisable(false)
                      }}>
                        <X size={14} />
                        Confirm disable
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirmDisable(false)}>
                        Keep enabled
                      </Button>
                    </>
                  ) : (
                    <Button variant="secondary" onClick={() => setConfirmDisable(true)}>
                      <X size={14} />
                      Disable
                    </Button>
                  )
                ) : (
                  <Button
                    variant="primary"
                    onClick={() => enablePlugin(plugin.id)}
                  >
                    <Check size={14} />
                    Enable
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => navigate('/agents')}
                >
                  Allow for an employee
                </Button>
              </div>
            </section>
          ) : (
            <section className="mt-5 rounded-group border border-line bg-raised p-4 sm:p-5">
              <h3 className="text-[12px] font-medium text-ink-faint">
                Integration required — not connected
              </h3>
              <p className="mt-2 flex items-start gap-2 text-[13px] leading-relaxed text-ink-soft">
                <Mail size={13} className="mt-0.5 shrink-0 text-ink-faint" aria-hidden="true" />
                {plugin.requirements}
              </p>
              <p className="mt-3 rounded-[12px] bg-subtle px-3.5 py-2.5 text-xs leading-relaxed text-ink-soft">
                Uni does not perform OAuth, store external tokens, or log into any website on
                your behalf. When a real integration ships, it will ask for consent here — this
                entry will never show a connected state before that.
              </p>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
