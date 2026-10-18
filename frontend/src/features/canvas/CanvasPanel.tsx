import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  Clock,
  Copy,
  Download,
  Eye,
  FileText,
  History,
  Save,
  Tag,
  Trash2,
  X,
} from 'lucide-react'
import type { Artifact, ArtifactVersion } from '@/domain/workspaceTypes'
import { effectiveContent, useLibraryStore } from '@/state/libraryStore'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'
import { useAppStore } from '@/state/store'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { Segmented } from '@/components/ui/Segmented'
import { TextField } from '@/components/ui/TextField'
import { Tooltip } from '@/components/ui/Tooltip'
import { Markdown } from '@/features/chat/Markdown'
import { downloadText, slugifyTitle } from '@/features/chat/exportUtils'
import { diffLines, type DiffLine } from './diff'

/**
 * Canvas — the persistent, Library-backed document/code workspace panel.
 *
 * Edits autosave as a working draft (debounced, never a version per
 * keystroke); explicit saves and named snapshots create versions; restore
 * appends a new version. Downloads always match what is on screen. The
 * code surface is plain text: nothing here executes or renders untrusted
 * HTML with script privileges.
 */

const AUTOSAVE_DEBOUNCE_MS = 800

export function CanvasPanel() {
  const artifactId = useWorkspaceUiStore((state) => state.inspectorArtifactId)
  const closeInspector = useWorkspaceUiStore((state) => state.closeInspector)
  const artifact = useLibraryStore((state) =>
    artifactId ? state.artifacts[artifactId] : undefined,
  )
  const setWorkingDraft = useLibraryStore((state) => state.setWorkingDraft)
  const commitDraft = useLibraryStore((state) => state.commitDraft)
  const createSnapshot = useLibraryStore((state) => state.createSnapshot)
  const restoreVersion = useLibraryStore((state) => state.restoreVersion)
  const renameArtifact = useLibraryStore((state) => state.renameArtifact)
  const lastSaveOk = useLibraryStore((state) => state.lastSaveOk)
  const lastSavedAt = useLibraryStore((state) => state.lastSavedAt)
  const showToast = useAppStore((state) => state.showToast)

  const [tab, setTab] = useState<'edit' | 'preview'>('edit')
  const [text, setText] = useState(() => (artifact ? effectiveContent(artifact) : ''))
  const [snapshotOpen, setSnapshotOpen] = useState(false)
  const [snapshotLabel, setSnapshotLabel] = useState('')
  const [diffVersion, setDiffVersion] = useState<ArtifactVersion | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const artifactKey = artifact?.id ?? 'none'
  const [loadedKey, setLoadedKey] = useState(artifactKey)
  if (artifactKey !== loadedKey) {
    // A different document was opened — reset the editing surface. Draft
    // state lives in the store, so nothing is lost by switching.
    setLoadedKey(artifactKey)
    setText(artifact ? effectiveContent(artifact) : '')
    setTab('edit')
  }

  // Release the pending autosave timer when the panel unmounts.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [])

  const isCode = artifact?.kind === 'code'

  function scheduleAutosave(value: string) {
    setText(value)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      if (artifactId) setWorkingDraft(artifactId, value)
    }, AUTOSAVE_DEBOUNCE_MS)
  }

  function flushAutosave() {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = undefined
    }
    if (artifactId) setWorkingDraft(artifactId, text)
  }

  const hasDraft =
    !!artifact && artifact.workingDraft !== null && artifact.workingDraft !== artifact.markdown

  const words = useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text])

  if (!artifactId) {
    return (
      <EmptyPanel message="No document open. Create one from the sidebar or the command palette." />
    )
  }
  if (!artifact) {
    return (
      <EmptyPanel
        message="This document was deleted."
        action={{ label: 'Close panel', onClick: closeInspector }}
      />
    )
  }

  async function copyContent() {
    try {
      await navigator.clipboard.writeText(text)
      showToast('Canvas content copied')
    } catch {
      showToast('Clipboard unavailable in this browser')
    }
  }

  function download() {
    const isCodeKind = artifact!.kind === 'code'
    downloadText(
      `universe-${slugifyTitle(artifact!.title)}.${isCodeKind ? 'txt' : 'md'}`,
      text,
      isCodeKind ? 'text/plain' : 'text/markdown',
    )
    showToast('Downloaded what is on screen — including unsaved edits')
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-panel">
      {/* Header */}
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5">
        <FileText size={15} className="shrink-0 text-ink-faint" aria-hidden="true" />
        <button
          type="button"
          onClick={() => {
            setRenameDraft(artifact!.title)
            setRenameOpen(true)
          }}
          className="min-w-0 flex-1 truncate rounded-control px-1.5 py-1 text-left text-sm font-semibold text-ink transition-colors hover:bg-[var(--c-hover-wash)]"
          aria-label={`Rename ${artifact.title}`}
        >
          {artifact.title}
        </button>
        <Tooltip label={provenanceLabel(artifact)}>
          <span className="hidden shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-faint sm:inline-block">
            {provenanceLabel(artifact)}
          </span>
        </Tooltip>
        <Menu
          align="end"
          width="w-64"
          label="Version history"
          trigger={
            <button
              type="button"
              aria-label="Version history"
              className="inline-flex h-8 w-8 items-center justify-center rounded-control text-ink-soft transition-colors hover:bg-[var(--c-hover-wash)] hover:text-ink"
            >
              <History size={15} />
            </button>
          }
        >
          <MenuItem
            icon={<Tag size={15} />}
            onClick={() => {
              setSnapshotLabel('')
              setSnapshotOpen(true)
            }}
          >
            Save named snapshot…
          </MenuItem>
          <div className="my-1 border-t border-line" />
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
            {artifact.versions.length} {artifact.versions.length === 1 ? 'version' : 'versions'} —
            newest first
          </p>
          {artifact.versions.map((version) => (
            <MenuItem key={version.id} hint={version.kind} onClick={() => setDiffVersion(version)}>
              {version.label}
            </MenuItem>
          ))}
        </Menu>
        <button
          type="button"
          aria-label="Close canvas"
          onClick={() => {
            flushAutosave()
            closeInspector()
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-control text-ink-soft transition-colors hover:bg-[var(--c-hover-wash)] hover:text-ink"
        >
          <X size={16} />
        </button>
      </header>

      {/* Mode tabs */}
      <div className="shrink-0 border-b border-line px-3 py-2">
        <Segmented
          ariaLabel="Canvas mode"
          value={tab}
          onChange={setTab}
          options={
            isCode
              ? [{ value: 'edit' as const, label: 'Code (plain text)' }]
              : [
                  { value: 'edit' as const, label: 'Edit' },
                  { value: 'preview' as const, label: 'Preview' },
                ]
          }
        />
      </div>

      {/* Body — scrolls independently */}
      <div className="min-h-0 flex-1 overflow-hidden p-3">
        {tab === 'edit' ? (
          <>
            <label htmlFor="canvas-editor" className="sr-only">
              {isCode ? 'Code (editing only, never executed)' : 'Document editor'}
            </label>
            <textarea
              id="canvas-editor"
              value={text}
              onChange={(event) => scheduleAutosave(event.target.value)}
              onBlur={flushAutosave}
              spellCheck={!isCode}
              className={`h-full w-full resize-none rounded-group border border-line bg-raised p-3.5 text-sm leading-relaxed text-ink focus:border-accent focus:outline-none ${
                isCode ? 'font-mono text-[13px]' : ''
              }`}
            />
          </>
        ) : (
          <div className="h-full overflow-y-auto rounded-group border border-line bg-raised p-4">
            <Markdown content={text} />
          </div>
        )}
      </div>

      {/* Footer */}
      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-line px-3 py-2.5">
        <SaveState hasDraft={hasDraft} lastSaveOk={lastSaveOk} lastSavedAt={lastSavedAt} />
        <div className="flex-1" />
        <span className="hidden text-[11px] text-ink-faint sm:inline">{words} words</span>
        <Button variant="ghost" size="sm" onClick={() => void copyContent()}>
          <Copy size={13} />
          Copy
        </Button>
        <Button variant="ghost" size="sm" onClick={download}>
          <Download size={13} />
          Download
        </Button>
        <Button
          variant={hasDraft ? 'primary' : 'secondary'}
          size="sm"
          onClick={() => {
            flushAutosave()
            const hadDraft = hasDraft
            commitDraft(artifact.id)
            showToast(hadDraft ? 'Saved — new version created' : 'Nothing new to save')
          }}
        >
          {hasDraft ? <Save size={13} /> : <Check size={13} />}
          {hasDraft ? 'Save version' : 'Saved'}
        </Button>
      </footer>

      {/* Snapshot dialog */}
      <Dialog
        open={snapshotOpen}
        onClose={() => setSnapshotOpen(false)}
        title="Save named snapshot"
        description="Snapshots capture exactly what is on screen, including unsaved edits. They never overwrite earlier versions."
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSnapshotOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!snapshotLabel.trim()}
              onClick={() => {
                flushAutosave()
                createSnapshot(artifact.id, snapshotLabel)
                setSnapshotOpen(false)
                showToast(`Snapshot “${snapshotLabel.trim()}” saved`)
              }}
            >
              Save snapshot
            </Button>
          </>
        }
      >
        <TextField
          label="Snapshot name"
          value={snapshotLabel}
          onChange={(event) => setSnapshotLabel(event.target.value)}
          autoFocus
        />
      </Dialog>

      {/* Rename dialog */}
      <Dialog
        open={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Rename document"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!renameDraft.trim()}
              onClick={() => {
                renameArtifact(artifact.id, renameDraft)
                setRenameOpen(false)
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <TextField
          label="Title"
          value={renameDraft}
          onChange={(event) => setRenameDraft(event.target.value)}
          autoFocus
        />
      </Dialog>

      {/* Version diff / restore dialog */}
      <Dialog
        open={!!diffVersion}
        onClose={() => setDiffVersion(null)}
        title={diffVersion ? `Version — ${diffVersion.label}` : 'Version'}
        description="Compare with what is on screen. Restoring creates a new version; history is never erased."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDiffVersion(null)}>
              Close
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                if (diffVersion) {
                  restoreVersion(artifact.id, diffVersion.id)
                  setText(diffVersion.markdown)
                  setTab('edit')
                  setDiffVersion(null)
                  showToast('Restored as a new version')
                }
              }}
            >
              <Clock size={14} />
              Restore as new version
            </Button>
          </>
        }
      >
        {diffVersion && (
          <DiffView
            from={diffVersion.markdown}
            to={text}
            fromLabel={diffVersion.label}
            toLabel="On screen now"
          />
        )}
      </Dialog>
    </div>
  )
}

