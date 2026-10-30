import { ExternalLink, HardDrive, KeyRound } from 'lucide-react'
import type { FreeRoute } from './freeModels'

/**
 * Free setup guide — the beginner's key instructions, inline.
 *
 * When the provider form targets one of the curated free routes, this
 * panel appears right where the key gets pasted: numbered steps from
 * "open this page" to "press Connect", a direct link to the provider's
 * own console (never an affiliate link), and the honest limits note.
 * Local routes get their own variant — no key to fetch at all, just a
 * placeholder word for the Connect button.
 */

function signupHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function FreeSetupGuide({ route }: { route: FreeRoute }) {
  const host = signupHost(route.signupUrl)
  return (
    <div className="rounded-xl border border-success/35 bg-success-soft/40 p-3">
      <div className="flex items-start gap-2.5">
        {route.local ? (
          <HardDrive size={15} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
        ) : (
          <KeyRound size={15} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">
            {route.local ? 'No key to get — it runs on your machine' : `Free key from ${host}`}
          </p>
          <ol className="mt-1.5 flex flex-col gap-1.5">
            {route.steps.map((step, index) => (
              <li key={index} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-success-soft text-[10px] font-bold text-success"
                >
                  {index + 1}
                </span>
                <span className="text-xs leading-relaxed text-ink-soft">{step}</span>
              </li>
            ))}
          </ol>
          {!route.local && (
            <a
              href={route.signupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="press mt-2 inline-flex min-touch items-center gap-1 rounded-control text-xs font-medium text-accent transition-colors hover:text-accent-strong"
            >
              Open {host}
              <ExternalLink size={12} aria-hidden="true" />
            </a>
          )}
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">{route.limits}</p>
        </div>
      </div>
    </div>
  )
}
