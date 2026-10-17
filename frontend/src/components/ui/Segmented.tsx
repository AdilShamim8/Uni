import type { ReactNode } from 'react'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
}

export interface SegmentedProps<T extends string> {
  value: T
  options: ReadonlyArray<SegmentedOption<T>>
  onChange: (value: T) => void
  ariaLabel: string
  className?: string
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className = '',
}: SegmentedProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex rounded-[10px] border border-line bg-raised p-0.5 ${className}`}
    >
      {options.map((option) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              selected
                ? 'bg-accent-soft font-medium text-accent'
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
