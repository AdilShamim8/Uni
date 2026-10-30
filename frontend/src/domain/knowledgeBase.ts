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

/* ------------------------------------------------------------------ */
/* Index + search                                                      */
/* ------------------------------------------------------------------ */

export interface KnowledgeIndex {
  /** Chunk metadata + text keyed by chunk id. */
  chunks: Map<string, KnowledgeChunk>
  /** Document titles keyed by doc id (for citations). */
  docTitles: Map<string, string>
  /** term -> set of chunk ids containing it. */
  postings: Map<string, Set<string>>
  /** chunk id -> term frequencies. */
  termFreq: Map<string, Map<string, number>>
  /** chunk id -> token count. */
  lengths: Map<string, number>
}

/** Build the retrieval index from documents' chunks. Pure and reusable. */
export function buildKnowledgeIndex(
  documents: Pick<KnowledgeDocument, 'id' | 'title'>[],
  chunksByDoc: Record<string, KnowledgeChunk[]>,
): KnowledgeIndex {
  const index: KnowledgeIndex = {
    chunks: new Map(),
    docTitles: new Map(),
    postings: new Map(),
    termFreq: new Map(),
    lengths: new Map(),
  }
  for (const doc of documents) index.docTitles.set(doc.id, doc.title)
  for (const docChunks of Object.values(chunksByDoc)) {
    for (const chunk of docChunks) {
      index.chunks.set(chunk.id, chunk)
      const tokens = tokenizeForSearch(chunk.text)
      const counts = new Map<string, number>()
      for (const token of tokens) {
        counts.set(token, (counts.get(token) ?? 0) + 1)
        let set = index.postings.get(token)
        if (!set) {
          set = new Set()
          index.postings.set(token, set)
        }
        set.add(chunk.id)
      }
      index.termFreq.set(chunk.id, counts)
      index.lengths.set(chunk.id, tokens.length)
    }
  }
  return index
}

export interface SearchOptions {
  /** Maximum hits returned (default 6). */
  limit?: number
  /** Maximum hits per document (default 3) — one doc cannot flood results. */
  perDocLimit?: number
}

const SNIPPET_TARGET = 260

/** Build a short excerpt around the first occurrence of a query token. */
function buildSnippet(text: string, tokens: string[]): string {
  const lower = text.toLowerCase()
  let at = -1
  for (const token of tokens) {
    const found = lower.indexOf(token)
    if (found !== -1 && (at === -1 || found < at)) at = found
  }
  if (at === -1) {
    return text.length <= SNIPPET_TARGET ? text : `${text.slice(0, SNIPPET_TARGET)}…`
  }
  const start = Math.max(0, at - Math.floor(SNIPPET_TARGET / 3))
  const end = Math.min(text.length, start + SNIPPET_TARGET)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}

/**
 * Search the index with BM25-style lexical scoring plus an exact-phrase
 * bonus and a heading-match boost. Empty query tokens → no hits (honest:
 * nothing matches "the of and").
 */
export function searchKnowledge(
  index: KnowledgeIndex,
  query: string,
  options: SearchOptions = {},
): KnowledgeHit[] {
  const limit = options.limit ?? 6
  const perDocLimit = options.perDocLimit ?? 3
  const tokens = tokenizeForSearch(query)
  if (tokens.length === 0 || index.chunks.size === 0) return []

  const total = index.chunks.size
  const avgLength =
    [...index.lengths.values()].reduce((sum, n) => sum + n, 0) / Math.max(1, total)

  // BM25 constants (calibrated for short chunks).
  const k1 = 1.4
  const b = 0.6

  const scores = new Map<string, number>()
  for (const token of new Set(tokens)) {
    const posting = index.postings.get(token)
    if (!posting) continue
    const df = posting.size
    const idf = Math.log(1 + (total - df + 0.5) / (df + 0.5))
    for (const chunkId of posting) {
      const tf = index.termFreq.get(chunkId)?.get(token) ?? 0
      const length = index.lengths.get(chunkId) ?? 1
      const denominator = tf + k1 * (1 - b + (b * length) / Math.max(1, avgLength))
      const score = idf * ((tf * (k1 + 1)) / Math.max(denominator, 1e-6))
      scores.set(chunkId, (scores.get(chunkId) ?? 0) + score)
    }
  }

  // Exact-phrase bonus: the whole query (normalized) appearing verbatim is
  // strong evidence — worth an extra weighted term.
  const phrase = query.trim().toLowerCase()
  if (phrase.length >= 4) {
    for (const [chunkId, chunk] of index.chunks) {
      if (chunk.text.toLowerCase().includes(phrase)) {
        scores.set(chunkId, (scores.get(chunkId) ?? 0) + 2.5)
      }
    }
  }

  // Heading boost: a query token in the heading means the section is about it.
  for (const [chunkId, chunk] of index.chunks) {
    if (!chunk.heading) continue
    const headingTokens = new Set(tokenizeForSearch(chunk.heading))
    if (tokens.some((token) => headingTokens.has(token))) {
      scores.set(chunkId, (scores.get(chunkId) ?? 0) * 1.25)
    }
  }

  const perDoc = new Map<string, number>()
  return [...scores.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b2) => b2[1] - a[1] || a[0].localeCompare(b2[0]))
    .flatMap(([chunkId, score]) => {
      const chunk = index.chunks.get(chunkId)
      if (!chunk) return []
      const used = perDoc.get(chunk.docId) ?? 0
      if (used >= perDocLimit) return []
      perDoc.set(chunk.docId, used + 1)
      return [
        {
          chunkId,
          docId: chunk.docId,
          docTitle: index.docTitles.get(chunk.docId) ?? 'Untitled document',
          heading: chunk.heading,
          score,
          snippet: buildSnippet(chunk.text, tokens),
        },
      ]
    })
    .slice(0, limit)
}

/* ------------------------------------------------------------------ */
/* Context assembly                                                    */
/* ------------------------------------------------------------------ */

/**
 * Turn hits into the labeled plain-text block appended to the system
 * prompt on a live send. The header states the retrieval method so the
 * model (and the user reading the inspector) knows how excerpts were
 * chosen — no silent injection.
 */
export function buildKnowledgeContextBlock(hits: KnowledgeHit[]): string {
  if (hits.length === 0) return ''
  const sections = hits.map((hit, i) => {
    const where = hit.heading
      ? `From “${hit.docTitle}” — ${hit.heading}`
      : `From “${hit.docTitle}”`
    return `[${i + 1}] ${where}\n\n${hit.snippet}`
  })
  return [
    'Knowledge base excerpts (retrieved locally on this device by keyword match against your message — check the citations; excerpts may be partial):',
    '',
    sections.join('\n\n'),
  ].join('\n')
}
