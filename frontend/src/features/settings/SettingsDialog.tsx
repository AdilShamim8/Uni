import { useEffect, useState } from 'react'
import { Cpu, Database, Info, MessageSquare, Palette } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { Dialog } from '@/components/ui/Dialog'
import { AboutSection } from './AboutSection'
import { AppearanceSection } from './AppearanceSection'
import { ChatSection } from './ChatSection'
import { DataSection } from './DataSection'
import { ProvidersSection } from './ProvidersSection'

const SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: <Palette size={15} /> },
  { id: 'chat', label: 'Chat', icon: <MessageSquare size={15} /> },
  { id: 'data', label: 'Data', icon: <Database size={15} /> },
  { id: 'providers', label: 'Providers & models', icon: <Cpu size={15} /> },
  { id: 'about', label: 'Privacy & about', icon: <Info size={15} /> },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

const SECTION_IDS: readonly string[] = SECTIONS.map((entry) => entry.id)

export function SettingsDialog() {
  const open = useAppStore((state) => state.ui.settingsOpen)
  const requestedSection = useAppStore((state) => state.ui.settingsSection)
  const setUi = useAppStore((state) => state.setUi)
  const [section, setSection] = useState<SectionId>('appearance')

  // When something asks for a specific section (e.g. "Connect API key"),
  // open there once, then clear the request so manual navigation wins.
  useEffect(() => {
    if (open && requestedSection && SECTION_IDS.includes(requestedSection)) {
      setSection(requestedSection as SectionId)
      setUi({ settingsSection: null })
    }
  }, [open, requestedSection, setUi])

  return (
    <Dialog
      open={open}
      onClose={() => setUi({ settingsOpen: false })}
      title="Settings"
      description="Preferences apply immediately and persist locally in this browser."
      size="lg"
    >
      <div className="flex flex-col gap-5 sm:flex-row">
        <nav
          aria-label="Settings sections"
          className="flex gap-1 overflow-x-auto pb-1 sm:w-48 sm:shrink-0 sm:flex-col sm:overflow-visible sm:pb-0"
        >
          {SECTIONS.map((entry) => {
            const active = section === entry.id
            return (
              <button
                key={entry.id}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => setSection(entry.id)}
                className={`flex shrink-0 items-center gap-2 rounded-[10px] px-3 py-2 text-left text-sm transition-colors ${
                  active
                    ? 'bg-accent-soft font-medium text-accent'
                    : 'text-ink-soft hover:bg-subtle hover:text-ink'
                }`}
              >
                {entry.icon}
                {entry.label}
              </button>
            )
          })}
        </nav>

        <div className="min-w-0 flex-1">
          {section === 'appearance' && <AppearanceSection />}
          {section === 'chat' && <ChatSection />}
          {section === 'data' && <DataSection />}
          {section === 'providers' && <ProvidersSection />}
          {section === 'about' && <AboutSection />}
        </div>
      </div>
    </Dialog>
  )
}
