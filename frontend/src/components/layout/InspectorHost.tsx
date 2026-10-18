import { FolderKanban, PenTool } from 'lucide-react'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'
import { CanvasPanel } from '@/features/canvas/CanvasPanel'
import { ContextInspector } from '@/features/context/ContextInspector'

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
        {tab === 'canvas' ? <CanvasPanel /> : <ContextInspector />}
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

