import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bot, CloudOff, MessageSquare, Pencil, Users } from 'lucide-react'
import { useServerSessionStore } from '@/state/serverSessionStore'
import { useAgentsStore } from '@/state/agentsStore'
import { EditEmployeeDialog } from './EditEmployeeDialog'
import type { ServerEmployee } from '@/services/api/serverEmployees'

/**
 * Phase C1 — the server employee roster on the Agents page. When the
 * session is signed in, the account's server employees (the durable
 * identities Work and Chat use) are listed above the local directory.
 *
 * Writes stay separated by construction: this section only READS the
 * server store (plus its load action); the local directory and its
 * store are untouched. Editing and threads live where they already
 * work — the linked local profile's EmployeeView (T015/T016).
 */
export function ServerEmployeesSection() {
  const status = useServerSessionStore((state) => state.status)
  const serverEmployees = useServerSessionStore((state) => state.serverEmployees)
  const serverEmployeesLoading = useServerSessionStore((state) => state.serverEmployeesLoading)
  const loadServerEmployees = useServerSessionStore((state) => state.loadServerEmployees)
  const updateServerEmployee = useServerSessionStore((state) => state.updateServerEmployee)
  const [editTarget, setEditTarget] = useState<ServerEmployee | null>(null)
  const agents = useAgentsStore((state) => state.agents)

  useEffect(() => {
    if (status === 'signed-in') void loadServerEmployees()
  }, [status, loadServerEmployees])

  if (status !== 'signed-in') return null

  // The local profile linked to each server employee (T016 link).
  const linkedAgentByEmployeeId = new Map(
    Object.values(agents)
      .filter((agent) => agent.serverEmployeeId)
      .map((agent) => [agent.serverEmployeeId as string, agent]),
  )

  const active = serverEmployees.filter((employee) => !employee.archived)

  return (
    <section
      aria-label="Server employees on this account"
      className="mx-auto w-full max-w-column px-4 pb-6 pt-5 sm:px-6"
    >
      <div className="mb-2 flex items-center gap-2">
        <Users size={15} className="text-ink-faint" aria-hidden="true" />
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">
          On this account
        </h2>
        <span className="text-xs text-ink-faint">
          {serverEmployeesLoading ? 'loading…' : `${active.length} on the server`}
        </span>
      </div>

      {!serverEmployeesLoading && active.length === 0 && (
        <p className="rounded-group border border-line bg-panel px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
          No server employees yet. Open a local profile below and use it while signed in —
          its server identity is created automatically and Work assignments run through it.
        </p>
      )}

      {active.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {active.map((employee) => {
            const linkedAgent = linkedAgentByEmployeeId.get(employee.id) ?? null
            return (
              <li
                key={employee.id}
                className="flex items-center gap-3 rounded-group border border-line bg-panel px-3.5 py-2.5"
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"
                >
                  <Bot size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-ink">
                    {employee.name}
                  </span>
                  <span className="block truncate text-[12.5px] text-ink-faint">
                    {employee.description || 'No description'}
                  </span>
                </span>
                <button
                  type="button"
                  aria-label={`Edit employee ${employee.name}`}
                  onClick={() => setEditTarget(employee)}
                  className="press inline-flex min-touch items-center gap-1.5 rounded-control border border-line px-2.5 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-subtle"
                >
                  <Pencil size={13} aria-hidden="true" />
                  Edit
                </button>
                {linkedAgent ? (
                  <Link
                    to={`/agents/${linkedAgent.id}`}
                    className="press inline-flex min-touch items-center gap-1.5 rounded-control border border-line px-2.5 py-1.5 text-[12.5px] font-medium text-ink transition-colors hover:bg-subtle"
                  >
                    <MessageSquare size={13} aria-hidden="true" />
                    Open thread
                  </Link>
                ) : (
                  <span className="flex items-center gap-1 text-[12px] text-ink-faint">
                    <CloudOff size={12} aria-hidden="true" />
                    Not linked to a local profile
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
        Server employees are the durable identities your Uni server uses for Work assignments
        and memory. Their threads and notes live server-side; local profiles below stay in
        this browser.
      </p>
      <EditEmployeeDialog
        key={editTarget?.id ?? 'none'}
        employee={editTarget}
        onClose={() => setEditTarget(null)}
        onSave={async (employeeId, patch) => {
          const ok = await updateServerEmployee(employeeId, patch)
          if (ok) setEditTarget(null)
          return ok
        }}
      />
    </section>
  )
}
