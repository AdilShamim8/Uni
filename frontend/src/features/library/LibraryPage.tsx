import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  BarChart3,
  ChevronLeft,
  FileCode2,
  FileText,
  FolderPlus,
  FolderKanban,
  Library as LibraryIcon,
  Mail,
  MoreHorizontal,
  NotebookPen,
  PencilLine,
  Plus,
  Trash2,
  Download,
} from 'lucide-react'
import { useLibraryStore } from '@/state/libraryStore'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'
import { useAgentsStore } from '@/state/agentsStore'
import { useAppStore } from '@/state/store'
import { useContextStore } from '@/state/contextStore'
import { useWorkStore } from '@/state/workStore'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { HeaderExtras } from '@/components/layout/HeaderExtras'
import { PageToolbar } from '@/components/layout/PageToolbar'
import { MobileMenuButton } from '@/components/layout/MobileMenuButton'
import { downloadText, slugifyTitle } from '@/features/chat/exportUtils'
import type { Artifact, ArtifactKind } from '@/domain/workspaceTypes'

/**
 * Library — the one shared local artifact collection. Outputs saved from
 * Work live beside your own notes; provenance is always labeled honestly.
 * Everything here is local: open, rename, edit, download, delete.
 */

const KIND_META: Record<ArtifactKind, { label: string; icon: React.ReactNode }> = {
  report: { label: 'Report', icon: <FileText size={15} /> },
  email: { label: 'Email draft', icon: <Mail size={15} /> },
  data: { label: 'Data review', icon: <BarChart3 size={15} /> },
  notes: { label: 'Notes', icon: <NotebookPen size={15} /> },
  document: { label: 'Document', icon: <FileText size={15} /> },
  code: { label: 'Code', icon: <FileCode2 size={15} /> },
}

const FILTERS: { id: 'all' | ArtifactKind; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'report', label: 'Reports' },
  { id: 'email', label: 'Emails' },
  { id: 'data', label: 'Data' },
  { id: 'notes', label: 'Notes' },
]

