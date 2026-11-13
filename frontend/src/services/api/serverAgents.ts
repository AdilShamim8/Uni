import { API_ROOT, apiFetch } from './client'

/**
 * Server agent-sessions API client (T014). Typed mirrors of
 * @uni/contracts agent DTOs: sessions, runs, the SSE event stream
 * (with the F05 cursor contract: after = last sequence seen, -1 for a
 * new subscriber; runId scopes the stream's end to one run), and the
 * permission respond endpoint (F02: the requestId the SSE event
 * emitted is the one to answer).
 */

export type AgentMode = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'yolo'
export type AgentSessionStatus = 'idle' | 'running' | 'waiting-for-permission' | 'error'
export type AgentRunStatus = 'running' | 'waiting-for-permission' | 'cancelling' | 'complete' | 'stopped' | 'error'

export interface ServerAgentSession {
  id: string
  name: string
  description: string
  mode: AgentMode
  status: AgentSessionStatus
  providerId: string | null
  modelId: string | null
  /** The employee this session acts as (null = workspace default). RF-071. */
  employeeId: string | null
  rootDir: string
  tools: string[]
  archived: boolean
  createdAt: number
  updatedAt: number
}

export interface ServerAgentRun {
  id: string
  sessionId: string
  status: AgentRunStatus
  inputText: string
  outputText: string
  providerId: string | null
  modelId: string | null
  errorCode: string | null
  errorMessage: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  createdAt: number
  finishedAt: number | null
}

export interface ServerAgentToolDescriptor {
  name: string
  description: string
  mutating: boolean
  gated: boolean
  available?: boolean
}

export interface ServerAgentEvent {
  eventId: string
  sessionId: string
  runId: string | null
  sequence: number
  type: string
  timestamp: number
  payload: {
    text?: string
    toolCallId?: string
    toolName?: string
    toolInput?: Record<string, unknown>
    toolResultStatus?: 'ok' | 'error' | 'denied'
    toolOutput?: string
    permissionRequest?: { requestId: string; type: string; summary?: string }
    decision?: { requestId: string; decision: 'approve' | 'deny'; scope: 'once' | 'always' }
    usage?: { inputTokens?: number; outputTokens?: number }
    status?: AgentRunStatus
    errorCode?: string
    errorMessage?: string
  }
}

export async function listServerAgentTools(): Promise<ServerAgentToolDescriptor[]> {
  const body = await apiFetch<{ tools: ServerAgentToolDescriptor[] }>(`${API_ROOT}/agent/tools`)
  return body.tools
}

export async function listServerAgentSessions(
  includeArchived = false,
): Promise<ServerAgentSession[]> {
  const query = includeArchived ? '?archived=true' : ''
  const body = await apiFetch<{ items: ServerAgentSession[] }>(
    `${API_ROOT}/agent/sessions${query}`,
  )
  return body.items
}

export async function createServerAgentSession(input: {
  name: string
  description?: string
  mode?: AgentMode
  providerId?: string | null
  modelId?: string | null
  rootDir?: string
  tools?: string[]
  employeeId?: string | null
}): Promise<ServerAgentSession> {
  return apiFetch<ServerAgentSession>(`${API_ROOT}/agent/sessions`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function patchServerAgentSession(
  sessionId: string,
  input: Partial<{
    name: string
    description: string
    mode: AgentMode
    providerId: string | null
    modelId: string | null
    tools: string[]
    archived: boolean
    employeeId: string | null
  }>,
): Promise<ServerAgentSession> {
  return apiFetch<ServerAgentSession>(
    `${API_ROOT}/agent/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
}

export async function deleteServerAgentSession(sessionId: string): Promise<void> {
  await apiFetch<void>(`${API_ROOT}/agent/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  })
}

export async function startServerAgentRun(
  sessionId: string,
  input: { text: string; idempotencyKey?: string },
): Promise<{ runId: string; reused: boolean }> {
  return apiFetch<{ runId: string; reused: boolean }>(
    `${API_ROOT}/agent/sessions/${encodeURIComponent(sessionId)}/runs`,
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export async function getServerAgentRun(runId: string): Promise<ServerAgentRun> {
  return apiFetch<ServerAgentRun>(`${API_ROOT}/agent/runs/${encodeURIComponent(runId)}`)
}

export async function cancelServerAgentRun(runId: string): Promise<void> {
  await apiFetch<void>(`${API_ROOT}/agent/runs/${encodeURIComponent(runId)}/cancel`, {
    method: 'POST',
  })
}

export async function respondServerAgentPermission(
  runId: string,
  requestId: string,
  decision: 'approve' | 'deny',
  scope: 'once' | 'always',
): Promise<void> {
  await apiFetch<void>(
    `${API_ROOT}/agent/runs/${encodeURIComponent(runId)}/permissions/${encodeURIComponent(requestId)}`,
    { method: 'POST', body: JSON.stringify({ decision: { requestId, decision, scope } }) },
  )
}

/**
 * The session event stream URL (fetch + ReadableStream; the caller
 * drives the reader). `after` is the last sequence seen — pass -1 for
 * a brand-new subscription; `runId` ends the stream at that run's
 * terminal only.
 */
export function serverAgentEventsUrl(
  sessionId: string,
  after: number,
  runId?: string,
): string {
  const query = runId
    ? `after=${after}&runId=${encodeURIComponent(runId)}`
    : `after=${after}`
  return `${API_ROOT}/agent/sessions/${encodeURIComponent(sessionId)}/events?${query}`
}
