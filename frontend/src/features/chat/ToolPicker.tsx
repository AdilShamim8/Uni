import type { Capability, ToolId } from '@/domain/types'
import { Chip } from '@/components/ui/Chip'
import { Tooltip } from '@/components/ui/Tooltip'
import { TOOL_REGISTRY } from './toolRegistry'

export interface ToolPickerProps {
  selected: ToolId[]
  onToggle: (tool: ToolId) => void
  capabilities: Capability[]
}

export function ToolPicker({ selected, onToggle, capabilities }: ToolPickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Composer tools">
      {TOOL_REGISTRY.map((tool) => {
        const available = capabilities.includes(tool.capability)
        const isSelected = selected.includes(tool.id)
        return (
          <Tooltip
            key={tool.id}
            label={
              available
                ? tool.description
                : `The selected demo model does not advertise the “${tool.capability}” capability`
            }
          >
            <Chip
              icon={tool.icon}
              selected={isSelected}
              disabled={!available}
              onClick={() => onToggle(tool.id)}
            >
              {tool.label}
            </Chip>
          </Tooltip>
        )
      })}
    </div>
  )
}
