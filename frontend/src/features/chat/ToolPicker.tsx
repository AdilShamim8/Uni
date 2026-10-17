import { Shapes } from 'lucide-react'
import type { Capability, ToolId } from '@/domain/types'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { TOOL_REGISTRY } from './toolRegistry'

export interface ToolPickerProps {
  selected: ToolId[]
  onToggle: (tool: ToolId) => void
  capabilities: Capability[]
}

/**
 * Labeled "Tools" trigger consolidating the composer's tool selection.
 * Unselected tools live in the menu; selected tools surface as removable
 * chips in the composer. Availability follows the active model's
 * advertised capabilities.
 */
export function ToolPicker({ selected, onToggle, capabilities }: ToolPickerProps) {
  const availableCount = TOOL_REGISTRY.filter((tool) =>
    capabilities.includes(tool.capability),
  ).length

  return (
    <Menu
      label="Composer tools"
      align="start"
      direction="up"
      width="w-72"
      trigger={
        <button
          type="button"
          className={`min-touch inline-flex items-center gap-1.5 rounded-full px-2.5 text-[13px] font-medium transition-colors ${
            selected.length > 0
              ? 'bg-accent-soft text-accent'
              : 'text-ink-soft hover:bg-subtle hover:text-ink'
          }`}
        >
          <Shapes size={15} aria-hidden="true" />
          Tools
          {selected.length > 0 && (
            <span
              aria-hidden="true"
              className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-contrast"
            >
              {selected.length}
            </span>
          )}
        </button>
      }
    >
      {availableCount === 0 && (
        <p className="px-2.5 py-2 text-xs leading-relaxed text-ink-faint">
          The selected model does not advertise tool capabilities.
        </p>
      )}
      {TOOL_REGISTRY.map((tool) => {
        const available = capabilities.includes(tool.capability)
        const isSelected = selected.includes(tool.id)
        return (
          <MenuItem
            key={tool.id}
            icon={tool.icon}
            description={tool.description}
            selection="checkbox"
            selected={isSelected}
            disabled={!available}
            onClick={() => onToggle(tool.id)}
          >
            {tool.label}
          </MenuItem>
        )
      })}
    </Menu>
  )
}
