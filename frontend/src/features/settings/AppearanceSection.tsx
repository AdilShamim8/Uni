import { Monitor, Moon, Sun } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { useTheme } from '@/app/ThemeProvider'
import { Segmented } from '@/components/ui/Segmented'
import { Switch } from '@/components/ui/Switch'

export function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  const density = useAppStore((state) => state.preferences.density)
  const textSize = useAppStore((state) => state.preferences.textSize)
  const reducedTransparency = useAppStore((state) => state.preferences.reducedTransparency)
  const updatePreferences = useAppStore((state) => state.updatePreferences)

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Theme">
        <h3 className="text-sm font-medium text-ink">Theme</h3>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">
          Applies to every surface, including menus and dialogs. “System” follows
          your operating system and re-syncs when it changes.
        </p>
        <Segmented
          className="mt-2"
          ariaLabel="Theme"
          value={theme}
          onChange={setTheme}
          options={[
            { value: 'light', label: 'Light', icon: <Sun size={14} /> },
            { value: 'dark', label: 'Dark', icon: <Moon size={14} /> },
            { value: 'system', label: 'System', icon: <Monitor size={14} /> },
          ]}
        />
      </section>

      <section aria-label="Density">
        <h3 className="text-sm font-medium text-ink">Density</h3>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">
          Compact tightens list rows, message spacing, and composer padding.
        </p>
        <Segmented
          className="mt-2"
          ariaLabel="Density"
          value={density}
          onChange={(value) => updatePreferences({ density: value })}
          options={[
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' },
          ]}
        />
      </section>

      <section aria-label="Text size">
        <h3 className="text-sm font-medium text-ink">Text size</h3>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">
          Scales the whole interface (15 / 16 / 17&nbsp;px base).
        </p>
        <Segmented
          className="mt-2"
          ariaLabel="Text size"
          value={textSize}
          onChange={(value) => updatePreferences({ textSize: value })}
          options={[
            { value: 's', label: 'Small' },
            { value: 'm', label: 'Default' },
            { value: 'l', label: 'Large' },
          ]}
        />
      </section>

      <section aria-label="Transparency">
        <Switch
          checked={reducedTransparency}
          onChange={(value) => updatePreferences({ reducedTransparency: value })}
          label="Reduce transparency"
          description="Swaps translucent, blurred surfaces for solid colors. Also follows your operating system's reduce-transparency setting automatically."
        />
      </section>
    </div>
  )
}
