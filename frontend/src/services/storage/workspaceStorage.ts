import type {
  AgentProfile,
  AgentThreadEvent,
  Artifact,
  MemoryNote,
  Project,
  ScheduleDraft,
  WorkTask,
} from '@/domain/workspaceTypes'
import type { KnowledgeChunk, KnowledgeDocument } from '@/domain/knowledgeBase'

/**
 * Workspace persistence — a family of independently versioned slices,
 * separate from chat data (`universe:data`).
 *
 * - `universe:agents:v1` — agent profiles, memory notes, schedule drafts.
 * - `universe:work:v1` — tasks and their activity logs.
 * - `universe:library:v1` — artifacts and projects.
 * - `universe:knowledge:v1` — knowledge-base documents and their chunks.
 *
 * Each slice loads and saves under its own key, so stores never overwrite
 * each other, and a corrupt slice quarantines only itself (a backup is
 * kept, mirroring the chat-storage policy). Credentials are never part of
 * any workspace payload.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAgent(value: unknown): value is AgentProfile {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.instructions === 'string' &&
    (value.category === 'personal' || value.category === 'specialist') &&
    typeof value.archived === 'boolean'
  )
}

function isMemoryNote(value: unknown): value is MemoryNote {
  return isRecord(value) && typeof value.id === 'string' && typeof value.text === 'string'
}

function isSchedule(value: unknown): value is ScheduleDraft {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
}

function isAgentThreadEvent(value: unknown): value is AgentThreadEvent {
  return isRecord(value) && typeof value.id === 'string' && typeof value.label === 'string'
}

function isTask(value: unknown): value is WorkTask {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.status === 'string' &&
    Array.isArray(value.events)
  )
}

function isArtifact(value: unknown): value is Artifact {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.markdown === 'string'
  )
}

function isProject(value: unknown): value is Project {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
}

/* ------------------------------------------------------------------ */
/* Generic slice load/save with quarantine                             */
/* ------------------------------------------------------------------ */

export interface SliceResult<T> {
  state: T | null
  recoveredFrom?: string
}

function loadSlice<T>(key: string, guard: (value: unknown) => value is T): SliceResult<T> {
  let raw: string | null
  try {
    raw = localStorage.getItem(key)
  } catch {
    return { state: null }
  }
  if (raw === null) return { state: null }

  try {
    const parsed: unknown = JSON.parse(raw)
    if (isRecord(parsed) && parsed.version === 1 && guard(parsed.payload)) {
      return { state: parsed.payload }
    }
  } catch {
    // fall through to quarantine
  }

  const backupKey = `universe:backup:${key}:${Date.now()}`
  try {
    localStorage.setItem(backupKey, raw)
    localStorage.removeItem(key)
  } catch {
    /* best effort */
  }
  return { state: null, recoveredFrom: backupKey }
}

function saveSlice<T>(key: string, payload: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify({ version: 1, savedAt: Date.now(), payload }))
    return true
  } catch {
    // Quota or privacy-mode failure: keep working from memory.
    return false
  }
}

function clearSlice(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Agents slice                                                        */
/* ------------------------------------------------------------------ */

export interface AgentsSlice {
  agents: AgentProfile[]
  memoryNotes: MemoryNote[]
  schedules: ScheduleDraft[]
  /** Optional for pre-milestone-06 slices; defaults to [] on load. */
  threadEvents?: AgentThreadEvent[]
}

export function isAgentsSlice(value: unknown): value is AgentsSlice {
  return (
    isRecord(value) &&
    Array.isArray(value.agents) &&
    value.agents.every(isAgent) &&
    Array.isArray(value.memoryNotes) &&
    value.memoryNotes.every(isMemoryNote) &&
    Array.isArray(value.schedules) &&
    value.schedules.every(isSchedule) &&
    (value.threadEvents === undefined ||
      (Array.isArray(value.threadEvents) && value.threadEvents.every(isAgentThreadEvent)))
  )
}

const AGENTS_KEY = 'universe:agents:v1'

export function loadAgentsSlice(): SliceResult<AgentsSlice> {
  return loadSlice(AGENTS_KEY, isAgentsSlice)
}

export function saveAgentsSlice(slice: AgentsSlice): boolean {
  return saveSlice(AGENTS_KEY, slice)
}

export function clearAgentsSlice(): void {
  clearSlice(AGENTS_KEY)
}

/* ------------------------------------------------------------------ */
/* Work slice                                                          */
/* ------------------------------------------------------------------ */

export interface WorkSlice {
  tasks: WorkTask[]
}

export function isWorkSlice(value: unknown): value is WorkSlice {
  return isRecord(value) && Array.isArray(value.tasks) && value.tasks.every(isTask)
}

const WORK_KEY = 'universe:work:v1'

export function loadWorkSlice(): SliceResult<WorkSlice> {
  return loadSlice(WORK_KEY, isWorkSlice)
}

export function saveWorkSlice(slice: WorkSlice): boolean {
  return saveSlice(WORK_KEY, slice)
}

export function clearWorkSlice(): void {
  clearSlice(WORK_KEY)
}

/* ------------------------------------------------------------------ */
/* Library slice                                                       */
/* ------------------------------------------------------------------ */

export interface LibrarySlice {
  artifacts: Artifact[]
  projects: Project[]
}

export function isLibrarySlice(value: unknown): value is LibrarySlice {
  return (
    isRecord(value) &&
    Array.isArray(value.artifacts) &&
    value.artifacts.every(isArtifact) &&
    Array.isArray(value.projects) &&
    value.projects.every(isProject)
  )
}

const LIBRARY_KEY = 'universe:library:v1'

export function loadLibrarySlice(): SliceResult<LibrarySlice> {
  return loadSlice(LIBRARY_KEY, isLibrarySlice)
}

export function saveLibrarySlice(slice: LibrarySlice): boolean {
  return saveSlice(LIBRARY_KEY, slice)
}

export function clearLibrarySlice(): void {
  clearSlice(LIBRARY_KEY)
}

/* ------------------------------------------------------------------ */
/* Knowledge slice                                                     */
/* ------------------------------------------------------------------ */

export interface KnowledgeSlice {
  documents: KnowledgeDocument[]
  chunks: KnowledgeChunk[]
}

function isKnowledgeDocument(value: unknown): value is KnowledgeDocument {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    (value.source === 'paste' || value.source === 'file') &&
    (value.fileName === null || typeof value.fileName === 'string') &&
    typeof value.createdAt === 'number' &&
    typeof value.updatedAt === 'number' &&
    typeof value.charCount === 'number' &&
    typeof value.chunkCount === 'number'
  )
}

function isKnowledgeChunk(value: unknown): value is KnowledgeChunk {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.docId === 'string' &&
    typeof value.ordinal === 'number' &&
    typeof value.heading === 'string' &&
    typeof value.text === 'string'
  )
}

export function isKnowledgeSlice(value: unknown): value is KnowledgeSlice {
  return (
    isRecord(value) &&
    Array.isArray(value.documents) &&
    value.documents.every(isKnowledgeDocument) &&
    Array.isArray(value.chunks) &&
    value.chunks.every(isKnowledgeChunk)
  )
}

const KNOWLEDGE_KEY = 'universe:knowledge:v1'

export function loadKnowledgeSlice(): SliceResult<KnowledgeSlice> {
  return loadSlice(KNOWLEDGE_KEY, isKnowledgeSlice)
}

export function saveKnowledgeSlice(slice: KnowledgeSlice): boolean {
  return saveSlice(KNOWLEDGE_KEY, slice)
}

export function clearKnowledgeSlice(): void {
  clearSlice(KNOWLEDGE_KEY)
}
