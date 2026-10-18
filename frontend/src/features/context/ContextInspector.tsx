import { useMemo, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { FileText, FolderKanban, NotebookPen, Plus, StickyNote, X } from 'lucide-react'
import { CONTEXT_ITEM_LIMIT, useContextStore, type ContextItem } from '@/state/contextStore'
import {
  buildContextBlock,
  resolveContextItems,
  totalContextSize,
  type ResolvedContextItem,
} from '@/domain/contextResolution'
import { useLibraryStore } from '@/state/libraryStore'
import { useWorkStore } from '@/state/workStore'
import { useAppStore } from '@/state/store'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Menu, MenuItem } from '@/components/ui/Menu'
import { TextField } from '@/components/ui/TextField'

/**
 * Context inspector — shows exactly which local items the current chat or
 * task will see, whether their content is available, and what a live send
 * would include. Items can be added (Library documents, projects, notes)
 * and removed at any time. Everything stays local until an explicit send.
 *
 * The target follows the destination: the routed task on Work, the active
 * conversation in Chat. A brand-new task brief has no target until the
 * task exists — the inspector says so instead of guessing.
 */

function humanSize(characters: number): string {
  if (characters < 1024) return `${characters} chars`
  return `${(characters / 1024).toFixed(1)} KB`
}

function useContextTarget(): { targetKey: string | null; taskTitle: string | null } {
  const location = useLocation()
  const params = useParams()
  const activeConversationId = useAppStore((state) => state.activeConversationId)
  const tasks = useWorkStore((state) => state.tasks)

  const onWork = location.pathname.startsWith('/work')
  const taskTarget = params.taskId && params.taskId !== 'new' ? params.taskId : null
  if (onWork) {
    if (!taskTarget) return { targetKey: null, taskTitle: null }
    const task = tasks[taskTarget]
    return { targetKey: task ? taskTarget : null, taskTitle: task?.title ?? null }
  }
  return { targetKey: activeConversationId, taskTitle: null }
}

export function ContextInspector() {
  const closeInspector = useWorkspaceUiStore((state) => state.closeInspector)
  const artifacts = useLibraryStore((state) => state.artifacts)
  const projects = useLibraryStore((state) => state.projects)

  const selection = useContextStore((state) => state.selections)
  const removeContextItem = useContextStore((state) => state.removeContextItem)
  const clearContext = useContextStore((state) => state.clearContext)

  const [noteOpen, setNoteOpen] = useState(false)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')

  const { targetKey, taskTitle } = useContextTarget()

  const items: ContextItem[] = useMemo(
    () => (targetKey ? selection[targetKey] ?? [] : []),
    [selection, targetKey],
  )

  const resolved = useMemo(
    () => resolveContextItems(items, artifacts, projects),
    [items, artifacts, projects],
  )

  const contextBlock = useMemo(() => buildContextBlock(resolved), [resolved])
  const totalSize = useMemo(() => totalContextSize(resolved), [resolved])

  if (!targetKey) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <FolderKanban size={22} className="text-ink-faint" aria-hidden="true" />
        <p className="max-w-[17rem] text-sm leading-relaxed text-ink-faint">
          Open a conversation or a saved task, then choose which documents and projects it should
          see.
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2.5">
        <FolderKanban size={15} className="shrink-0 text-ink-faint" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold tracking-tight text-ink">Context</p>
          <p className="truncate text-[11.5px] text-ink-faint">
            {taskTitle ? `Task — ${taskTitle}` : 'This conversation'}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close panel"
          onClick={closeInspector}
          className="inline-flex h-8 w-8 items-center justify-center rounded-control text-ink-soft transition-colors hover:bg-[var(--c-hover-wash)] hover:text-ink"
        >
          <X size={16} />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {items.length === 0 ? (
          <div className="rounded-group border border-dashed border-line px-4 py-6 text-center">
            <p className="text-sm leading-relaxed text-ink-soft">
              Nothing selected yet. Add a document, a project, or a note — only what you choose
              here is ever included.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5" aria-label="Selected context">
            {resolved.map((entry) => (
              <ContextRow
                key={entry.item.id}
                entry={entry}
                onRemove={() => removeContextItem(targetKey, entry.item.id)}
              />
            ))}
          </ul>
        )}

        {items.length > 0 && contextBlock && (
          <section className="mt-4" aria-label="What a live send includes">
            <p className="text-[12px] font-medium text-ink-faint">
              Included on your next live send
            </p>
            <pre className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-group border border-line bg-raised p-3 text-[11.5px] leading-relaxed text-ink-soft">
              {contextBlock.slice(0, 1200)}
              {contextBlock.length > 1200 ? '\n…' : ''}
            </pre>
            <p className="mt-1.5 text-[11.5px] text-ink-faint">
              {humanSize(totalSize)} total · stays on this device until you send
            </p>
          </section>
        )}
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-line px-3 py-2.5">
        <AddContextMenu onAddNote={() => {
          setNoteTitle('')
          setNoteContent('')
          setNoteOpen(true)
        }} />
        <div className="flex-1" />
        {items.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => clearContext(targetKey)}>
            Clear all
          </Button>
        )}
      </footer>

      <Dialog
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        title="Add a context note"
        description={`Plain text, up to ${CONTEXT_ITEM_LIMIT.toLocaleString()} characters. Included with live sends for this ${taskTitle ? 'task' : 'conversation'} only.`}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!noteContent.trim()}
              onClick={() => {
                useContextStore.getState().addNoteContext(targetKey, {
                  title: noteTitle,
                  content: noteContent,
                })
                setNoteOpen(false)
              }}
            >
              Add note
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <TextField
            label="Title (optional)"
            value={noteTitle}
            onChange={(event) => setNoteTitle(event.target.value)}
          />
          <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
            Note
            <textarea
              value={noteContent}
              onChange={(event) => setNoteContent(event.target.value)}
              rows={6}
              className="w-full resize-none rounded-control border border-line bg-raised p-3 text-sm font-normal leading-relaxed text-ink focus:border-accent focus:outline-none"
              placeholder="e.g. Audience: internal team. Keep the tone factual."
            />
          </label>
        </div>
      </Dialog>
    </div>
  )
}

