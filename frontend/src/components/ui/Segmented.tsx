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

/** iOS-style segmented control: recessed track, raised selected segment. */
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
      className={`inline-flex max-w-full overflow-x-auto rounded-control bg-subtle p-[3px] ${className}`}
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
            className={`min-touch inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] px-3 py-1 text-sm transition-[background-color,color,box-shadow] duration-[var(--motion-fast)] ${
              selected
                ? 'bg-raised font-medium text-ink shadow-[0_1px_3px_rgba(29,27,32,0.12)]'
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
