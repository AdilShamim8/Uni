import { API_ROOT, apiFetch } from './client'

/**
 * Server workspace client (B07): the export download. Types mirror
 * @uni/contracts workspace DTOs — local mirrors, like every server
 * client.
 */

export interface ServerWorkspaceExport {
  format: 'uni.workspace.export/1'
  exportedAt: number
  employees: Array<{
    id: string
    name: string
    description: string
    instructions: string
    category: string
    providerId: string | null
    modelId: string | null
    tools: string[]
    starters: string[]
    archived: boolean
    createdAt: number
    updatedAt: number
  }>
  memoryNotes: Array<{
    id: string
    employeeId: string
    text: string
    createdAt: number
    updatedAt: number
  }>
  routines: Array<{
    id: string
    sessionId: string
    employeeId: string | null
    name: string
    prompt: string
    schedule: string
    catchUpMinutes: number
    paused: boolean
    archived: boolean
    lastFireAt: number | null
    createdAt: number
    updatedAt: number
  }>
  files: Array<{
    id: string
    title: string
    fileName: string
    extension: string
    mimeType: string
    extraction: string
    extractedText: string
    charCount: number
    createdAt: number
  }>
  /** Latest journal entries (bounded, RF-084). */
  memoryJournal: Array<{
    id: string
    employeeId: string
    noteId: string | null
    actor: string
    via: string
    kind: string
    diff: string
    added: number
    removed: number
    canRevert: boolean
    revertUnavailableReason: string | null
    createdAt: number
  }>
  /** Latest routine runs (bounded, RF-085). */
  routineRuns: Array<{
    id: string
    routineId: string
    scheduledFor: number
    status: string
    agentRunId: string | null
    outputText: string
    errorCode: string | null
    errorMessage: string | null
    terminalAt: number | null
    createdAt: number
  }>
  counts: {
    employees: number
    memoryNotes: number
    memoryJournal: number
    routines: number
    routineRuns: number
    files: number
  }
}

export async function exportServerWorkspace(): Promise<ServerWorkspaceExport> {
  return apiFetch<ServerWorkspaceExport>(`${API_ROOT}/workspace/export`)
}
