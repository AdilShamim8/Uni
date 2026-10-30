import { useRef, useState } from 'react'
import { Download, HardDriveDownload, RotateCcw, Trash2, Upload } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { SettingsGroup, SettingsRow } from '@/components/ui/SettingsGroup'
import { downloadText } from '@/features/chat/exportUtils'
import {
  buildWorkspaceBackup,
  parseWorkspaceBackup,
  restoreWorkspaceBackup,
  type BackupCounts,
} from '@/services/storage/workspaceBackup'

/**
 * Data settings (m07, F08): the chat export is labeled with its TRUE
 * scope, and a separate versioned workspace backup/restore covers
 * everything else — with validation, a preview, and a recoverable
 * pre-import snapshot.
 */

interface PendingRestore {
  counts: BackupCounts
  savedAt: number
  restore: () => void
}

export function DataSection() {
  const exportAllData = useAppStore((state) => state.exportAllData)
  const clearHistory = useAppStore((state) => state.clearHistory)
  const resetDemoData = useAppStore((state) => state.resetDemoData)
  const showToast = useAppStore((state) => state.showToast)
  const [confirming, setConfirming] = useState<'clear' | 'reset' | null>(null)
  const [pendingRestore, setPendingRestore] = useState<PendingRestore | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const restoreInputRef = useRef<HTMLInputElement>(null)

  function handleExport() {
    downloadText('uni-chats-and-settings.json', exportAllData(), 'application/json')
    showToast('Chats and settings exported as JSON')
  }

  function handleBackup() {
    const backup = buildWorkspaceBackup()
    downloadText(
      `uni-workspace-backup-${new Date().toISOString().slice(0, 10)}.json`,
      JSON.stringify(backup, null, 2),
      'application/json',
    )
    showToast('Workspace backup downloaded')
  }

  async function handleRestoreFile(file: File | null) {
    if (!file) return
    setRestoreError(null)
    try {
      const raw = await file.text()
      const parsed = parseWorkspaceBackup(raw)
      if (!parsed.ok) {
        setRestoreError(parsed.error)
        return
      }
      const { backup, counts } = parsed
      setPendingRestore({
        counts,
        savedAt: backup.savedAt,
        restore: () => {
          const result = restoreWorkspaceBackup(backup)
          if (!result.ok) {
            setRestoreError(result.error ?? 'The restore failed.')
            return
          }
          showToast('Workspace restored — reloading…')
          window.setTimeout(() => window.location.reload(), 600)
        },
      })
    } catch {
      setRestoreError('That file could not be read — nothing was changed.')
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <SettingsGroup
        title="Chats and settings"
        footer="Downloads this browser’s saved chats, preferences, and provider profiles as JSON. Temporary chats are excluded because they are never saved, and API keys are never included."
      >
        <SettingsRow
          label="Export chats and settings"
          description="Chats, preferences, and provider profiles only."
        >
          <Button variant="secondary" size="sm" onClick={handleExport}>
            <Download size={14} />
            Export
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Workspace backup"
        footer="A versioned backup of the whole workspace: chats and settings, Work tasks and events, employees with their memory notes and routines, Library documents and projects, knowledge-base documents, context selections, and plugin configuration with receipts. Never includes API keys or temporary chats."
      >
        <SettingsRow
          label="Back up workspace"
          description="One JSON file you can keep or move between browsers."
        >
          <Button variant="secondary" size="sm" onClick={handleBackup}>
            <HardDriveDownload size={14} />
            Back up
          </Button>
        </SettingsRow>
        <SettingsRow
          label="Restore workspace"
          description="Validate a backup file, preview it, then replace this workspace."
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => restoreInputRef.current?.click()}
          >
            <Upload size={14} />
            Choose file…
          </Button>
        </SettingsRow>
        <input
          ref={restoreInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          aria-label="Choose a workspace backup file"
          onChange={(event) => {
            void handleRestoreFile(event.target.files?.[0] ?? null)
            event.target.value = ''
          }}
        />
        {restoreError && (
          <p role="alert" className="px-3.5 pb-3 text-xs leading-relaxed text-danger">
            {restoreError}
          </p>
        )}
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
      <ConfirmDialog
        open={!!pendingRestore}
        onClose={() => setPendingRestore(null)}
        title="Restore this workspace backup?"
        body={
          pendingRestore
            ? `Backup from ${new Date(pendingRestore.savedAt).toLocaleString()} contains ${pendingRestore.counts.conversations} conversation${pendingRestore.counts.conversations === 1 ? '' : 's'}, ${pendingRestore.counts.tasks} Work task${pendingRestore.counts.tasks === 1 ? '' : 's'}, ${pendingRestore.counts.agents} employee${pendingRestore.counts.agents === 1 ? '' : 's'} with ${pendingRestore.counts.memoryNotes} memory note${pendingRestore.counts.memoryNotes === 1 ? '' : 's'}, ${pendingRestore.counts.artifacts} Library document${pendingRestore.counts.artifacts === 1 ? '' : 's'}, ${pendingRestore.counts.knowledgeDocuments} knowledge document${pendingRestore.counts.knowledgeDocuments === 1 ? '' : 's'}, and ${pendingRestore.counts.enabledPlugins} enabled plugin${pendingRestore.counts.enabledPlugins === 1 ? '' : 's'}. Restoring REPLACES the current workspace in this browser. A recoverable snapshot of today’s data is kept first. API keys are never imported.`
            : ''
        }
        confirmLabel="Restore and reload"
        destructive
        onConfirm={() => {
          pendingRestore?.restore()
          setPendingRestore(null)
        }}
      />
    </div>
  )
}
