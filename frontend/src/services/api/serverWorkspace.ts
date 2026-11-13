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
  counts: {
    employees: number
    memoryNotes: number
    routines: number
    files: number
  }
}

export async function exportServerWorkspace(): Promise<ServerWorkspaceExport> {
  return apiFetch<ServerWorkspaceExport>(`${API_ROOT}/workspace/export`)
}
