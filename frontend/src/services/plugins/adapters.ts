import type { PluginThreadRef } from '@/domain/pluginTypes'
import {
  parseCsvText,
  profileColumns,
  summarizeColumn,
  summarizeToMarkdown,
  MAX_FILE_BYTES,
} from '@/domain/csvAnalysis'
import { registerAdapter, type AdapterContext, type AdapterResult } from './dispatcher'
import { useLibraryStore } from '@/state/libraryStore'
import { useWorkspaceUiStore } from '@/state/workspaceUiStore'
import { useContextStore } from '@/state/contextStore'
import {
  saveTaskReportToLibrary,
  saveActiveReplyToLibrary,
  CanonicalSaveError,
} from '@/services/work/canonicalSave'

/**
 * Built-in plugin adapters (milestone 06) — thin, typed wrappers around
 * the engines that already exist. They reuse the Library/Canvas records
 * and the real CSV analyzer; they never fork data or fabricate results.
 *
 * Registration is idempotent so re-imports (tests, HMR) stay safe.
 */

/* ------------------------------------------------------------------ */
/* Documents — create a Canvas document / save output to the Library    */
/* ------------------------------------------------------------------ */

export interface DocumentsCreateInput {
  title?: string
  content?: string
}

async function documentsCreateAdapter(
  input: DocumentsCreateInput | undefined,
  context: AdapterContext,
): Promise<AdapterResult> {
  const library = useLibraryStore.getState()
  const title = (input?.title ?? 'Untitled document').trim().slice(0, 80) || 'Untitled document'
  const artifactId = library.addArtifact({
    title,
    kind: 'document',
    markdown: input?.content?.trim() ?? '',
    provenance: 'user-authored',
    source:
      context.thread?.kind === 'work'
        ? { conversationId: null, messageId: null, taskId: context.thread.taskId }
        : context.thread?.kind === 'agent'
          ? { conversationId: context.thread.conversationId, messageId: null, taskId: null }
          : null,
  })
  useWorkspaceUiStore.getState().openInspector({ tab: 'canvas', artifactId })
  return {
    summary: `Created “${title}” and opened it in Canvas.`,
    detail: 'A real local document — versions and drafts work like any Library artifact.',
    artifactId,
  }
}

export interface DocumentsSaveInput {
  /** Prefer the task’s current report when saving from a Work thread. */
  taskId?: string
}

async function documentsSaveAdapter(
  input: DocumentsSaveInput | undefined,
  context: AdapterContext,
): Promise<AdapterResult> {
  // The canonical save operation (milestone 07): one artifact per source,
  // linked back, provenance preserved — identical to the Outputs panel.
  const taskId = input?.taskId ?? (context.thread?.kind === 'work' ? context.thread.taskId : null)
  try {
    if (taskId) {
      const result = saveTaskReportToLibrary(taskId)
      const summary = result.recreated
        ? `The previously saved document was deleted — recreated “${result.title}” and re-linked it to this task.`
        : result.created
          ? `Saved “${result.title}” to the Library and opened it in Canvas.`
          : `Updated the Library copy of “${result.title}” — no duplicate was created.`
      return {
        summary,
        detail: result.recreated
          ? 'A fresh artifact now holds this task’s output; the task link is restored.'
          : 'The task, its Library document, and Canvas stay in sync through one canonical save.',
        artifactId: result.artifactId,
      }
    }
    if (context.thread?.kind === 'agent') {
      const result = saveActiveReplyToLibrary(context.thread.conversationId)
      return {
        summary: result.created
          ? `Saved the latest reply as “${result.title}”.`
          : `Updated the saved copy of “${result.title}” — no duplicate was created.`,
        detail: 'Saved from the reply currently visible in this thread, with its live/demo origin kept.',
        artifactId: result.artifactId,
      }
    }
    throw new CanonicalSaveError('Save needs a thread with output to save.')
  } catch (error) {
    if (error instanceof CanonicalSaveError) throw error
    throw new Error('The save could not be completed.')
  }
}

/* ------------------------------------------------------------------ */
/* Data analysis — the real local CSV engine on a user-selected file    */
/* ------------------------------------------------------------------ */

export interface DataAnalyzeInput {
  /** The user-selected file. Metadata alone is never analyzed. */
  file: File | null
}

/** Read a file as text across browsers (File.text is not universal). */
function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('The file could not be read.'))
    reader.readAsText(file)
  })
}