function ContextRow({ entry, onRemove }: { entry: ResolvedContextItem; onRemove: () => void }) {
  const { item, available, reason, truncated, size } = entry
  return (
    <li
      className={`flex items-start gap-2.5 rounded-group border px-3 py-2.5 ${
        available ? 'border-line bg-raised' : 'border-dashed border-line bg-transparent'
      }`}
    >
      <span aria-hidden="true" className="mt-0.5 shrink-0 text-ink-faint">
        {item.kind === 'artifact' ? (
          <FileText size={15} />
        ) : item.kind === 'project' ? (
          <FolderKanban size={15} />
        ) : (
          <StickyNote size={15} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-[13px] font-medium ${
            available ? 'text-ink' : 'text-ink-faint'
          }`}
        >
          {item.title}
        </p>
        <p className="mt-0.5 text-[11.5px] leading-snug text-ink-faint">
          {available
            ? `${item.kind === 'artifact' ? 'Document' : item.kind === 'project' ? 'Project' : 'Note'} · ${humanSize(size)}${truncated ? ' · will be truncated' : ''}`
            : reason}
        </p>
      </div>
      <button
        type="button"
        aria-label={`Remove ${item.title} from context`}
        onClick={onRemove}
        className="rounded-md p-1 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
      >
        <X size={14} />
      </button>
    </li>
  )
}

function AddContextMenu({ onAddNote }: { onAddNote: () => void }) {
  const artifacts = useLibraryStore((state) => state.artifacts)
  const projects = useLibraryStore((state) => state.projects)
  const { targetKey } = useContextTarget()

  const artifactList = useMemo(
    () => Object.values(artifacts).sort((a, b) => b.updatedAt - a.updatedAt),
    [artifacts],
  )
  const projectList = useMemo(
    () => Object.values(projects).sort((a, b) => a.name.localeCompare(b.name)),
    [projects],
  )

  return (
    <Menu
      label="Add context"
      width="w-64"
      trigger={
        <Button variant="secondary" size="sm" disabled={!targetKey}>
          <Plus size={13} />
          Add context
        </Button>
      }
    >
      <MenuItem icon={<NotebookPen size={15} />} onClick={onAddNote}>
        New note…
      </MenuItem>
      {projectList.length > 0 && (
        <>
          <div className="my-1 border-t border-line" />
          <p className="px-2.5 pb-1 pt-1.5 text-[12px] font-medium text-ink-faint">
            Projects
          </p>
          {projectList.map((project) => (
            <MenuItem
              key={project.id}
              icon={<FolderKanban size={15} />}
              onClick={() => {
                if (!targetKey) return
                useContextStore
                  .getState()
                  .addProjectContext(targetKey, { refId: project.id, title: project.name })
              }}
            >
              {project.name}
            </MenuItem>
          ))}
        </>
      )}
      {artifactList.length > 0 && (
        <>
          <div className="my-1 border-t border-line" />
          <p className="px-2.5 pb-1 pt-1.5 text-[12px] font-medium text-ink-faint">
            Documents
          </p>
          {artifactList.slice(0, 12).map((artifact) => (
            <MenuItem
              key={artifact.id}
              icon={<FileText size={15} />}
              onClick={() => {
                if (!targetKey) return
                useContextStore
                  .getState()
                  .addArtifactContext(targetKey, { refId: artifact.id, title: artifact.title })
              }}
            >
              {artifact.title}
            </MenuItem>
          ))}
        </>
      )}
      {artifactList.length === 0 && projectList.length === 0 && (
        <p className="px-2.5 py-2 text-xs leading-relaxed text-ink-faint">
          Nothing to add yet — save a document or create a project first.
        </p>
      )}
    </Menu>
  )
}
