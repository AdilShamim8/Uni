import { useEffect, useState } from 'react'
import { FileText, Library as LibraryIcon } from 'lucide-react'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerLibraryArtifact } from '@/services/api/serverLibrary'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'

/**
 * Phase C2 — the server Library section on the Library page. When the
 * session is signed in, artifacts saved through the server canonical-
 * save path (T017) are listed with their immutable version counts.
 *
 * Read-only by design in this slice: server artifacts are owned by the
 * server's canonical-save operation; local notes and projects below are
 * untouched (writes never split between stores). Viewing shows the
 * artifact's current content with its provenance.
 */
export function ServerArtifactsSection() {
  const status = useServerSessionStore((state) => state.status)
  const serverArtifacts = useServerSessionStore((state) => state.serverArtifacts)
  const serverArtifactsLoading = useServerSessionStore((state) => state.serverArtifactsLoading)
  const loadServerArtifacts = useServerSessionStore((state) => state.loadServerArtifacts)
  const [preview, setPreview] = useState<ServerLibraryArtifact | null>(null)

  useEffect(() => {
    if (status === 'signed-in') void loadServerArtifacts()
  }, [status, loadServerArtifacts])

  if (status !== 'signed-in') return null

  return (
    <section
      aria-label="Server artifacts on this account"
      className="mb-8"
    >
      <div className="mb-2 flex items-center gap-2">
        <LibraryIcon size={15} className="text-ink-faint" aria-hidden="true" />
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">
          On this account
        </h2>
        <span className="text-xs text-ink-faint">
          {serverArtifactsLoading ? 'loading…' : `${serverArtifacts.length} saved on the server`}
        </span>
      </div>

      {!serverArtifactsLoading && serverArtifacts.length === 0 && (
        <p className="rounded-group border border-line bg-panel px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
          Nothing saved on the server yet. Saving a reply or Work output while signed in
          mirrors it here with immutable versions — the local copy always stays yours.
        </p>
      )}

      {serverArtifacts.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {serverArtifacts.map((artifact) => (
            <li key={artifact.id}>
              <button
                type="button"
                onClick={() => setPreview(artifact)}
                className="flex min-touch w-full items-center gap-3 rounded-group border border-line bg-panel px-3.5 py-2.5 text-left transition-colors hover:bg-subtle"
              >
                <span
                  aria-hidden="true"
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent"
                >
                  <FileText size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-ink">
                    {artifact.title}
                  </span>
                  <span className="block truncate text-[12.5px] text-ink-faint">
                    {artifact.kind} · {artifact.versionCount}{' '}
                    {artifact.versionCount === 1 ? 'version' : 'versions'} ·{' '}
                    {artifact.provenance === 'provider-generated'
                      ? 'provider-generated'
                      : artifact.provenance === 'imported'
                        ? 'imported'
                        : 'demo-simulation'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-faint">
        Server artifacts keep provenance and every saved version on your Uni server. Local
        notes and projects below live only in this browser.
      </p>

      <Dialog
        open={preview !== null}
        onClose={() => setPreview(null)}
        title={preview?.title ?? 'Artifact'}
        size="lg"
        footer={
          <Button variant="ghost" onClick={() => setPreview(null)}>
            Close
          </Button>
        }
      >
        {preview && (
          <div className="flex flex-col gap-2">
            <p className="text-[12.5px] text-ink-faint">
              {preview.kind} · version {preview.versionCount} · updated{' '}
              {new Date(preview.updatedAt).toLocaleString()} · {preview.provenance}
              {preview.generatedBy ? ` · ${preview.generatedBy.modelId}` : ''}
            </p>
            <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap rounded-group bg-subtle px-3.5 py-3 text-[13px] leading-relaxed text-ink">
              {preview.markdown}
            </pre>
          </div>
        )}
      </Dialog>
    </section>
  )
}
