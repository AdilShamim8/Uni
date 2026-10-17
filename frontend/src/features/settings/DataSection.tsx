import { useState } from 'react'
import { Download, RotateCcw, Trash2 } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SettingsGroup, SettingsRow } from '@/components/ui/SettingsGroup'
import { downloadText } from '@/features/chat/exportUtils'

export function DataSection() {
  const exportAllData = useAppStore((state) => state.exportAllData)
  const clearHistory = useAppStore((state) => state.clearHistory)
  const resetDemoData = useAppStore((state) => state.resetDemoData)
  const showToast = useAppStore((state) => state.showToast)
  const [confirming, setConfirming] = useState<'clear' | 'reset' | null>(null)

  function handleExport() {
    downloadText('universe-export.json', exportAllData(), 'application/json')
    showToast('Local data exported as JSON')
  }

  return (
    <div className="flex flex-col gap-5">
      <SettingsGroup
        title="Export"
        footer="Downloads a JSON snapshot of everything stored in this browser — conversations, preferences, and provider profiles. Temporary chats are excluded because they are never saved. API keys are never included."
      >
        <SettingsRow
          label="Export chats and settings"
          description="One JSON file, generated locally."
        >
          <Button variant="secondary" size="sm" onClick={handleExport}>
            <Download size={14} />
            Export
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="History"
        footer="Removing conversations cannot be undone. Preferences and provider profiles are kept."
      >
        <SettingsRow
          label="Clear local history"
          description="Removes every saved conversation from this browser."
        >
          <Button variant="secondary" size="sm" onClick={() => setConfirming('clear')}>
            <Trash2 size={14} />
            Clear
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Demo"
        footer="Restores the original demo conversations and provider profiles. Your preferences are kept."
      >
        <SettingsRow
          label="Reset demo data"
          description="Bring the bundled sample content back."
        >
          <Button variant="secondary" size="sm" onClick={() => setConfirming('reset')}>
            <RotateCcw size={14} />
            Reset
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <ConfirmDialog
        open={confirming === 'clear'}
        onClose={() => setConfirming(null)}
        title="Clear all conversations?"
        body="Every saved conversation will be removed from this browser. Preferences and provider profiles stay."
        confirmLabel="Clear history"
        destructive
        onConfirm={() => {
          clearHistory()
          showToast('Local history cleared')
        }}
      />
      <ConfirmDialog
        open={confirming === 'reset'}
        onClose={() => setConfirming(null)}
        title="Reset demo data?"
        body="Demo conversations and provider profiles return to their original state. Your preferences stay."
        confirmLabel="Reset"
        destructive
        onConfirm={() => {
          resetDemoData()
          showToast('Demo data restored')
        }}
      />
    </div>
  )
}
