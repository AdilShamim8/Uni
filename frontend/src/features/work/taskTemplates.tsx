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

/**
 * Deterministic deliverable inference for goals typed into the Work
 * composer — visible in the brief and changeable at any time from the
 * expanded brief, so a wrong guess is never a trap.
 */
export function inferDeliverable(goal: string): TaskDeliverable {
  const text = goal.toLowerCase()
  if (/\b(email|e-mail|reply to|message to|note to|follow up with|follow-up with)\b/.test(text)) {
    return 'email-draft'
  }
  if (
    /\b(csv|dataset|data set|spreadsheet|numbers|metrics|columns?|rows?|analysis|analyze|analyse|statistics|stats)\b/.test(
      text,
    )
  ) {
    return 'data-review'
  }
  return 'research-report'
}
