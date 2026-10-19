import { AlertTriangle, Check, Loader2, Puzzle, Slash, XCircle } from 'lucide-react'
import type { PluginEntry } from '../threadModel'

const STATUS_META: Record<
  PluginEntry['status'],
  { label: string; tone: string; icon: React.ReactNode }
> = {
  proposed: { label: 'Proposed — needs your action', tone: 'text-ink-soft', icon: <Puzzle size={13} /> },
  running: { label: 'Running…', tone: 'text-accent', icon: <Loader2 size={13} className="animate-spin" /> },
  success: { label: 'Completed', tone: 'text-success', icon: <Check size={13} /> },
  error: { label: 'Failed', tone: 'text-danger', icon: <XCircle size={13} /> },
  revoked: { label: 'Not run — access was revoked', tone: 'text-ink-faint', icon: <Slash size={13} /> },
  cancelled: { label: 'Cancelled', tone: 'text-ink-faint', icon: <XCircle size={13} /> },
}

/**
 * Compact plugin receipt — a quiet, structured record of a plugin action
 * with its execution provenance. Failures and revocations are never
 * rendered as success; verbose detail stays in the expandable area.
 */
export function PluginReceipt({ entry }: { entry: PluginEntry }) {
  const meta = STATUS_META[entry.status]
  return (
    <div
      className={`rounded-group border px-4 py-3 ${
        entry.status === 'error'
          ? 'border-danger/40 bg-danger-soft/50'
          : entry.status === 'success'
            ? 'border-success/30 bg-success-soft/40'
            : 'border-line bg-raised'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-subtle text-ink-soft">
          <Puzzle size={13} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium text-ink">
            {entry.pluginName} · {entry.actionLabel}
          </span>
          <span className={`mt-0.5 flex items-center gap-1 text-xs ${meta.tone}`}>
            {meta.icon}
            {meta.label}
          </span>
        </span>
      </div>
      {entry.summary && (
        <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{entry.summary}</p>
      )}
      {entry.detail && (
        <p className="mt-1 text-xs leading-relaxed text-ink-faint">{entry.detail}</p>
      )}
      {(entry.status === 'error' || entry.status === 'revoked') && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-faint">
          <AlertTriangle size={12} aria-hidden="true" />
          No action was performed outside this app.
        </p>
      )}
    </div>
  )
}