function provenanceLabel(artifact: Artifact): string {
  switch (artifact.provenance) {
    case 'demo-simulation':
      return 'Demo output'
    case 'model-output':
      return 'Model reply — saved by you'
    case 'local-computation':
      return 'Computed locally from your file'
    default:
      return 'Written by you'
  }
}

function SaveState({
  hasDraft,
  lastSaveOk,
  lastSavedAt,
}: {
  hasDraft: boolean
  lastSaveOk: boolean | null
  lastSavedAt: number | null
}) {
  if (lastSaveOk === false) {
    return (
      <p role="status" className="text-[11.5px] font-medium text-danger">
        Save failed — storage is full or blocked. Keep editing; download to keep a copy.
      </p>
    )
  }
  if (hasDraft) {
    return (
      <p role="status" className="text-[11.5px] text-ink-faint">
        Editing — autosaves as a draft…
      </p>
    )
  }
  return (
    <p role="status" className="text-[11.5px] text-ink-faint">
      {lastSavedAt
        ? `Saved locally · ${new Date(lastSavedAt).toLocaleTimeString()}`
        : 'Saved locally'}
    </p>
  )
}

function EmptyPanel({
  message,
  action,
}: {
  message: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <Eye size={22} className="text-ink-faint" aria-hidden="true" />
      <p className="max-w-[16rem] text-sm leading-relaxed text-ink-faint">{message}</p>
      {action && (
        <Button variant="secondary" size="sm" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

function DiffView({
  from,
  to,
  fromLabel,
  toLabel,
}: {
  from: string
  to: string
  fromLabel: string
  toLabel: string
}) {
  const lines = useMemo(() => diffLines(from, to), [from, to])
  const tooLarge = from.split('\n').length > 2000 || to.split('\n').length > 2000

  if (tooLarge) {
    return (
      <p className="text-sm leading-relaxed text-ink-soft">
        This version is too large to diff line by line. You can still restore it as a new version.
      </p>
    )
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-ink-faint">
        <span>
          <Trash2 size={11} className="mr-1 inline" aria-hidden="true" />
          removed from {fromLabel}
        </span>
        <span>
          <Check size={11} className="mr-1 inline" aria-hidden="true" />
          present in {toLabel}
        </span>
      </div>
      <div className="max-h-[min(22rem,45vh)] overflow-y-auto rounded-group border border-line bg-raised font-mono text-[12px] leading-relaxed">
        {lines.map((line, index) => (
          <DiffRow key={index} line={line} />
        ))}
        {lines.every((line) => line.type === 'same') && (
          <p className="px-3 py-6 text-center font-sans text-xs text-ink-faint">
            Identical — this version matches what is on screen.
          </p>
        )}
      </div>
    </div>
  )
}

function DiffRow({ line }: { line: DiffLine }) {
  if (line.type === 'same') {
    return <p className="whitespace-pre-wrap px-3 py-[1px] text-ink-faint/70">{line.text || ' '}</p>
  }
  if (line.type === 'removed') {
    return (
      <p className="whitespace-pre-wrap bg-danger-soft px-3 py-[1px] text-danger">{`- ${line.text}`}</p>
    )
  }
  return (
    <p className="whitespace-pre-wrap bg-success-soft px-3 py-[1px] text-success">{`+ ${line.text}`}</p>
  )
}
