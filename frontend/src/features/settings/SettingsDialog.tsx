import { Monitor, Moon, Sun } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { useTheme } from '@/app/ThemeProvider'
import { Dialog } from '@/components/ui/Dialog'
import { Segmented } from '@/components/ui/Segmented'

/**
 * Settings dialog. The full settings surface (appearance, chat preferences,
 * data tools, providers) arrives in a later commit; the theme control is
 * live from the start.
 */
export function SettingsDialog() {
  const open = useAppStore((state) => state.ui.settingsOpen)
  const setUi = useAppStore((state) => state.setUi)
  const { theme, setTheme } = useTheme()

  return (
    <Dialog
      open={open}
      onClose={() => setUi({ settingsOpen: false })}
      title="Settings"
      description="Appearance is live; the complete settings surface arrives in the next commits."
      size="md"
    >
      <section aria-label="Theme">
        <h3 className="text-sm font-medium text-ink">Theme</h3>
        <p className="mt-0.5 text-sm text-ink-soft">
          Applies to every surface, including menus and dialogs.
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
    </Dialog>
  )
}
