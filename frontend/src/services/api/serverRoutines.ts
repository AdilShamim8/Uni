import { API_ROOT, apiFetch } from './client'

/**
 * Server Routines API client (T033). Types mirror @uni/contracts
 * routines DTOs — the frontend deliberately holds local mirrors of the
 * shared contracts (no package dependency), exactly like the work and
 * MCP clients.
 */

export type RoutineRunStatus =
  | 'pending'
  | 'running'
  | 'complete'
  | 'stopped'
  | 'error'
  | 'skipped'

export interface ServerRoutine {
  id: string
  /** The routine's own unattended agent session (server-provisioned). */
  sessionId: string
  employeeId: string | null
  /** The pinned employee's name at read time (null when unpinned). */
  employeeName: string | null
  name: string
  prompt: string
  /** 5-field cron expression, UTC. */
  schedule: string
  catchUpMinutes: number
  paused: boolean
  archived: boolean
  lastFireAt: number | null
  /** Server-computed preview (RF-030); null when paused or nothing fires within 7 days. */
  nextFireAt: number | null
  createdAt: number
  updatedAt: number
}

export interface ServerRoutineRun {
  id: string
  routineId: string
  /** The scheduled minute this fire belongs to (epoch ms, UTC). */
  scheduledFor: number
  status: RoutineRunStatus
  agentRunId: string | null
  outputText: string
  errorCode: string | null
  errorMessage: string | null
  createdAt: number
  terminalAt: number | null
}

export interface CreateServerRoutineInput {
  name: string
  prompt: string
  schedule: string
  catchUpMinutes?: number
  employeeId?: string | null
}

export interface PatchServerRoutineInput {
  name?: string
  prompt?: string
  schedule?: string
  catchUpMinutes?: number
  paused?: boolean
  archived?: boolean
  /** Re-pin (null unpins); the provisioned session follows (RF-057). */
  employeeId?: string | null
}

export async function listServerRoutines(
  includeArchived = false,
): Promise<ServerRoutine[]> {
  const query = includeArchived ? '?includeArchived=true' : ''
  const body = await apiFetch<{ items: ServerRoutine[] }>(`${API_ROOT}/routines${query}`)
  return Array.isArray(body.items) ? body.items : []
}

export async function getServerRoutine(
  routineId: string,
): Promise<{ routine: ServerRoutine; runs: ServerRoutineRun[] }> {
  return apiFetch<{ routine: ServerRoutine; runs: ServerRoutineRun[] }>(
    `${API_ROOT}/routines/${encodeURIComponent(routineId)}`,
  )
}

export async function createServerRoutine(
  input: CreateServerRoutineInput,
): Promise<ServerRoutine> {
  return apiFetch<ServerRoutine>(`${API_ROOT}/routines`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function patchServerRoutine(
  routineId: string,
  patch: PatchServerRoutineInput,
): Promise<ServerRoutine> {
  return apiFetch<ServerRoutine>(`${API_ROOT}/routines/${encodeURIComponent(routineId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export async function deleteServerRoutine(routineId: string): Promise<void> {
  await apiFetch<unknown>(`${API_ROOT}/routines/${encodeURIComponent(routineId)}`, {
    method: 'DELETE',
  })
}