export function LibraryPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const projectId = searchParams.get('project')
  const artifacts = useLibraryStore((state) => state.artifacts)
  const projects = useLibraryStore((state) => state.projects)
  const tasks = useWorkStore((state) => state.tasks)
  const [filter, setFilter] = useState<'all' | ArtifactKind>('all')
  const [renameId, setRenameId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [newProjectOpen, setNewProjectOpen] = useState(false)

  const ordered = useMemo(
    () => Object.values(artifacts).sort((a, b) => b.updatedAt - a.updatedAt),
    [artifacts],
  )
  const filtered = useMemo(
    () => (filter === 'all' ? ordered : ordered.filter((a) => a.kind === filter)),
    [ordered, filter],
  )
  const openInCanvas = (id: string) => {
    useWorkspaceUiStore.getState().openInspector({ tab: 'canvas', artifactId: id })
  }

  if (projectId) {
    return (
      <ProjectDetail
        projectId={projectId}
        onBack={() => setSearchParams({}, { replace: true })}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageToolbar>
        <div className="lg:hidden">
          <MobileMenuButton />
        </div>
        <h1 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-ink">
          <LibraryIcon size={16} className="text-ink-faint" />
          Library
        </h1>
        <span className="hidden text-xs text-ink-faint sm:inline">Local only</span>
        <div className="flex-1" />
        <HeaderExtras />
      </PageToolbar>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-column px-3 py-6 sm:px-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight text-ink">Artifacts</h2>
              <p className="mt-0.5 text-sm text-ink-soft">
                Outputs from Work and notes you save — one shared collection, local to
                this device.
              </p>
            </div>
            <Button
              variant="primary"
              onClick={() => {
                const id = useLibraryStore.getState().addArtifact({
                  title: 'Untitled note',
                  kind: 'notes',
                  markdown: '# Untitled note\n\nStart writing…',
                })
                openInCanvas(id)
              }}
            >
              <Plus size={16} />
              New note
            </Button>
          </div>

          {/* Kind filters */}
          <div className="mt-5 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Filter artifacts">
            {FILTERS.map((entry) => {
              const active = filter === entry.id
              return (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(entry.id)}
                  className={`min-touch shrink-0 rounded-full border px-3 py-1 text-[13px] transition-colors ${
                    active
                      ? 'border-accent bg-accent-soft font-medium text-accent'
                      : 'border-line text-ink-soft hover:bg-subtle'
                  }`}
                >
                  {entry.label}
                </button>
              )
            })}
          </div>

          {filtered.length === 0 ? (
            <div className="mt-4 rounded-group border border-line bg-raised px-6 py-10 text-center">
              <LibraryIcon size={28} className="mx-auto text-ink-faint" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-ink">
                {ordered.length === 0 ? 'Nothing saved yet' : 'No artifacts of this kind'}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-soft">
                {ordered.length === 0
                  ? 'Finish reviewing a Work task and save its output here, or start a new note.'
                  : 'Try a different filter.'}
              </p>
            </div>
          ) : (
            <ul className="mt-4 flex flex-col gap-2">
              {filtered.map((artifact) => {
                const task = artifact.taskId ? tasks[artifact.taskId] : null
                return (
                  <li key={artifact.id}>
                    <div className="flex items-stretch rounded-group border border-line bg-raised transition-colors hover:bg-subtle">
                      <button
                        type="button"
                        onClick={() => openInCanvas(artifact.id)}
                        className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-faint">
                          {KIND_META[artifact.kind].icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">
                            {artifact.title}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-ink-faint">
                            {KIND_META[artifact.kind].label} ·{' '}
                            {artifact.provenance === 'demo-simulation'
                              ? 'simulated output'
                              : 'written by you'}
                            {task ? ` · from task “${task.title}”` : ''}
                          </span>
                        </span>
                      </button>
                      <ArtifactMenu
                        artifact={artifact}
                        onOpen={() => openInCanvas(artifact.id)}
                        onRename={() => setRenameId(artifact.id)}
                        onDelete={() => setDeleteId(artifact.id)}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {/* Projects */}
          <section className="mt-10" aria-label="Projects">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
                  Projects
                </h3>
                <p className="mt-0.5 text-xs text-ink-soft">
                  Lightweight local context groups — folders, not collaboration.
                </p>
              </div>
              <Button variant="secondary" onClick={() => setNewProjectOpen(true)}>
                <FolderPlus size={15} />
                New project
              </Button>
            </div>

            {Object.keys(projects).length === 0 ? (
              <p className="mt-3 rounded-group border border-line bg-raised px-4 py-5 text-center text-sm text-ink-soft">
                No projects yet. Group related tasks and artifacts with one.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {Object.values(projects)
                  .sort((a, b) => b.createdAt - a.createdAt)
                  .map((project) => {
                    const taskCount = Object.values(tasks).filter(
                      (task) => task.projectId === project.id,
                    ).length
                    const artifactCount = Object.values(artifacts).filter(
                      (artifact) => artifact.projectId === project.id,
                    ).length
                    return (
                      <li
                        key={project.id}
                        className="flex items-center gap-3 rounded-group border border-line bg-raised px-4 py-3 transition-colors hover:bg-subtle"
                      >
                        <button
                          type="button"
                          onClick={() => setSearchParams({ project: project.id })}
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          aria-label={`Open project ${project.name}`}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-faint">
                            <FolderKanban size={16} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">
                              {project.name}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-ink-faint">
                              {project.description || 'No description'}
                              {` · ${taskCount} task${taskCount === 1 ? '' : 's'}, ${artifactCount} artifact${artifactCount === 1 ? '' : 's'}`}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete project ${project.name}`}
                          onClick={() => useLibraryStore.getState().deleteProject(project.id)}
                          className="min-touch rounded-control p-1.5 text-ink-faint transition-colors hover:text-danger"
                        >
                          <Trash2 size={15} />
                        </button>
                      </li>
                    )
                  })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* Rename */}
      <RenameDialog
        artifact={renameId ? artifacts[renameId] : undefined}
        onClose={() => setRenameId(null)}
      />

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Delete artifact?"
        body="This artifact will be removed from this device. The task it came from keeps its own report."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteId) useLibraryStore.getState().deleteArtifact(deleteId)
          setDeleteId(null)
        }}
      />

      {/* New project */}
      <NewProjectDialog open={newProjectOpen} onClose={() => setNewProjectOpen(false)} />
    </div>
  )
}

function ArtifactMenu({
  artifact,
  onOpen,
  onRename,
  onDelete,
}: {
  artifact: Artifact
  onOpen: () => void
  onRename: () => void
  onDelete: () => void
}) {
  const showToast = useAppStore((state) => state.showToast)
  return (
    <div className="flex items-center pr-1.5">
      <Menu
        label="Artifact actions"
        trigger={
          <button
            type="button"
            aria-label={`Actions for ${artifact.title}`}
            className="min-touch rounded-control p-1.5 text-ink-faint transition-colors hover:bg-[var(--c-hover-wash)] hover:text-ink"
          >
            <MoreHorizontal size={16} />
          </button>
        }
      >
        <MenuItem icon={<FileText size={15} />} onClick={onOpen}>
          Open
        </MenuItem>
        <MenuItem icon={<PencilLine size={15} />} onClick={onRename}>
          Rename
        </MenuItem>
        <MenuItem
          icon={<Download size={15} />}
          onClick={() => {
            downloadText(`universe-${slugifyTitle(artifact.title)}.md`, artifact.markdown)
            showToast('Artifact downloaded as Markdown')
          }}
        >
          Download
        </MenuItem>
        <MenuItem icon={<Trash2 size={15} />} danger onClick={onDelete}>
          Delete
        </MenuItem>
      </Menu>
    </div>
  )
}


function RenameDialog({ artifact, onClose }: { artifact: Artifact | undefined; onClose: () => void }) {
  const renameArtifact = useLibraryStore((state) => state.renameArtifact)
  const [title, setTitle] = useState('')

  const key = artifact?.id ?? 'none'
  const [lastKey, setLastKey] = useState(key)
  if (key !== lastKey) {
    setLastKey(key)
    setTitle(artifact?.title ?? '')
  }

  return (
    <Dialog
      open={!!artifact}
      onClose={onClose}
      title="Rename artifact"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!title.trim()}
            onClick={() => {
              if (artifact) renameArtifact(artifact.id, title)
              onClose()
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <TextField
        label="Title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        autoFocus
      />
    </Dialog>
  )
}

function NewProjectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const addProject = useLibraryStore((state) => state.addProject)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="New project"
      size="sm"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              setName('')
              setDescription('')
              onClose()
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={() => {
              addProject({ name, description })
              setName('')
              setDescription('')
              onClose()
            }}
          >
            Create project
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <TextField
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Apartment move"
          autoFocus
        />
        <TextField
          label="Description (optional)"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What is this project about?"
        />
      </div>
    </Dialog>
  )
}


/* ------------------------------------------------------------------ */
/* Project detail — one honest view of everything linked to a project   */
/* ------------------------------------------------------------------ */

function ProjectDetail({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const project = useLibraryStore((state) => state.projects[projectId])
  const artifacts = useLibraryStore((state) => state.artifacts)
  const tasks = useWorkStore((state) => state.tasks)
  const agents = useAgentsStore((state) => state.agents)
  const conversations = useAppStore((state) => state.conversations)
  const contextSelections = useContextStore((state) => state.selections)
  const openInCanvas = (id: string) => {
    useWorkspaceUiStore.getState().openInspector({ tab: 'canvas', artifactId: id })
  }

  const projectTasks = useMemo(
    () => Object.values(tasks).filter((task) => task.projectId === projectId),
    [tasks, projectId],
  )
  const projectArtifacts = useMemo(
    () =>
      Object.values(artifacts)
        .filter((artifact) => artifact.projectId === projectId)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [artifacts, projectId],
  )
  const projectAgents = useMemo(
    () => Object.values(agents).filter((agent) => agent.projectIds.includes(projectId)),
    [agents, projectId],
  )
  // Chats link to a project through their explicit context selection.
  const projectChats = useMemo(() => {
    const ids = new Set<string>()
    for (const [targetKey, items] of Object.entries(contextSelections)) {
      if (
        items.some((item) => item.kind === 'project' && item.refId === projectId) &&
        conversations[targetKey]
      ) {
        ids.add(targetKey)
      }
    }
    return Object.values(conversations).filter(
      (conversation) => ids.has(conversation.id) && !conversation.temporary,
    )
  }, [contextSelections, conversations, projectId])

  if (!project) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <FolderKanban size={24} className="text-ink-faint" aria-hidden="true" />
        <p className="max-w-[20rem] text-sm leading-relaxed text-ink-soft">
          This project was deleted or is no longer available. Nothing you see here links to it
          anymore.
        </p>
        <Button variant="secondary" size="sm" onClick={onBack}>
          Back to Library
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageToolbar>
        <div className="lg:hidden">
          <MobileMenuButton />
        </div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft size={15} />
          Library
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-tight text-ink">
          {project.name}
        </h1>
        <HeaderExtras />
      </PageToolbar>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-column px-3 py-6 sm:px-4">
          <div className="rounded-group border border-line bg-raised px-4 py-4">
            <h2 className="text-lg font-semibold tracking-tight text-ink">{project.name}</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              {project.description || 'No description yet.'}
            </p>
            <p className="mt-2 text-xs text-ink-faint">
              {projectTasks.length} task{projectTasks.length === 1 ? '' : 's'} ·{' '}
              {projectArtifacts.length} document{projectArtifacts.length === 1 ? '' : 's'} ·{' '}
              {projectAgents.length} agent{projectAgents.length === 1 ? '' : 's'} ·{' '}
              {projectChats.length} chat{projectChats.length === 1 ? '' : 's'} with this project
              in context
            </p>
          </div>

          <ProjectSection title="Tasks" empty="No tasks linked to this project yet.">
            {projectTasks.map((task) => (
              <Link
                key={task.id}
                to={`/work/${task.id}`}
                className="flex min-touch items-center gap-3 rounded-group border border-line bg-raised px-4 py-3 transition-colors hover:bg-subtle"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {task.title}
                  </span>
                  <span className="block text-xs text-ink-faint">{task.status}</span>
                </span>
              </Link>
            ))}
          </ProjectSection>

          <ProjectSection title="Documents" empty="No documents in this project yet.">
            {projectArtifacts.map((artifact) => (
              <button
                key={artifact.id}
                type="button"
                onClick={() => openInCanvas(artifact.id)}
                className="flex min-touch w-full items-center gap-3 rounded-group border border-line bg-raised px-4 py-3 text-left transition-colors hover:bg-subtle"
              >
                <FileText size={16} className="shrink-0 text-ink-faint" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {artifact.title}
                  </span>
                  <span className="block text-xs text-ink-faint">
                    {artifact.versions.length} version{artifact.versions.length === 1 ? '' : 's'}
                  </span>
                </span>
              </button>
            ))}
          </ProjectSection>

          <ProjectSection title="Agents" empty="No agents assigned to this project yet.">
            {projectAgents.map((agent) => (
              <Link
                key={agent.id}
                to={`/agents/${agent.id}`}
                className="flex min-touch items-center gap-3 rounded-group border border-line bg-raised px-4 py-3 transition-colors hover:bg-subtle"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {agent.name}
                  </span>
                  <span className="block truncate text-xs text-ink-faint">
                    {agent.description}
                  </span>
                </span>
              </Link>
            ))}
          </ProjectSection>

          <ProjectSection
            title="Chats using this project"
            empty="No conversation has this project in its context yet. Add it from a chat's context inspector."
          >
            {projectChats.map((conversation) => (
              <Link
                key={conversation.id}
                to={`/c/${conversation.id}`}
                className="flex min-touch items-center gap-3 rounded-group border border-line bg-raised px-4 py-3 transition-colors hover:bg-subtle"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {conversation.title}
                  </span>
                  <span className="block text-xs text-ink-faint">
                    {conversation.archived ? 'Archived' : 'Active'}
                  </span>
                </span>
              </Link>
            ))}
          </ProjectSection>
        </div>
      </div>
    </div>
  )
}

function ProjectSection({
  title,
  empty,
  children,
}: {
  title: string
  empty: string
  children: React.ReactNode
}) {
  const items = Array.isArray(children) ? children.flat() : [children]
  const hasContent = items.filter(Boolean).length > 0
  return (
    <section className="mt-6" aria-label={title}>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-faint">{title}</h3>
      <div className="mt-2 flex flex-col gap-2">
        {hasContent ? (
          children
        ) : (
          <p className="rounded-group border border-dashed border-line px-4 py-3 text-xs text-ink-faint">
            {empty}
          </p>
        )}
      </div>
    </section>
  )
}
