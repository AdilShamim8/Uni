import { API_ROOT, apiFetch } from './client'

/**
 * Server Library API client (T014/T017). Typed mirrors of
 * @uni/contracts library DTOs; canonical-save is the one operation per
 * source of truth (immutable versions, same-source dedup via
 * linkedArtifactId).
 */

export type LibraryArtifactKind = 'report' | 'document' | 'email' | 'data'
export type LibraryProvenance = 'provider-generated' | 'demo-simulation' | 'imported'

export interface LibraryGeneratedBy {
  providerId: string
  modelId: string
}

export interface ServerLibraryArtifact {
  id: string
  title: string
  kind: LibraryArtifactKind
  markdown: string
  provenance: LibraryProvenance
  generatedBy: LibraryGeneratedBy | null
  taskId: string | null
  sourceConversationId: string | null
  sourceMessageId: string | null
  versionCount: number
  createdAt: number
  updatedAt: number
}

export interface ServerLibraryArtifactVersion {
  version: number
  title: string
  markdown: string
  createdAt: number
}

export interface ServerCanonicalSaveResult {
  artifactId: string
  created: boolean
  recreated: boolean
  title: string
  version: number
}

export async function listServerArtifacts(): Promise<ServerLibraryArtifact[]> {
  const page = await apiFetch<{ items: ServerLibraryArtifact[] }>(`${API_ROOT}/library/artifacts`)
  return page.items
}

export async function getServerArtifact(artifactId: string): Promise<ServerLibraryArtifact> {
  return apiFetch<ServerLibraryArtifact>(
    `${API_ROOT}/library/artifacts/${encodeURIComponent(artifactId)}`,
  )
}

export async function listServerArtifactVersions(
  artifactId: string,
): Promise<ServerLibraryArtifactVersion[]> {
  const page = await apiFetch<{ items: ServerLibraryArtifactVersion[] }>(
    `${API_ROOT}/library/artifacts/${encodeURIComponent(artifactId)}/versions`,
  )
  return page.items
}

export async function createServerArtifact(input: {
  title: string
  kind: LibraryArtifactKind
  markdown: string
  provenance?: LibraryProvenance
  generatedBy?: LibraryGeneratedBy | null
  taskId?: string | null
  sourceConversationId?: string | null
  sourceMessageId?: string | null
}): Promise<ServerLibraryArtifact> {
  return apiFetch<ServerLibraryArtifact>(`${API_ROOT}/library/artifacts`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function patchServerArtifact(
  artifactId: string,
  input: { title?: string; markdown?: string },
): Promise<ServerLibraryArtifact> {
  return apiFetch<ServerLibraryArtifact>(
    `${API_ROOT}/library/artifacts/${encodeURIComponent(artifactId)}`,
    { method: 'PATCH', body: JSON.stringify(input) },
  )
}

export async function deleteServerArtifact(artifactId: string): Promise<void> {
  await apiFetch<void>(`${API_ROOT}/library/artifacts/${encodeURIComponent(artifactId)}`, {
    method: 'DELETE',
  })
}

export async function serverCanonicalSave(input: {
  title: string
  kind: LibraryArtifactKind
  markdown: string
  provenance?: LibraryProvenance
  generatedBy?: LibraryGeneratedBy | null
  taskId: string | null
  sourceConversationId: string | null
  sourceMessageId: string | null
  linkedArtifactId: string | null
}): Promise<ServerCanonicalSaveResult> {
  return apiFetch<ServerCanonicalSaveResult>(`${API_ROOT}/library/canonical-save`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
