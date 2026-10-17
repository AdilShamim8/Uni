import { ThemeProvider, useTheme } from '@/app/ThemeProvider'

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const

function ThemeDemo() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  return (
    <div className="w-full max-w-md rounded-2xl border border-line bg-raised p-6 shadow-raised">
      <h1 className="text-xl font-semibold tracking-tight">Universe</h1>
      <p className="mt-2 leading-relaxed text-ink-soft">
        Design tokens are live. Surfaces, text, and the muted violet accent all
        switch through semantic variables — this card included.
      </p>
      <div className="mt-5 flex items-center gap-2" role="radiogroup" aria-label="Theme">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={theme === option.value}
            onClick={() => setTheme(option.value)}
            className={`rounded-[10px] border px-3 py-1.5 text-sm transition-colors ${
              theme === option.value
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-line bg-transparent text-ink-soft hover:bg-subtle'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="mt-4 text-xs text-ink-faint" aria-live="polite">
        Active theme: {theme} (resolved: {resolvedTheme})
      </p>
    </div>
  )
}

export function App() {
  return (
    <ThemeProvider>
      <main className="flex min-h-screen items-center justify-center bg-canvas px-6 text-ink">
        <ThemeDemo />
      </main>
    </ThemeProvider>
  )
}
