import { useState } from 'react'
import { Copy, Download, X } from 'lucide-react'
import { useAppStore } from '@/state/store'
import { Button } from '@/components/ui/Button'
import { Segmented } from '@/components/ui/Segmented'
import { Badge } from '@/components/ui/Tooltip'
import { downloadText } from '@/features/chat/exportUtils'
import { CANVAS_CODE, CANVAS_DOCUMENT } from '@/services/mock/previewFixtures'

/**
 * Canvas preview: an editable local document and code fixture in a side
 * panel. No execution, no sync — edits live for the session only.
 */
export function CanvasPreview({ brief }: { brief?: string }) {
  const closePreview = useAppStore((state) => state.closePreview)
  const [tab, setTab] = useState<'document' | 'code'>('document')
  const [document, setDocument] = useState(
    brief?.trim() ? `${brief.trim()}\n\n---\n\n${CANVAS_DOCUMENT}` : CANVAS_DOCUMENT,
  )
  const [code, setCode] = useState(CANVAS_CODE)

  const activeText = tab === 'document' ? document : code
  const words = activeText.trim() ? activeText.trim().split(/\s+/).length : 0

  async function copy() {
    try {
      await navigator.clipboard.writeText(activeText)
      useAppStore.getState().showToast('Canvas content copied')
    } catch {
      useAppStore.getState().showToast('Clipboard unavailable in this browser')
    }
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-scrim" onClick={closePreview} aria-hidden="true" />
      <section
        role="dialog"
        aria-label="Canvas panel"
        className="absolute inset-y-0 right-0 flex w-[min(30rem,100vw)] flex-col border-l border-line bg-canvas shadow-raised"
      >
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <h2 className="flex-1 text-sm font-semibold text-ink">Canvas</h2>
          <Badge tone="warning">Session-only edits</Badge>
          <button
            type="button"
            aria-label="Close canvas"
            onClick={closePreview}
            className="rounded-[10px] p-1.5 text-ink-soft transition-colors hover:bg-subtle hover:text-ink"
          >
            <X size={16} />
          </button>
        </header>

        <div className="border-b border-line px-4 py-2.5">
          <Segmented
            ariaLabel="Canvas tab"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'document', label: 'Document' },
              { value: 'code', label: 'Code' },
            ]}
          />
        </div>

        <div className="min-h-0 flex-1 p-4">
          <label htmlFor="canvas-editor" className="sr-only">
            {tab === 'document' ? 'Canvas document' : 'Canvas code fixture'}
          </label>
          <textarea
            id="canvas-editor"
            value={activeText}
            onChange={(event) =>
              tab === 'document' ? setDocument(event.target.value) : setCode(event.target.value)
            }
            spellCheck={tab === 'document'}
            className={`h-full w-full resize-none rounded-xl border border-line bg-raised p-4 text-sm leading-relaxed text-ink focus:border-accent focus:outline-none ${
              tab === 'code' ? 'font-mono text-[13px]' : ''
            }`}
          />
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
          <p className="text-xs text-ink-faint">
            {words} words · no execution, no sync
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => void copy()}>
              <Copy size={13} />
              Copy
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                downloadText(
                  tab === 'document' ? 'universe-canvas.md' : 'universe-canvas.ts',
                  activeText,
                  tab === 'document' ? 'text/markdown' : 'text/plain',
                )
              }
            >
              <Download size={13} />
              Download
            </Button>
          </div>
        </footer>
      </section>
    </div>
  )
}
