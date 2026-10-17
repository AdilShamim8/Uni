import { useId } from 'react'

export interface SwitchProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  className?: string
}

export function Switch({ checked, onChange, label, description, className = '' }: SwitchProps) {
  const id = useId()
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-sm font-medium text-ink">
          {label}
        </label>
        {description && <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`min-touch relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors duration-[var(--motion-fast)] ${
          checked ? 'bg-accent' : 'bg-line-strong'
        }`}
      >
        <span
          className={`absolute top-[2px] h-[22px] w-[22px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.25),0_1px_1px_rgba(0,0,0,0.12)] transition-transform duration-[var(--motion-normal)] [transition-timing-function:var(--ease-spring)] ${
            checked ? 'translate-x-[20px]' : 'translate-x-[2px]'
          }`}
        />
      </button>
    </div>
  )
}
