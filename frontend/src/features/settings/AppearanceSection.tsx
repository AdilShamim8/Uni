import { Monitor, Moon, Sun } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { useTheme } from '@/app/ThemeProvider'
import { Segmented } from '@/components/ui/Segmented'
import { Switch } from '@/components/ui/Switch'
import { SettingsGroup, SettingsRow } from '@/components/ui/SettingsGroup'

export function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  const density = useAppStore((state) => state.preferences.density)
  const textSize = useAppStore((state) => state.preferences.textSize)
  const reducedTransparency = useAppStore((state) => state.preferences.reducedTransparency)
  const updatePreferences = useAppStore((state) => state.updatePreferences)

  return (
    <div className="flex flex-col gap-5">
      <SettingsGroup
        title="Display"
        footer="“System” follows your operating system and re-syncs when it changes. Compact tightens list rows, message spacing, and composer padding."
      >
        <SettingsRow label="Theme" layout="block">
          <div className="w-full sm:max-w-[22rem]">
            <Segmented
              className="w-full"
              ariaLabel="Theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: 'light', label: 'Light', icon: <Sun size={14} /> },
                { value: 'dark', label: 'Dark', icon: <Moon size={14} /> },
                { value: 'system', label: 'System', icon: <Monitor size={14} /> },
              ]}
            />
          </div>
        </SettingsRow>
        <SettingsRow label="Density" layout="block">
          <div className="w-full sm:max-w-[22rem]">
            <Segmented
              className="w-full"
              ariaLabel="Density"
              value={density}
              onChange={(value) => updatePreferences({ density: value })}
              options={[
                { value: 'comfortable', label: 'Comfortable' },
                { value: 'compact', label: 'Compact' },
              ]}
            />
          </div>
        </SettingsRow>
        <SettingsRow label="Text size" description="Scales the whole interface." layout="block">
          <div className="w-full sm:max-w-[22rem]">
            <Segmented
              className="w-full"
              ariaLabel="Text size"
              value={textSize}
              onChange={(value) => updatePreferences({ textSize: value })}
              options={[
                { value: 's', label: 'Small' },
                { value: 'm', label: 'Default' },
                { value: 'l', label: 'Large' },
              ]}
            />
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Accessibility">
        <Switch
          checked={reducedTransparency}
          onChange={(value) => updatePreferences({ reducedTransparency: value })}
          label="Reduce transparency"
          description="Swaps translucent, blurred surfaces for solid colors. Also follows your operating system's setting automatically."
          className="px-3.5 py-2.5"
        />
      </SettingsGroup>
    </div>
  )
}
