import { useEffect, useState } from 'react'
import { Cable, ExternalLink } from 'lucide-react'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerConnector } from '@/services/api/serverConnectors'

/**
 * P08 — the connector catalog section on the Plugins surface. Every
 * entry is HONESTLY not connected: the card shows what the connector
 * would do, the real setup steps it needs, and a docs link — never a
 * fabricated live badge. Connectable integrations land one at a time
 * (GitHub first, T027+); until then this surface is documentation-
 * shaped truth.
 */
export function ConnectorsSection() {
  const status = useServerSessionStore((state) => state.status)
  const [connectors, setConnectors] = useState<ServerConnector[]>([])
  const [loading, setLoading] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  // RF-093 — the GitHub connect flow (T027). Token tested first, then
  // stored only on a verified result; removal flips the status back.
  const [token, setToken] = useState('')
  const [connectBusy, setConnectBusy] = useState(false)
  const [connectNotice, setConnectNotice] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (status !== 'signed-in') return
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const { listServerConnectors } = await import('@/services/api/serverConnectors')
        const items = await listServerConnectors()
        if (!cancelled) setConnectors(items)
      } catch {
        if (!cancelled) setConnectors([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [status])

  async function reloadCatalog(): Promise<void> {
    const { listServerConnectors } = await import('@/services/api/serverConnectors')
    setConnectors(await listServerConnectors())
  }

  if (status !== 'signed-in') return null

  return (
    <section aria-label="Connector catalog" className="mx-auto mt-10 w-full max-w-column px-4 pb-6">
      <div className="mb-2 flex items-center gap-2">
        <Cable size={15} className="text-ink-faint" aria-hidden="true" />
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">
          Connectors
        </h2>
        <span className="text-xs text-ink-faint">
          {loading ? 'loading…' : `${connectors.length} available to connect`}
        </span>
      </div>
      <p className="mb-3 text-[12.5px] leading-relaxed text-ink-soft">
        External services Uni could read and act through with your credentials. Each
        card lists exactly what a real connection needs; GitHub connects with a
        read-only token that is sealed on your server.
      </p>

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" aria-label="Connector catalog list">
        {connectors.map((connector) => {
          const expanded = expandedId === connector.id
          return (
            <li
              key={connector.id}
              className="rounded-group border border-line bg-panel px-3.5 py-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-ink">{connector.name}</p>
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-relaxed text-ink-soft">
                    {connector.description}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    connector.status === 'available'
                      ? 'bg-accent-soft text-accent'
                      : 'bg-subtle text-ink-faint'
                  }`}
                >
                  {connector.status === 'available' ? 'Connected' : 'Not connected'}
                </span>
              </div>

              <div className="mt-2.5 flex items-center gap-3">
                <button
                  type="button"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? null : connector.id)}
                  className="min-touch rounded-control px-2 py-1 text-[12.5px] font-medium text-accent transition-colors hover:bg-accent-soft"
                >
                  {expanded ? 'Hide setup' : 'What it needs'}
                </button>
                <a
                  href={connector.docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-touch items-center gap-1 text-[12.5px] text-ink-faint transition-colors hover:text-ink"
                >
                  <ExternalLink size={12} aria-hidden="true" />
                  Docs
                </a>
              </div>

              {expanded && (
                <div className="mt-2 rounded-control bg-subtle px-3 py-2.5">
                  <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
                    To connect this service
                  </p>
                  <ol className="list-inside list-decimal space-y-1 text-[12.5px] leading-relaxed text-ink-soft">
                    {connector.setup.map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                  {connector.routes.length > 0 && (
                    <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">
                      Then you could ask: “{connector.routes[0]}”
                    </p>
                  )}
                  {connector.id === 'github' && (
                    <div className="mt-3 border-t border-line pt-2.5">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[11.5px] font-medium text-ink-soft">
                          Personal access token (read-only)
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <input
                            type="password"
                            value={token}
                            onChange={(event) => setToken(event.target.value)}
                            aria-label="GitHub access token"
                            placeholder="github_pat_…"
                            className="min-touch min-w-0 flex-1 rounded-control border border-line bg-panel px-2.5 py-1.5 text-[12.5px] text-ink focus:border-accent focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={connectBusy || token.trim().length === 0}
                            onClick={async () => {
                              setConnectBusy(true)
                              setConnectNotice(null)
                              try {
                                const { testServerConnector, storeServerConnectorCredential } =
                                  await import('@/services/api/serverConnectors')
                                const result = await testServerConnector('github', token.trim())
                                if (!result.ok) {
                                  setConnectNotice({ ok: false, text: result.error ?? 'The token was rejected by GitHub.' })
                                  return
                                }
                                await storeServerConnectorCredential('github', token.trim())
                                await reloadCatalog()
                                setToken('')
                                setConnectNotice({
                                  ok: true,
                                  text: `Connected as ${result.login ?? 'your account'} — the token is sealed on your server.`,
                                })
                              } catch (error) {
                                setConnectNotice({
                                  ok: false,
                                  text: error instanceof Error ? error.message : 'The connection failed.',
                                })
                              } finally {
                                setConnectBusy(false)
                              }
                            }}
                            className="press min-touch rounded-control border border-line px-2.5 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-panel disabled:opacity-50"
                          >
                            {connectBusy ? 'Testing…' : 'Test & save'}
                          </button>
                          {connector.status === 'available' && (
                            <button
                              type="button"
                              disabled={connectBusy}
                              onClick={async () => {
                                setConnectBusy(true)
                                setConnectNotice(null)
                                try {
                                  const { deleteServerConnectorCredential } = await import(
                                    '@/services/api/serverConnectors'
                                  )
                                  await deleteServerConnectorCredential('github')
                                  await reloadCatalog()
                                  setConnectNotice({ ok: true, text: 'Credential removed — GitHub is disconnected.' })
                                } catch (error) {
                                  setConnectNotice({
                                    ok: false,
                                    text: error instanceof Error ? error.message : 'Removal failed.',
                                  })
                                } finally {
                                  setConnectBusy(false)
                                }
                              }}
                              className="press min-touch rounded-control px-2.5 py-1.5 text-[12px] font-medium text-ink-faint transition-colors hover:text-danger disabled:opacity-50"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      </label>
                      {connectNotice && (
                        <p
                          role="status"
                          className={`mt-1.5 text-[12px] ${connectNotice.ok ? 'text-accent' : 'text-danger'}`}
                        >
                          {connectNotice.text}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
