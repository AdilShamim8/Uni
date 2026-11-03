import { Check, HelpCircle, X } from 'lucide-react'
import type { ProviderReadiness } from '@/services/connection/providerConnection'

/**
 * The four separate readiness states of a provider connection check
 * (N007), rendered as one compact strip. Every axis is labeled with
 * what the check actually PROVED — ok, fail, or honestly unknown —
 * instead of one blended "connected/error" state. Shared by the BYOK
 * provider cards and the server provider rows.
 */

export interface ReadinessStripProps {
  readiness: ProviderReadiness
  /** Model count for the catalog axis label, when a catalog was parsed. */
  modelCount?: number
}

type AxisTone = 'ok' | 'fail' | 'unknown'

function axisTone(state: 'unknown' | 'ok' | 'fail' | 'not-required'): AxisTone {
  if (state === 'ok' || state === 'not-required') return 'ok'
  if (state === 'fail') return 'fail'
  return 'unknown'
}

function AxisMark({ tone }: { tone: AxisTone }) {
  if (tone === 'ok') return <Check size={11} className="mt-px shrink-0 text-success" aria-hidden="true" />
  if (tone === 'fail') return <X size={11} className="mt-px shrink-0 text-danger" aria-hidden="true" />
  return <HelpCircle size={11} className="mt-px shrink-0 text-ink-faint" aria-hidden="true" />
}

const TONE_TEXT: Record<AxisTone, string> = {
  ok: 'text-ink-soft',
  fail: 'text-danger',
  unknown: 'text-ink-faint',
}

export function ReadinessStrip({ readiness, modelCount }: ReadinessStripProps) {
  const catalogLabel =
    readiness.catalog === 'ok'
      ? modelCount !== undefined
        ? `Model list (${modelCount})`
        : 'Model list'
      : readiness.catalog === 'fail'
        ? 'No model list'
        : 'Model list untested'

  const credentialLabel =
    readiness.credential === 'ok'
      ? 'Key verified'
      : readiness.credential === 'not-required'
        ? 'No key needed'
        : readiness.credential === 'fail'
          ? 'Key rejected'
          : 'Key unverified'

  const generationLabel =
    readiness.generation === 'ok'
      ? 'Test generation ok'
      : readiness.generation === 'fail'
        ? 'Generation failed'
        : 'Generation untested'

  const reachabilityLabel =
    readiness.reachability === 'ok'
      ? 'Endpoint reachable'
      : readiness.reachability === 'fail'
        ? 'Endpoint unreachable'
        : 'Reachability untested'

  const axes: Array<{ key: string; label: string; tone: AxisTone }> = [
    { key: 'reachability', label: reachabilityLabel, tone: axisTone(readiness.reachability) },
    { key: 'catalog', label: catalogLabel, tone: axisTone(readiness.catalog) },
    { key: 'credential', label: credentialLabel, tone: axisTone(readiness.credential) },
    { key: 'generation', label: generationLabel, tone: axisTone(readiness.generation) },
  ]

  return (
    <ul
      aria-label="Connection readiness"
      className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1"
    >
      {axes.map((axis) => (
        <li key={axis.key} className={`flex items-start gap-1 text-[11px] leading-4 ${TONE_TEXT[axis.tone]}`}>
          <AxisMark tone={axis.tone} />
          <span>{axis.label}</span>
        </li>
      ))}
    </ul>
  )
}
