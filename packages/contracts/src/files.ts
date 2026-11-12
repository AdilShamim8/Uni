import { z } from 'zod'

/**
 * Files & knowledge contracts (P10, T034) — workspace-scoped documents
 * with extracted text, plus a bounded lexical retrieval endpoint the
 * chat/agent paths can cite. Extraction is deliberately conservative:
 * plain text formats only (txt/md/csv/json); anything else stores the
 * bytes with an honest 'unsupported' extraction status — never a fake
 * 'extracted' with empty text or a guessed parser.
 */

/* ------------------------------------------------------------------ */
/* Document                                                            */
/* ------------------------------------------------------------------ */

export const fileExtractionStatusSchema = z.enum([
  'pending',
  'extracted',
  'unsupported',
  'failed',
])
export type FileExtractionStatus = z.infer<typeof fileExtractionStatusSchema>

export const fileDocumentDtoSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(300),
  /** Original file name (display only; storage is id-keyed). */
  fileName: z.string().min(1).max(300),
  /** Honest size of the stored content in bytes. */
  sizeBytes: z.number().int().nonnegative().max(20 * 1024 * 1024),
  /** Lowercased extension without the dot. */
  extension: z.string().min(1).max(40),
  mimeType: z.string().min(1).max(150),
  extraction: fileExtractionStatusSchema,
  /** Extracted plain text (empty when not extracted). */
  extractedText: z.string().max(2_000_000),
  /** Human-readable reason when extraction failed. */
  extractionError: z.string().max(1_000).nullable(),
  /** Character count of the extracted text (never faked). */
  charCount: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
})
export type FileDocumentDto = z.infer<typeof fileDocumentDtoSchema>

export const createFileDocumentRequestSchema = z.object({
  title: z.string().trim().min(1).max(300),
  fileName: z.string().trim().min(1).max(300),
  /** Text content in utf-8; the server stores and counts it verbatim. */
  content: z.string().max(2_000_000),
})
export type CreateFileDocumentRequest = z.infer<typeof createFileDocumentRequestSchema>

/* ------------------------------------------------------------------ */
/* Retrieval                                                           */
/* ------------------------------------------------------------------ */

export const retrievalHitSchema = z.object({
  documentId: z.string().min(1),
  title: z.string().min(1),
  /** Bounded excerpt around the best match (never the whole file). */
  excerpt: z.string().max(600),
  /** Lexical score components — honest, not a similarity pretense. */
  score: z.number().int().nonnegative(),
})
export type RetrievalHit = z.infer<typeof retrievalHitSchema>

export const retrievalRequestSchema = z.object({
  query: z.string().trim().min(1).max(2_000),
  limit: z.number().int().min(1).max(20).default(8),
})
export type RetrievalRequest = z.infer<typeof retrievalRequestSchema>

export const retrievalResponseSchema = z.object({
  hits: z.array(retrievalHitSchema).max(20),
  /** The query actually searched (echoed for transparency). */
  query: z.string(),
})
export type RetrievalResponse = z.infer<typeof retrievalResponseSchema>
