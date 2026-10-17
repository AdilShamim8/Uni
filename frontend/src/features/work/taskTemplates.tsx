import { BarChart3, Mail, Telescope } from 'lucide-react'
import type { TaskDeliverable } from '@/domain/workspaceTypes'

/** Work starter templates — shared by the Work home and the brief form. */
export const TASK_TEMPLATES: {
  id: TaskDeliverable
  label: string
  blurb: string
  icon: React.ReactNode
}[] = [
  {
    id: 'research-report',
    label: 'Research brief',
    blurb: 'Compare options with a structured, cited-style report',
    icon: <Telescope size={18} />,
  },
  {
    id: 'data-review',
    label: 'Data review',
    blurb: 'Profile a dataset and summarize findings with caveats',
    icon: <BarChart3 size={18} />,
  },
  {
    id: 'email-draft',
    label: 'Email draft',
    blurb: 'Draft an email for a specific recipient and goal',
    icon: <Mail size={18} />,
  },
]
