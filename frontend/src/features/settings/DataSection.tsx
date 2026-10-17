import { useState } from 'react'
import { Download, RotateCcw, Trash2 } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
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
    <div className="flex flex-col gap-6">
      <section aria-label="Export">
        <h3 className="text-sm font-medium text-ink">Export chats and settings</h3>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">
          Downloads a JSON snapshot of everything stored in this browser —
          conversations, preferences, and provider profiles. Temporary chats are
          excluded because they are never saved.
        </p>
        <Button className="mt-3" variant="secondary" onClick={handleExport}>
          <Download size={14} />
          Export local data (JSON)
        </Button>
      </section>

      <section aria-label="Clear history">
        <h3 className="text-sm font-medium text-ink">Clear local history</h3>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">
          Removes every saved conversation from this browser. Preferences and
          provider profiles are kept. This cannot be undone.
        </p>
        <Button className="mt-3" variant="secondary" onClick={() => setConfirming('clear')}>
          <Trash2 size={14} />
          Clear all conversations
        </Button>
      </section>

      <section aria-label="Reset demo data">
        <h3 className="text-sm font-medium text-ink">Reset demo data</h3>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">
          Restores the original demo conversations and provider profiles. Your
          preferences are kept.
        </p>
        <Button className="mt-3" variant="secondary" onClick={() => setConfirming('reset')}>
          <RotateCcw size={14} />
          Reset demo data
        </Button>
      </section>

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
