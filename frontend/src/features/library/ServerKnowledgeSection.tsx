import { useEffect, useRef, useState } from 'react'
import { FileText, Search, Trash2, Upload } from 'lucide-react'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerFileDocument, ServerRetrievalHit } from '@/services/api/serverFiles'
import { Button } from '@/components/ui/Button'

/**
 * P10 — server knowledge on the Library page: text documents with
 * honest extraction (plain-text formats only; anything else is refused
 * with the real reason), a searchable lexical index over what actually
 * extracted, and excerpts cut from the document text — never invented.
 */

const TEXT_EXTENSIONS = /\.(txt|md|markdown|csv|tsv|json|log)$/i

export function ServerKnowledgeSection() {
  const status = useServerSessionStore((state) => state.status)
  const [documents, setDocuments] = useState<ServerFileDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ServerRetrievalHit[] | null>(null)
  const [searching, setSearching] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (status !== 'signed-in') return
    void (async () => {
      setLoading(true)
      try {
        const { listServerFiles } = await import('@/services/api/serverFiles')
        setDocuments(await listServerFiles())
        setError(null)
      } catch {
        setError('Could not load the server knowledge list.')
      } finally {
        setLoading(false)
      }
    })()
  }, [status])

  if (status !== 'signed-in') return null

  async function ingest(title: string, fileName: string, content: string): Promise<boolean> {
    try {
      const { createServerFile } = await import('@/services/api/serverFiles')
      const created = await createServerFile({ title, fileName, content })
      setDocuments((current) => [created, ...current])
      setError(null)
      return true
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed.')
      return false
    }
  }

  async function handleFiles(files: FileList | null): Promise<void> {
    if (!files) return
    for (const file of Array.from(files)) {
      if (!TEXT_EXTENSIONS.test(file.name)) {
        setError(
          `"${file.name}" is not a plain-text format yet — txt, md, csv, tsv, json and log work today.`,
        )
        continue
      }
      const content = await file.text()
      await ingest(file.name.replace(TEXT_EXTENSIONS, '') || file.name, file.name, content)
    }
  }

  async function handleDelete(documentId: string): Promise<void> {
    try {
      const { deleteServerFile } = await import('@/services/api/serverFiles')
      await deleteServerFile(documentId)
      setDocuments((current) => current.filter((entry) => entry.id !== documentId))
      if (hits) setHits(hits.filter((hit) => hit.documentId !== documentId))
    } catch {
      setError('Delete failed — try again.')
    }
  }

  async function handleSearch(): Promise<void> {
    const trimmed = query.trim()
    if (!trimmed || searching) return
    setSearching(true)
    try {
      const { retrieveServerKnowledge } = await import('@/services/api/serverFiles')
      setHits(await retrieveServerKnowledge(trimmed))
    } catch {
      setError('Search failed — try again.')
    } finally {
      setSearching(false)
    }
  }

  return (
    <section aria-label="Server knowledge" className="mb-8">
      <div className="mb-2 flex items-center gap-2">
        <FileText size={15} className="text-ink-faint" aria-hidden="true" />
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">
          Knowledge on this account
        </h2>
        <span className="text-xs text-ink-faint">
          {loading ? 'loading…' : `${documents.length} documents indexed`}
        </span>
      </div>
      <p className="mb-3 text-[12.5px] leading-relaxed text-ink-soft">
        Plain-text documents your server chats can search and cite. Everything is
        workspace-scoped; local notes and projects below stay in this browser.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
          <Upload size={14} />
          Add text file
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".txt,.md,.markdown,.csv,.tsv,.json,.log"
          multiple
          className="hidden"
          onChange={(event) => {
            void handleFiles(event.target.files)
            event.target.value = ''
          }}
        />
        <form
          className="flex min-w-0 flex-1 items-center gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            void handleSearch()
          }}
        >
          <div className="relative min-w-0 flex-1">
            <Search
              size={14}
              aria-hidden="true"
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the knowledge…"
              aria-label="Search server knowledge"
              className="w-full rounded-control border border-line bg-panel py-1.5 pl-8 pr-2.5 text-[13px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
            />
          </div>
          <Button type="submit" variant="ghost" size="sm" disabled={!query.trim() || searching}>
            {searching ? 'Searching…' : 'Search'}
          </Button>
        </form>
      </div>

      {error && (
        <p role="alert" className="mt-2 rounded-control bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
          {error}
        </p>
      )}

      {hits !== null && (
        <div className="mt-3">
          <p className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
            {hits.length === 0 ? 'No matches' : `${hits.length} match${hits.length === 1 ? '' : 'es'}`}
          </p>
          <ul className="flex flex-col gap-1.5" aria-label="Retrieval results">
            {hits.map((hit) => (
              <li key={hit.documentId} className="rounded-group border border-line bg-panel px-3 py-2">
                <p className="text-[13px] font-medium text-ink">{hit.title}</p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-soft">…{hit.excerpt}…</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="mt-3 flex flex-col gap-1.5" aria-label="Server documents">
        {documents.map((document) => (
          <li
            key={document.id}
            className="flex items-center gap-3 rounded-group border border-line bg-panel px-3.5 py-2.5"
          >
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent"
            >
              <FileText size={15} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-medium text-ink">
                {document.title}
              </span>
              <span className="block truncate text-[12.5px] text-ink-faint">
                {document.fileName} · {document.charCount.toLocaleString()} chars ·{' '}
                {document.extraction === 'extracted' ? 'indexed' : document.extraction}
              </span>
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:bg-danger-soft"
              onClick={() => void handleDelete(document.id)}
              aria-label={`Delete ${document.title}`}
            >
              <Trash2 size={13} />
            </Button>
          </li>
        ))}
      </ul>

      {!loading && documents.length === 0 && (
        <p className="mt-3 text-[12.5px] text-ink-faint">
          Nothing indexed yet — add a text file and search it from your server chats.
        </p>
      )}
    </section>
  )
}
