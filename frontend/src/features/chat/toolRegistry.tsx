import type { ReactNode } from 'react'
import { Globe, Image as ImageIcon, Mic, PenTool, Telescope } from 'lucide-react'
import type { Capability, ToolId } from '@/domain/types'

export interface ToolDefinition {
  id: ToolId
  label: string
  icon: ReactNode
  capability: Capability
  description: string
}

/**
 * Capability registry driving tool availability. A tool is offered when the
 * selected model advertises its capability — never based on API keys.
 */
export const TOOL_REGISTRY: ToolDefinition[] = [
  {
    id: 'search',
    label: 'Search',
    icon: <Globe size={13} />,
    capability: 'search',
    description: 'Adds simulated web sources and a status line to the reply',
  },
  {
    id: 'research',
    label: 'Research',
    icon: <Telescope size={13} />,
    capability: 'research',
    description: 'Opens the research preview with your brief',
  },
  {
    id: 'images',
    label: 'Images',
    icon: <ImageIcon size={13} />,
    capability: 'images',
    description: 'Opens the images preview (simulated output)',
  },
  {
    id: 'voice',
    label: 'Voice',
    icon: <Mic size={13} />,
    capability: 'voice',
    description: 'Opens the voice-session preview (no microphone access)',
  },
  {
    id: 'canvas',
    label: 'Canvas',
    icon: <PenTool size={13} />,
    capability: 'canvas',
    description: 'Opens an editable document in a side panel',
  },
]
