import { useNavigate } from 'react-router-dom'
import { Archive, Copy, Download, FileWarning, FolderOpen, PenTool, Save } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { useLibraryStore } from '@/state/libraryStore'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'
import { useWorkStore } from '@/state/workStore'
import { downloadText, slugifyTitle } from '@/features/chat/exportUtils'
import { saveTaskReportToLibrary } from '@/services/work/canonicalSave'
import type { OutputCardEntry } from '../threadModel'

/**
 * Output card: links the artifact this output was saved to (opens the real
 * Canvas/Library record — never a copy), offers a download of the linked
 * content, and labels provenance honestly. Archived cards carry prior
 * revisions preserved by a newer run.
 */
export function OutputCard({ entry }: { entry: OutputCardEntry }) {
  const navigate = useNavigate()
  const showToast = useAppStore((state) => state.showToast)
  const artifact = useLibraryStore((state) =>
    entry.artifactId ? state.artifacts[entry.artifactId] : undefined,
  )
  const openInspector = useWorkspaceUiStore((state) => state.openInspector)

  function handleOpen() {
    if (artifact) {
      openInspector({ tab: 'canvas', artifactId: artifact.id })
      return
    }
    navigate('/library')
  }

  function handleDownload() {
    if (!artifact) return
    downloadText(`uni-artifact-${slugifyTitle(artifact.title)}.md`, artifact.markdown)
    showToast('Downloaded the saved library copy')
  }

  // m07: routine actions live next to the output — no detour through
  // Details. Save/Update goes through the SAME canonical operation as
  // the Outputs panel and the Documents plugin.
  function handleSave() {
    try {
      const result = saveTaskReportToLibrary(entry.taskId)
      showToast(
        result.created ? 'Saved to Library' : 'Library copy updated',
        {
          actionLabel: 'Open',
          onAction: () => navigate('/library'),
        },
      )
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'The save could not be completed.')
    }
  }

  async function handleCopy() {
    const markdown =
      artifact?.markdown ??
      useWorkStore.getState().tasks[entry.taskId]?.report?.markdown ??
      ''
    if (!markdown) return
    try {
      await navigator.clipboard.writeText(markdown)
      showToast('Output copied to the clipboard')
    } catch {
      showToast('The clipboard was blocked by the browser — copy is unavailable.')
    }
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-2.5 rounded-group border px-4 py-3 ${
        entry.archived
          ? 'border-line/70 bg-subtle/50'
          : 'border-line bg-raised'
      }`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-subtle text-ink-soft">
        {entry.archived ? <Archive size={14} /> : <FolderOpen size={14} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-ink">
          {artifact?.title ?? entry.title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-ink-faint">
          {entry.provenance === 'provider-generated'
            ? `Provider-generated${entry.generatedByLabel ? ` · ${entry.generatedByLabel}` : ''}`
            : 'Simulated example output'}
          {entry.stoppedPartial && ' · partial — generation was stopped'}
          {entry.archived && ' · kept from a previous revision'}
        </span>
      </span>
      {!entry.archived && (
        <button
          type="button"
          onClick={handleSave}
          className="min-touch inline-flex items-center gap-1.5 rounded-control border border-line bg-panel px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-subtle"
        >
          <Save size={13} />
          {artifact ? 'Update library copy' : 'Save to Library'}
        </button>
      )}
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label="Copy the output"
        className="min-touch rounded-control p-1.5 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
      >
        <Copy size={14} />
      </button>
      {artifact ? (
        <>
          <button
            type="button"
            onClick={handleOpen}
            className="min-touch inline-flex items-center gap-1.5 rounded-control border border-line bg-panel px-3 py-1.5 text-[13px] font-medium text-ink transition-colors hover:bg-subtle"
          >
            <PenTool size={13} />
            Open in Canvas
          </button>
          <button
            type="button"
            onClick={handleDownload}
            aria-label="Download the saved artifact"
            className="min-touch rounded-control p-1.5 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
          >
            <Download size={14} />
          </button>
        </>
      ) : (
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-faint">
          <FileWarning size={13} aria-hidden="true" />
          Not saved to Library yet
        </span>
      )}
    </div>
  )
}
