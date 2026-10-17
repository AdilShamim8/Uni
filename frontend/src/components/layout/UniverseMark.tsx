export interface UniverseMarkProps {
  size?: number
  className?: string
}

/** Original Universe mark: a planet with a tilted orbit and an accent moon. */
export function UniverseMark({ size = 24, className = '' }: UniverseMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="16" cy="16" r="6.5" fill="currentColor" />
      <ellipse
        cx="16"
        cy="16"
        rx="13.5"
        ry="5"
        stroke="currentColor"
        strokeWidth="1.8"
        transform="rotate(-24 16 16)"
      />
      <circle cx="26.2" cy="9.6" r="2.6" fill="var(--c-accent)" />
    </svg>
  )
}
