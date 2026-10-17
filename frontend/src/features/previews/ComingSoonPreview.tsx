import { CalendarClock, FolderKanban } from 'lucide-react'
import type { PreviewKind } from '@/domain/types'
import { useAppStore } from '@/state/store'
import { Dialog } from '@/components/ui/Dialog'
import { Badge } from '@/components/ui/Tooltip'

interface ComingSoonCopy {
  title: string
  body: string
  points: string[]
}

const COPY: Record<string, ComingSoonCopy> = {
  projects: {
    title: 'Projects preview',
    body: 'Projects will group related conversations, instructions, and exports under one place. This entry opens an explanation instead of a half-built subsystem.',
    points: [
      'Planned: conversation grouping and per-project notes',
      'Planned: shared local instructions for a project',
      'Not in this milestone: any project-management features',
    ],
  },
  work: {
    title: 'Work — a later milestone',
    body: 'Work brings documents, notes, and lightweight task lists into Universe as a local-first surface, reusing this shell and design system.',
    points: [
      'Scheduled for week 3 of the provisional roadmap',
      'Will extend the versioned local persistence schema',
      'Nothing to configure yet — this preview is informational',
    ],
  },
  email: {
    title: 'Email — a later milestone',
    body: 'Email will be a local-fixture UI first (no real mail transport), following the same honest-labeling rules as every other preview.',
    points: [
      'Scheduled for week 4 of the provisional roadmap',
      'Integration readiness review happens before any real transport',
      'Nothing to configure yet — this preview is informational',
    ],
  },
  tasks: {
    title: 'Tasks — explanatory preview',
    body: 'Tasks will live inside conversations and projects: extracted action items with local reminders. This early preview only explains the plan.',
    points: [
      'Planned: extract-and-confirm flows on conversation content',
      'Planned: local due dates and completion states',
      'Deferred: notifications and any background sync',
    ],
  },
  connections: {
    title: 'App connections — explanatory preview',
    body: 'Connecting external apps requires the secure credential story from the integration milestone. Until then, this entry stays explanatory.',
    points: [
      'Planned: a reviewed, scoped permission model per connection',
      'Planned: explicit per-action consent in the UI',
      'Not planned: blanket access or silent background use',
    ],
  },
  coding: {
    title: 'Coding workspace — explanatory preview',
    body: 'The coding workspace will extend Canvas with repositories-aware editing and review flows. Arbitrary code execution is explicitly out of scope for the frontend milestones.',
    points: [
      'Planned: richer code fixtures and diff views',
      'Planned: review-style annotations',
      'Out of scope: executing untrusted code in this prototype',
    ],
  },
}

/** Explanatory preview for capabilities scheduled in later milestones. */
export function ComingSoonPreview({ kind }: { kind: PreviewKind }) {
  const closePreview = useAppStore((state) => state.closePreview)
  const copy = COPY[kind] ?? COPY.projects

  return (
    <Dialog
      open
      onClose={closePreview}
      title={copy.title}
      description="Scheduled for a later milestone — see frontend/docs/roadmap.md for the provisional plan."
      size="md"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="warning">
            <CalendarClock size={11} /> Planned — not built here
          </Badge>
          {kind === 'projects' && (
            <Badge>
              <FolderKanban size={11} /> Small preview
            </Badge>
          )}
        </div>
        <p className="text-sm leading-relaxed text-ink-soft">{copy.body}</p>
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink">
          {copy.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        {kind === 'projects' && (
          <div className="rounded-xl border border-line bg-raised p-3.5">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
              Fixture — what a project entry may look like
            </p>
            <ul className="flex flex-col gap-1.5 text-sm text-ink-soft">
              <li>Garden planning · 3 conversations · local instructions</li>
              <li>Tool library launch · 5 conversations · 1 export</li>
            </ul>
          </div>
        )}
      </div>
    </Dialog>
  )
}
