import { useNavigate } from 'react-router-dom'
import { Archive, Download, FileWarning, FolderOpen, PenTool } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { useLibraryStore } from '@/state/libraryStore'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'
import { downloadText, slugifyTitle } from '@/features/chat/exportUtils'
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
