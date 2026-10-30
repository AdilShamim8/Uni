/**
 * Knowledge base domain — the local, offline retrieval layer (K1/K2).
 *
 * Honesty rules (same spirit as the rest of Uni):
 * - Retrieval is *lexical* (keyword matching with BM25-style scoring), runs
 *   entirely on-device, and never sends knowledge content anywhere except
 *   into an explicit, user-initiated send.
 * - No silent retrieval: every hit is labeled with its document and
 *   heading, and the context block says how the excerpts were chosen.
 * - Limits are explicit and enforced before anything is stored: documents
 *   that exceed the per-document cap are rejected, never silently cut.
 * - v1 ingests plain text and markdown only. No PDF/OCR extraction is
 *   claimed or performed.
 */

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type KnowledgeSource = 'paste' | 'file'

/** A document in the knowledge base. Content lives in its chunks. */
export interface KnowledgeDocument {
  id: string
  title: string
  /** How the text arrived — typed/pasted, or loaded from a text file. */
  source: KnowledgeSource
  /** File name for `file` sources; null otherwise. */
  fileName: string | null
  createdAt: number
  updatedAt: number
  /** Honest bookkeeping, computed once at ingest. */
  charCount: number
  chunkCount: number
}

/** One retrievable slice of a document. */
export interface KnowledgeChunk {
  id: string
  docId: string
  /** 0-based position within the document. */
  ordinal: number
  /** Nearest markdown heading (## level or shallower); '' when none. */
  heading: string
  text: string
}

/** A retrieval result, ready for display or context assembly. */
export interface KnowledgeHit {
  chunkId: string
  docId: string
  docTitle: string
  heading: string
  /** Retrieval score — only used for ordering and display, never sent. */
  score: number
  /** Short excerpt around the best match (with ellipses when cut). */
  snippet: string
}

/* ------------------------------------------------------------------ */
/* Limits                                                              */
/* ------------------------------------------------------------------ */

/** Per-document character cap — larger input is rejected, not truncated. */
export const KNOWLEDGE_DOC_CHAR_LIMIT = 400_000
/** Target chunk size (characters) before splitting a long section. */
export const KNOWLEDGE_CHUNK_TARGET = 1400
/** Character overlap between consecutive windows of one long section. */
export const KNOWLEDGE_CHUNK_OVERLAP = 160
/** Hard cap on chunks per document (≈ the limit at default sizes). */
export const KNOWLEDGE_MAX_CHUNKS_PER_DOC = 400
/** Heading levels that start a new section (#, ##, ###). */
const HEADING_LEVEL = /^#{1,3}\s+/

/* ------------------------------------------------------------------ */
/* Chunking                                                            */
/* ------------------------------------------------------------------ */

interface Section {
  heading: string
  text: string
}

/** Split markdown into (heading, text) sections. Heading-less text that
 *  precedes the first heading becomes its own section. */
function splitSections(normalized: string): Section[] {
  const lines = normalized.split('\n')
  const sections: Section[] = []
  let heading = ''
  let buffer: string[] = []

  const flush = () => {
    const text = buffer.join('\n').trim()
    if (text) sections.push({ heading, text })
    buffer = []
  }

  for (const line of lines) {
    const match = line.match(HEADING_LEVEL)
    if (match) {
      flush()
      heading = line.replace(HEADING_LEVEL, '').trim().slice(0, 120)
    } else {
      buffer.push(line)
    }
  }
  flush()
  return sections
}

/** Sliding-window split of one over-long section, with overlap. */
function windowSection(text: string): string[] {
  if (text.length <= KNOWLEDGE_CHUNK_TARGET) return [text]
  const windows: string[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + KNOWLEDGE_CHUNK_TARGET, text.length)
    if (end < text.length) {
      // Prefer cutting on whitespace so words stay whole.
      const cut = text.lastIndexOf(' ', end)
      if (cut > start + KNOWLEDGE_CHUNK_TARGET * 0.5) end = cut
    }
    windows.push(text.slice(start, end).trim())
    if (end >= text.length) break
    start = Math.max(end - KNOWLEDGE_CHUNK_OVERLAP, start + 1)
  }
  return windows.filter((window) => window.length > 0)
}

export interface ChunkResult {
  chunks: KnowledgeChunk[]
  /** True when the doc hit the chunk cap — surfaced honestly, never silent. */
  capped: boolean
}

/**
 * Chunk a document for retrieval. Heading-aware: every #/##/### section
 * becomes its own chunk (split further with overlap when oversized), so a
 * hit always carries the heading it lives under.
 */
export function chunkDocument(docId: string, text: string): ChunkResult {
  // Normalize line endings once; everything downstream sees \n.
  const normalized = text.replace(/\r\n?/g, '\n')
  const sections = splitSections(normalized)
  if (sections.length === 0) return { chunks: [], capped: false }

  const chunks: KnowledgeChunk[] = []
  let capped = false
  for (const section of sections) {
    for (const window of windowSection(section.text)) {
      if (chunks.length >= KNOWLEDGE_MAX_CHUNKS_PER_DOC) {
        capped = true
        break
      }
      chunks.push({
        id: `${docId}:${chunks.length}`,
        docId,
        ordinal: chunks.length,
        heading: section.heading,
        text: window,
      })
    }
    if (capped) break
  }
  return { chunks, capped }
}

/* ------------------------------------------------------------------ */
/* Tokenizer                                                           */
/* ------------------------------------------------------------------ */

/** A deliberately small English stopword list — honest about being
 *  English-only; every other token passes through. */
const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for', 'if',
  'in', 'into', 'is', 'it', 'no', 'not', 'of', 'on', 'or', 'such', 'that',
  'the', 'their', 'then', 'there', 'these', 'they', 'this', 'to', 'was',
  'will', 'with', 'what', 'when', 'where', 'which', 'who', 'why', 'how',
  'do', 'does', 'did', 'can', 'could', 'should', 'would', 'i', 'you',
  'your', 'my', 'me', 'we', 'our', 'us',
])

/**
 * Tokenize for search: lowercase runs of Unicode letters/digits, minus
 * stopwords and single characters. Deterministic on every platform that
 * supports Unicode property escapes.
 */
export function tokenizeForSearch(text: string): string[] {
  const tokens: string[] = []
  for (const match of text.toLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    const token = match[0]
    if (token.length >= 2 && !STOPWORDS.has(token)) tokens.push(token)
  }
  return tokens
}
