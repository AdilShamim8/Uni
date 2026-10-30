import { useMemo, useRef, useState } from 'react'
import { BookOpen, FileUp, Search, Trash2 } from 'lucide-react'
import { useKnowledgeStore } from '@/state/knowledgeStore'
import { useAppStore } from '@/state/store'
import { KNOWLEDGE_DOC_CHAR_LIMIT, type KnowledgeHit } from '@/domain/knowledgeBase'
import { readFileText } from '@/services/readFileText'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/TextField'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Dialog } from '@/components/ui/Dialog'

/**
 * Knowledge base — the Library's retrieval collection (K1). Documents are
 * pasted text or text files, chunked on ingest, and searchable locally.
 * The section includes an honest retrieval tester so users can see exactly
 * how the keyword search behaves before wiring it into a chat.
 */

const TEXT_FILE_SUFFIXES = ['.md', '.markdown', '.txt', '.text', '.csv', '.json']

function isTextFile(file: File): boolean {
  const lower = file.name.toLowerCase()
  return TEXT_FILE_SUFFIXES.some((suffix) => lower.endsWith(suffix))
}

export function KnowledgeSection() {
  const documents = useKnowledgeStore((state) => state.documents)
  const [addOpen, setAddOpen] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const ordered = useMemo(
    () => Object.values(documents).sort((a, b) => b.createdAt - a.createdAt),
    [documents],
  )

  const deleteTarget = deleteId ? documents[deleteId] : undefined

  return (
    <section className="mt-10" aria-label="Knowledge base">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold text-ink-faint">Knowledge base</h3>
          <p className="mt-0.5 text-xs text-ink-soft">
            Documents chats can retrieve from — local keyword search, cited excerpts, nothing
            leaves this device.
          </p>
        </div>
        <Button variant="secondary" onClick={() => setAddOpen(true)}>
          <FileUp size={15} />
          Add knowledge
        </Button>
      </div>

      {ordered.length === 0 ? (
        <div className="mt-3 rounded-group border border-line bg-raised px-4 py-6 text-center">
          <BookOpen size={22} className="mx-auto text-ink-faint" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-ink">No knowledge yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm leading-relaxed text-ink-soft">
            Add pasted notes or text files (.md, .txt). In Chat, attach the knowledge base from
            the Context panel and your messages retrieve labeled excerpts from these documents.
          </p>
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {ordered.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center gap-3 rounded-group border border-line bg-raised px-4 py-3 transition-colors hover:bg-subtle"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-subtle text-ink-faint">
                <BookOpen size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{doc.title}</p>
                <p className="mt-0.5 truncate text-xs text-ink-faint">
                  {doc.source === 'file' && doc.fileName ? doc.fileName : 'Pasted text'}
                  {` · ${doc.chunkCount} chunk${doc.chunkCount === 1 ? '' : 's'} · ${doc.charCount.toLocaleString()} chars`}
                </p>
              </div>
              <button
                type="button"
                aria-label={`Delete knowledge document ${doc.title}`}
                onClick={() => setDeleteId(doc.id)}
                className="min-touch rounded-control p-1.5 text-ink-faint transition-colors hover:text-danger"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <RetrievalTester />

      <AddKnowledgeDialog open={addOpen} onClose={() => setAddOpen(false)} />

      <ConfirmDialog
        open={deleteId !== null}
        onClose={() => setDeleteId(null)}
        title="Delete knowledge document?"
        body={
          deleteTarget
            ? `“${deleteTarget.title}” will be removed from this device. Chats that retrieve the knowledge base simply find less — nothing else changes.`
            : ''
        }
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteId) useKnowledgeStore.getState().deleteDocument(deleteId)
          setDeleteId(null)
        }}
      />
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Add dialog                                                          */
/* ------------------------------------------------------------------ */

function AddKnowledgeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const showToast = useAppStore((state) => state.showToast)
  const [title, setTitle] = useState('')
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Reset the draft when the dialog closes (render-phase reset, the
  // same pattern as RenameDialog — no effect-induced cascading renders).
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (!open) {
      setTitle('')
      setText('')
      setFileName(null)
      setError(null)
    }
  }

  const close = () => {
    if (fileInput.current) fileInput.current.value = ''
    onClose()
  }

  const onFilePicked = async (file: File | undefined) => {
    if (!file) return
    if (!isTextFile(file)) {
      setError(
        `“${file.name}” is not a plain-text file. Knowledge ingest reads .md, .txt, .csv, and .json — PDFs and Word files are not extracted (yet, and honestly so).`,
      )
      return
    }
    try {
      const content = await readFileText(file)
      setText(content)
      setFileName(file.name)
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ''))
      setError(null)
    } catch {
      setError(`“${file.name}” could not be read.`)
    }
  }

  const submit = () => {
    const result = useKnowledgeStore.getState().addDocument({
      title,
      text,
      source: fileName ? 'file' : 'paste',
      fileName,
    })
    if (!result.ok) {
      setError(result.error)
      return
    }
    showToast(fileName ? `Added “${fileInput.current?.files?.[0]?.name ?? title}” to the knowledge base` : 'Added to the knowledge base')
    close()
  }

  const overLimit = text.length > KNOWLEDGE_DOC_CHAR_LIMIT

  return (
    <Dialog
      open={open}
      onClose={close}
      title="Add knowledge"
      description={`Plain text or markdown, up to ${KNOWLEDGE_DOC_CHAR_LIMIT.toLocaleString()} characters per document. Larger texts should be split into several documents.`}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" disabled={text.trim().length === 0 || overLimit} onClick={submit}>
            Add to knowledge base
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3.5">
        <TextField
          label="Title (optional — defaults to the file name or first heading)"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
        <div>
          <label
            className="flex flex-col gap-1.5 text-sm font-medium text-ink"
            htmlFor="knowledge-text-input"
          >
            Text
          </label>
          <textarea
            id="knowledge-text-input"
            value={text}
            onChange={(event) => setText(event.target.value)}
            rows={9}
            className="mt-1.5 w-full resize-y rounded-control border border-line bg-raised p-3 text-sm font-normal leading-relaxed text-ink focus:border-accent focus:outline-none"
            placeholder="Paste notes, docs, manuals… or load a text file below."
          />
          <p
            className={`mt-1 text-[11.5px] ${overLimit ? 'font-medium text-danger' : 'text-ink-faint'}`}
          >
            {text.length.toLocaleString()} / {KNOWLEDGE_DOC_CHAR_LIMIT.toLocaleString()} characters
            {fileName ? ` · loaded from ${fileName}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={TEXT_FILE_SUFFIXES.join(',')}
            className="hidden"
            onChange={(event) => void onFilePicked(event.target.files?.[0])}
          />
          <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
            <FileUp size={14} />
            Load a text file
          </Button>
          <span className="text-[11.5px] text-ink-faint">.md, .markdown, .txt, .text, .csv, .json</span>
        </div>
        {error && (
          <p role="alert" className="rounded-control bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Retrieval tester                                                    */
/* ------------------------------------------------------------------ */

function RetrievalTester() {
  const [query, setQuery] = useState('')
  const documentCount = useKnowledgeStore((state) => Object.keys(state.documents).length)
  const search = useKnowledgeStore((state) => state.search)

  const hits: KnowledgeHit[] = useMemo(
    () => (query.trim() ? search(query, { limit: 3 }) : []),
    [query, search],
  )
  const searched = query.trim().length > 0

  return (
    <div className="mt-4 rounded-group border border-line bg-raised px-4 py-3.5">
      <div className="flex items-center gap-2">
        <Search size={14} className="shrink-0 text-ink-faint" aria-hidden="true" />
        <input
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Test retrieval — try words from your documents"
          aria-label="Test knowledge retrieval"
          className="min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none"
        />
      </div>
      {searched && (
        <div className="mt-2.5" aria-live="polite">
          <p className="text-[11.5px] text-ink-faint">
            {documentCount === 0
              ? 'The knowledge base is empty — add a document first.'
              : hits.length === 0
                ? 'No matches — retrieval is keyword-based, so try the exact words used in the document.'
                : `Top ${hits.length} of at most 3 shown — same search chats use, capped per document.`}
          </p>
          {hits.length > 0 && (
            <ul className="mt-2 flex flex-col gap-2">
              {hits.map((hit) => (
                <li key={hit.chunkId} className="rounded-control border border-line bg-subtle px-3 py-2">
                  <p className="text-[12px] font-medium text-ink">
                    {hit.heading ? `${hit.docTitle} — ${hit.heading}` : hit.docTitle}
                  </p>
                  <p className="mt-0.5 line-clamp-3 text-[12px] leading-relaxed text-ink-soft">
                    {hit.snippet}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
