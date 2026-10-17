import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bot, Plus } from 'lucide-react'
import { useAgentsStore } from '@/state/agentsStore'
import { Button } from '@/components/ui/Button'

/**
 * Agents — reusable instruction profiles. The seeded Universe Assistant is
 * the personal assistant; specialists are clearly-labeled local profiles.
 */
export function AgentsPage() {
  const navigate = useNavigate()
  const agents = useAgentsStore((state) => state.agents)

  const ordered = useMemo(
    () =>
      Object.values(agents)
        .filter((agent) => !agent.archived)
        .sort((a, b) => a.createdAt - b.createdAt),
    [agents],
  )
  const personal = ordered.filter((agent) => agent.category === 'personal')
  const specialists = ordered.filter((agent) => agent.category === 'specialist')

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="material safe-left safe-right sticky top-0 z-30 flex h-13 shrink-0 items-center gap-2 border-b border-line bg-mat-header px-2 sm:px-4">
        <h1 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <Bot size={16} className="text-ink-faint" />
          Agents
        </h1>
        <span className="text-xs text-ink-faint">Reusable local profiles</span>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-column px-3 py-6 sm:px-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-ink">Agents</h2>
              <p className="mt-0.5 text-sm text-ink-soft">
                Persistent instructions you can chat with or assign work to.
              </p>
            </div>
            <Button variant="primary" onClick={() => navigate('/agents/new')}>
              <Plus size={16} />
              New agent
            </Button>
          </div>

          {personal.length > 0 && (
            <section className="mt-6">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Personal assistant
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {personal.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </ul>
            </section>
          )}

          <section className="mt-6">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Specialists
            </p>
            {specialists.length === 0 ? (
              <p className="mt-2 rounded-group border border-line bg-raised px-4 py-6 text-center text-sm text-ink-soft">
                No specialist profiles yet.
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {specialists.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function AgentCard({ agent }: { agent: ReturnType<typeof useAgentsStore.getState>['agents'][string] }) {
  const navigate = useNavigate()
  return (
    <li>
      <button
        type="button"
        onClick={() => navigate(`/agents/${agent.id}`)}
        className="w-full rounded-group border border-line bg-raised px-4 py-3 text-left transition-colors hover:bg-subtle"
      >
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Bot size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium text-ink">{agent.name}</span>
            <span className="block truncate text-xs text-ink-faint">{agent.description}</span>
          </span>
        </span>
      </button>
    </li>
  )
}
