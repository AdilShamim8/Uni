import { API_ROOT, apiFetch } from './client'

/**
 * Server employees + memory API clients (T014/T016). Typed mirrors of
 * @uni/contracts employees/memory DTOs, following the same self-
 * contained-client convention as serverContracts.ts (no runtime
 * dependency on the contracts package; shapes asserted in tests).
 */

export interface ServerEmployee {
  id: string
  name: string
  description: string
  instructions: string
  category: 'personal' | 'specialist'
  providerId: string | null
  modelId: string | null
  tools: string[]
  starters: string[]
  archived: boolean
  createdAt: number
  updatedAt: number
}

export interface ServerMemoryNote {
  id: string
  text: string
  createdAt: number
}

/**
 * RF-065 — the journal entry as the API actually returns it
 * (contracts memoryJournalEntryDtoSchema). The previous
 * ServerMemoryAuditEntry shape never matched the DTO; this one is a
 * field-for-field mirror.
 */
export interface ServerMemoryJournalEntry {
  id: string
  employeeId: string
  noteId: string | null
  actor: 'user' | 'employee' | 'import' | 'system'
  via: string
  kind: 'created' | 'edited' | 'deleted'
  beforeHash: string | null
  afterHash: string | null
  before: string | null
  diff: string
  added: number
  removed: number
  canRevert: boolean
  revertUnavailableReason: string | null
  createdAt: number
}

export async function listServerEmployees(includeArchived = false): Promise<ServerEmployee[]> {
  const query = includeArchived ? '?archived=true' : ''
  const page = await apiFetch<{ items: ServerEmployee[] }>(`${API_ROOT}/employees${query}`)
  return page.items
}

export async function createServerEmployee(input: {
  name: string
  description?: string
  instructions?: string
  category?: 'personal' | 'specialist'
  providerId?: string | null
  modelId?: string | null
  tools?: string[]
  starters?: string[]
}): Promise<ServerEmployee> {
  return apiFetch<ServerEmployee>(`${API_ROOT}/employees`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function patchServerEmployee(
  employeeId: string,
  input: Partial<{
    name: string
    description: string
    instructions: string
    category: 'personal' | 'specialist'
    providerId: string | null
    modelId: string | null
    tools: string[]
    starters: string[]
    archived: boolean
  }>,
): Promise<ServerEmployee> {
  return apiFetch<ServerEmployee>(`${API_ROOT}/employees/${encodeURIComponent(employeeId)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function deleteServerEmployee(employeeId: string): Promise<void> {
  await apiFetch<void>(`${API_ROOT}/employees/${encodeURIComponent(employeeId)}`, {
    method: 'DELETE',
  })
}

export async function listServerMemoryNotes(employeeId: string): Promise<ServerMemoryNote[]> {
  const page = await apiFetch<{ items: ServerMemoryNote[] }>(
    `${API_ROOT}/employees/${encodeURIComponent(employeeId)}/memory`,
  )
  return page.items
}

export async function addServerMemoryNote(
  employeeId: string,
  text: string,
): Promise<ServerMemoryNote> {
  return apiFetch<ServerMemoryNote>(
    `${API_ROOT}/employees/${encodeURIComponent(employeeId)}/memory`,
    { method: 'POST', body: JSON.stringify({ text }) },
  )
}

export async function deleteServerMemoryNote(
  employeeId: string,
  noteId: string,
): Promise<void> {
  await apiFetch<void>(
    `${API_ROOT}/employees/${encodeURIComponent(employeeId)}/memory/${encodeURIComponent(noteId)}`,
    { method: 'DELETE' },
  )
}

export async function listServerMemoryJournal(
  employeeId: string,
  limit = 50,
): Promise<ServerMemoryJournalEntry[]> {
  const page = await apiFetch<{ items: ServerMemoryJournalEntry[] }>(
    `${API_ROOT}/employees/${encodeURIComponent(employeeId)}/memory/journal?limit=${limit}`,
  )
  return page.items
}

/**
 * Revert one journal entry server-side. The response carries the
 * restored note (null when the revert removes it) and the journal
 * entry the revert itself appended.
 */
export async function revertServerMemoryJournalEntry(
  employeeId: string,
  entryId: string,
): Promise<{ note: ServerMemoryNote | null; entry: ServerMemoryJournalEntry | null }> {
  return apiFetch<{ note: ServerMemoryNote | null; entry: ServerMemoryJournalEntry | null }>(
    `${API_ROOT}/employees/${encodeURIComponent(employeeId)}/memory/journal/${encodeURIComponent(entryId)}/revert`,
    { method: 'POST' },
  )
}
