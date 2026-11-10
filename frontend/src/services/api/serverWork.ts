import { API_ROOT, apiFetch } from './client'

/**
 * Server Work API client (T019). Typed mirrors of @uni/contracts work
 * DTOs. Mode-aware adapters in the work store choose between the local
 * task machine and these endpoints at the explicit signed-in boundary.
 */

export type WorkTaskStatus = 'draft' | 'running' | 'blocked' | 'complete' | 'cancelled' | 'error'
export type WorkTaskDeliverable = 'research-report' | 'data-report' | 'email-draft' | 'document-draft' | 'generic'

export interface ServerWorkTask {
  id: string
  title: string
  goal: string
  deliverable: WorkTaskDeliverable
  status: WorkTaskStatus
  employeeId: string | null
  sessionId: string | null
  activeRunId: string | null
  artifactId: string | null
  statusLabel: string
  createdAt: number
  updatedAt: number
}

export interface ServerWorkRun {
  id: string
  taskId: string
  revision: number
  agentRunId: string
  status: 'running' | 'complete' | 'stopped' | 'error'
  outcome: string | null
  startedAt: number
  finishedAt: number | null
}

export async function listServerWorkTasks(
  includeCancelled = false,
): Promise<ServerWorkTask[]> {
  const query = includeCancelled ? '?includeCancelled=true' : ''
  const body = await apiFetch<{ items: ServerWorkTask[] }>(`${API_ROOT}/work/tasks${query}`)
  return body.items
}

export async function getServerWorkTask(
  taskId: string,
): Promise<{ task: ServerWorkTask; runs: ServerWorkRun[] }> {
  return apiFetch<{ task: ServerWorkTask; runs: ServerWorkRun[] }>(
    `${API_ROOT}/work/tasks/${encodeURIComponent(taskId)}`,
  )
}

export async function createServerWorkTask(input: {
  title: string
  goal?: string
  deliverable?: WorkTaskDeliverable
  employeeId?: string | null
}): Promise<ServerWorkTask> {
  return apiFetch<ServerWorkTask>(`${API_ROOT}/work/tasks`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function startServerWorkTask(taskId: string): Promise<{
  task: ServerWorkTask
  run: ServerWorkRun
}> {
  return apiFetch<{ task: ServerWorkTask; run: ServerWorkRun }>(
    `${API_ROOT}/work/tasks/${encodeURIComponent(taskId)}/actions`,
    { method: 'POST', body: JSON.stringify({ action: 'start' }) },
  )
}

export async function cancelServerWorkTask(taskId: string): Promise<void> {
  await apiFetch<{ cancelled: boolean }>(
    `${API_ROOT}/work/tasks/${encodeURIComponent(taskId)}/actions`,
    { method: 'POST', body: JSON.stringify({ action: 'cancel' }) },
  )
}

export async function answerServerWorkTask(
  taskId: string,
  answer: string,
): Promise<{ task: ServerWorkTask; run: ServerWorkRun }> {
  return apiFetch<{ task: ServerWorkTask; run: ServerWorkRun }>(
    `${API_ROOT}/work/tasks/${encodeURIComponent(taskId)}/actions`,
    { method: 'POST', body: JSON.stringify({ action: 'answer', answer }) },
  )
}