async function dataAnalyzeAdapter(
  input: DataAnalyzeInput | undefined,
): Promise<AdapterResult> {
  const file = input?.file ?? null
  if (!file) {
    throw new Error('No file was selected — nothing was analyzed.')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`That file is larger than the ${MAX_FILE_BYTES / 1024} KB local limit.`)
  }
  const text = await readFileText(file)
  const parsed = parseCsvText(text)
  if (parsed.rows.length === 0) {
    throw new Error('No rows were found in that file — nothing was analyzed.')
  }
  const profiles = profileColumns(parsed)
  const summaries = profiles.map((profile) =>
    summarizeColumn(profile, { type: 'auto' }),
  )
  const markdown = summarizeToMarkdown({
    fileName: file.name,
    parsed,
    summaries,
    grouping: null,
  })
  const library = useLibraryStore.getState()
  const artifactId = library.addArtifact({
    title: `Analysis — ${file.name}`,
    kind: 'data',
    markdown,
    provenance: 'local-computation',
    source: null,
  })
  const warnings = parsed.warnings.length > 0 ? ` · ${parsed.warnings.length} warning(s)` : ''
  return {
    summary: `Analyzed ${file.name}: ${parsed.rows.length} rows, ${parsed.headers.length} columns${warnings}.`,
    detail:
      'Computed on this device by the existing local engine — the file never left the browser.',
    artifactId,
  }
}

/* ------------------------------------------------------------------ */
/* Library context — find local documents, attach selected content      */
/* ------------------------------------------------------------------ */

export interface LibrarySearchInput {
  query?: string
}

async function librarySearchAdapter(
  input: LibrarySearchInput | undefined,
): Promise<AdapterResult> {
  const query = (input?.query ?? '').trim().toLowerCase()
  const artifacts = Object.values(useLibraryStore.getState().artifacts)
  const matches = artifacts
    .filter((artifact) =>
      query ? artifact.title.toLowerCase().includes(query) : true,
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5)
    .map((artifact) => ({ id: artifact.id, title: artifact.title, kind: artifact.kind }))
  if (matches.length === 0) {
    throw new Error(query ? `No local documents match “${query}”.` : 'The Library is empty.')
  }
  return {
    summary: `Found ${matches.length} local document${matches.length === 1 ? '' : 's'}${
      query ? ` matching “${query}”` : ''
    }.`,
    detail: `Search ran over this app’s Library only — nothing external was queried. Matches: ${matches
      .map((match) => match.title)
      .join(' · ')}.`,
  }
}

export interface LibraryAttachInput {
  artifactId: string
  thread?: PluginThreadRef | null
}

async function libraryAttachAdapter(
  input: LibraryAttachInput,
  context: AdapterContext,
): Promise<AdapterResult> {
  const library = useLibraryStore.getState()
  const artifact = library.artifacts[input.artifactId]
  if (!artifact) {
    throw new Error('That document no longer exists in the Library.')
  }
  const thread = input.thread ?? context.thread
  if (!thread) {
    throw new Error('Attach needs an active thread to attach to.')
  }
  // The target key matches the context store’s addressing: task or
  // conversation id. This is the same explicit-selection mechanism the
  // context inspector uses — a plugin cannot force content in silently.
  const targetKey = thread.kind === 'work' ? thread.taskId : thread.conversationId
  useContextStore.getState().addArtifactContext(targetKey, {
    refId: artifact.id,
    title: artifact.title,
  })
  const size = artifact.markdown.length
  return {
    summary: `Attached “${artifact.title}” to this thread’s context.`,
    detail: `Included on the next request in this thread, within the explicit context limits (≈${size} characters). You can review or remove it in the context inspector.`,
    artifactId: artifact.id,
  }
}

registerBuiltInAdapters()

/**
 * (Re-)register the built-in adapters. Idempotent — safe to call from
 * tests that reset the registry, and called once at module scope.
 */
export function registerBuiltInAdapters(): void {
  registerAdapter<DocumentsCreateInput>('documents.create', documentsCreateAdapter)
  registerAdapter<DocumentsSaveInput>('documents.save', documentsSaveAdapter)
  registerAdapter<DataAnalyzeInput>('data.analyze', dataAnalyzeAdapter)
  registerAdapter<LibrarySearchInput>('library.search', librarySearchAdapter)
  registerAdapter<LibraryAttachInput>('library.attach', libraryAttachAdapter)
}
