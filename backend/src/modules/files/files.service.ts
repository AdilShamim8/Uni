import { randomUUID } from 'node:crypto'
import { and, desc, eq } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import * as schema from '../../db/schema.js'
import { fileDocuments } from '../../db/schema.js'
import {
  fileDocumentDtoSchema,
  type FileDocumentDto,
  type RetrievalHit,
} from '@uni/contracts'
import { badRequest, notFound } from '../../lib/errors.js'

/**
 * The files service (P10, T034/T036): workspace-scoped documents with
 * honest extraction, and a bounded lexical retrieval the chat/agent
 * paths can cite. No vector store, no embeddings — a deterministic
 * term-frequency search over extracted text, with excerpts cut around
 * the best window.
 *
 * Extraction policy (T034): plain-text formats are stored verbatim as
 * both content and extraction; anything else would be 'unsupported'
 * with its bytes intact — the create endpoint accepts text content
 * only for now, so every row here is 'extracted' or honestly failed.
 */

export type FilesDatabase = NodePgDatabase<typeof schema>

/** Formats whose bytes are plain text. */
const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'log',
])

export function isTextExtension(extension: string): boolean {
  return TEXT_EXTENSIONS.has(extension.toLowerCase())
}

function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  if (dot <= 0 || dot === fileName.length - 1) return ''
  return fileName.slice(dot + 1).toLowerCase()
}

function serialize(row: typeof fileDocuments.$inferSelect): FileDocumentDto {
  return fileDocumentDtoSchema.parse({
    id: row.id,
    title: row.title,
    fileName: row.fileName,
    sizeBytes: row.sizeBytes,
    extension: row.extension,
    mimeType: row.mimeType,
    extraction: row.extraction,
    extractedText: row.extractedText,
    extractionError: row.extractionError,
    charCount: row.charCount,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  })
}

export async function listFileDocuments(
  db: FilesDatabase,
  workspaceId: string,
): Promise<FileDocumentDto[]> {
  const rows = await db
    .select()
    .from(fileDocuments)
    .where(eq(fileDocuments.workspaceId, workspaceId))
    .orderBy(desc(fileDocuments.createdAt))
    .limit(200)
  return rows.map(serialize)
}

export async function getFileDocument(
  db: FilesDatabase,
  workspaceId: string,
  documentId: string,
): Promise<FileDocumentDto | null> {
  const rows = await db
    .select()
    .from(fileDocuments)
    .where(and(eq(fileDocuments.id, documentId), eq(fileDocuments.workspaceId, workspaceId)))
    .limit(1)
  return rows[0] ? serialize(rows[0]) : null
}

export async function createFileDocument(
  db: FilesDatabase,
  workspaceId: string,
  input: { title: string; fileName: string; content: string },
): Promise<FileDocumentDto> {
  const extension = extensionOf(input.fileName)
  if (extension === '') {
    throw badRequest('File name needs an extension (e.g. notes.md) so extraction can be honest.')
  }
  if (!isTextExtension(extension)) {
    // Text-only ingestion for now (T034): binary formats are refused up
    // front rather than stored with a fake 'extracted' status.
    throw badRequest(
      `.${extension} files are not supported yet — plain text formats only (txt, md, csv, tsv, json, log).`,
    )
  }
  if (input.content.length === 0) {
    throw badRequest('Empty files cannot be ingested — there would be nothing to retrieve.')
  }
  const row = await db
    .insert(fileDocuments)
    .values({
      id: randomUUID(),
      workspaceId,
      title: input.title,
      fileName: input.fileName,
      sizeBytes: Buffer.byteLength(input.content, 'utf8'),
      extension,
      mimeType: extension === 'json' ? 'application/json' : 'text/plain',
      extraction: 'extracted',
      extractedText: input.content,
      charCount: input.content.length,
    })
    .returning()
  const created = row[0]
  if (!created) throw new Error('File document insert returned no row.')
  return serialize(created)
}

export async function deleteFileDocument(
  db: FilesDatabase,
  workspaceId: string,
  documentId: string,
): Promise<boolean> {
  const removed = await db
    .delete(fileDocuments)
    .where(and(eq(fileDocuments.id, documentId), eq(fileDocuments.workspaceId, workspaceId)))
    .returning({ id: fileDocuments.id })
  return removed.length > 0
}

/* ------------------------------------------------------------------ */
/* Lexical retrieval (T036)                                            */
/* ------------------------------------------------------------------ */

const MAX_EXCERPT = 300

/** Deterministic tokenize-lowercase; no stemming, no stopwords. */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2)
}

function excerptAround(text: string, terms: string[], window = MAX_EXCERPT): string {
  const lower = text.toLowerCase()
  let bestIndex = 0
  let bestScore = -1
  const step = Math.max(1, Math.floor(text.length / 200))
  for (let index = 0; index < Math.max(1, text.length - window); index += step) {
    const slice = lower.slice(index, index + window)
    let score = 0
    for (const term of terms) {
      let from = 0
      for (;;) {
        const at = slice.indexOf(term, from)
        if (at === -1) break
        score += 1
        from = at + term.length
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  }
  const excerpt = text.slice(bestIndex, bestIndex + window).trim()
  return excerpt.length > 0 ? excerpt : text.slice(0, window).trim()
}

/**
 * Bounded lexical search across the workspace's EXTRACTED documents:
 * term-frequency scoring, honest excerpts, never a similarity
 * pretense. Documents that never extracted never match.
 */
export async function retrieveKnowledge(
  db: FilesDatabase,
  workspaceId: string,
  query: string,
  limit: number,
): Promise<RetrievalHit[]> {
  const terms = tokenize(query)
  if (terms.length === 0) return []

  const rows = await db
    .select({
      id: fileDocuments.id,
      title: fileDocuments.title,
      extractedText: fileDocuments.extractedText,
    })
    .from(fileDocuments)
    .where(
      and(
        eq(fileDocuments.workspaceId, workspaceId),
        eq(fileDocuments.extraction, 'extracted'),
      ),
    )
    .limit(500)

  const hits: RetrievalHit[] = []
  for (const row of rows) {
    const tokens = tokenize(row.extractedText)
    if (tokens.length === 0) continue
    const counts = new Map<string, number>()
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1)
    let score = 0
    let matched = false
    for (const term of terms) {
      const count = counts.get(term) ?? 0
      if (count > 0) matched = true
      score += count
    }
    if (!matched) continue
    hits.push({
      documentId: row.id,
      title: row.title,
      excerpt: excerptAround(row.extractedText, terms),
      score,
    })
  }
  hits.sort((a, b) => b.score - a.score)
  return hits.slice(0, limit)
}
