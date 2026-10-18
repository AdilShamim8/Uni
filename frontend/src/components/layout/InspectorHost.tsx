import { FolderKanban, PenTool } from 'lucide-react'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'
import { CanvasPanel } from '@/features/canvas/CanvasPanel'
import { Tooltip } from '@/components/ui/Tooltip'

/**
 * InspectorHost — the right-hand workspace panel. One clear active tab:
 * Canvas (persistent documents) or Context (what a chat/task will see).
 * The panel is one surface, so the selected artifact or context stays
 * understandable across destinations.
 */
export function InspectorHost() {
  const tab = useWorkspaceUiStore((state) => state.inspectorTab)
  const setInspectorTab = useWorkspaceUiStore((state) => state.setInspectorTab)

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Tab switcher */}
      <div
        role="tablist"
        aria-label="Inspector"
        className="flex shrink-0 items-center gap-1 border-b border-line bg-subtle/60 px-2 py-1.5"
      >
        <InspectorTabButton
          active={tab === 'canvas'}
          label="Canvas"
          icon={<PenTool size={13} />}
          onClick={() => setInspectorTab('canvas')}
        />
        <InspectorTabButton
          active={tab === 'context'}
          label="Context"
          icon={<FolderKanban size={13} />}
          onClick={() => setInspectorTab('context')}
        />
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'canvas' ? <CanvasPanel /> : <ContextPlaceholder />}
      </div>
    </div>
  )
}

function InspectorTabButton({
  active,
  label,
  icon,
  onClick,
}: {
  active: boolean
  label: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex min-touch items-center gap-1.5 rounded-control px-2.5 py-1 text-[12.5px] font-medium transition-colors duration-[var(--motion-fast)] ${
        active
          ? 'bg-raised text-ink shadow-soft'
          : 'text-ink-faint hover:bg-[var(--c-hover-wash)] hover:text-ink-soft'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

/** Context inspector lands with feature C; honest placeholder until then. */
function ContextPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <Tooltip label="Ships in this milestone — project context control">
        <FolderKanban size={22} className="text-ink-faint" aria-hidden="true" />
      </Tooltip>
      <p className="max-w-[16rem] text-sm leading-relaxed text-ink-faint">
        Context control — choosing exactly which projects and documents a chat or task can see —
        arrives with project context in this milestone.
      </p>
    </div>
  )
}
