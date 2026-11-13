import { API_ROOT, apiFetch } from './client'

/**
 * Server files & knowledge client (P10). Types mirror @uni/contracts
 * files DTOs — local mirrors, no package dependency, like every other
 * server client.
 */

export type FileExtractionStatus = 'pending' | 'extracted' | 'unsupported' | 'failed'

export interface ServerFileDocument {
  id: string
  title: string
  fileName: string
  sizeBytes: number
  extension: string
  mimeType: string
  extraction: FileExtractionStatus
  extractedText: string
  extractionError: string | null
  charCount: number
  createdAt: number
  updatedAt: number
}

export interface ServerRetrievalHit {
  documentId: string
  title: string
  excerpt: string
  score: number
}

export async function listServerFiles(): Promise<ServerFileDocument[]> {
  const body = await apiFetch<{ items: ServerFileDocument[] }>(`${API_ROOT}/files`)
  return Array.isArray(body.items) ? body.items : []
}

export async function createServerFile(input: {
  title: string
  fileName: string
  content: string
}): Promise<ServerFileDocument> {
  return apiFetch<ServerFileDocument>(`${API_ROOT}/files`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function deleteServerFile(documentId: string): Promise<void> {
  await apiFetch<unknown>(`${API_ROOT}/files/${encodeURIComponent(documentId)}`, {
    method: 'DELETE',
  })
}

export async function retrieveServerKnowledge(
  query: string,
  limit = 8,
): Promise<ServerRetrievalHit[]> {
  const body = await apiFetch<{ hits: ServerRetrievalHit[] }>(`${API_ROOT}/files/retrieve`, {
    method: 'POST',
    body: JSON.stringify({ query, limit }),
  })
  return Array.isArray(body.hits) ? body.hits : []
}
