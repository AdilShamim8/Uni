import { Loader2 } from 'lucide-react'

export interface SpinnerProps {
  size?: number
  className?: string
  label?: string
}

export function Spinner({ size = 16, className = '', label }: SpinnerProps) {
  return (
    <span role={label ? 'status' : undefined} aria-label={label} className={`inline-flex items-center ${className}`}>
      <Loader2 size={size} className="animate-spin" aria-hidden="true" />
      {label && <span className="ml-2 text-sm text-ink-soft">{label}</span>}
    </span>
  )
}
