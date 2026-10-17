import { useMemo } from 'react'
import { Library as LibraryIcon } from 'lucide-react'
import { useLibraryStore } from '@/state/libraryStore'

/**
 * Library — the shared local artifact collection. One place for outputs
 * from Work and anything you save, with honest provenance labels.
 */
export function LibraryPage() {
  const artifacts = useLibraryStore((state) => state.artifacts)
  const projects = useLibraryStore((state) => state.projects)

  const ordered = useMemo(
    () => Object.values(artifacts).sort((a, b) => b.updatedAt - a.updatedAt),
    [artifacts],
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="material safe-left safe-right sticky top-0 z-30 flex h-13 shrink-0 items-center gap-2 border-b border-line bg-mat-header px-2 sm:px-4">
        <h1 className="flex items-center gap-2 text-sm font-semibold text-ink">
          <LibraryIcon size={16} className="text-ink-faint" />
          Library
        </h1>
        <span className="text-xs text-ink-faint">Local only</span>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-column px-3 py-6 sm:px-4">
          <h2 className="text-xl font-semibold tracking-tight text-ink">Artifacts</h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            Outputs and notes saved on this device. Nothing is synced anywhere.
          </p>

          {ordered.length === 0 ? (
            <div className="mt-8 rounded-group border border-line bg-raised px-6 py-10 text-center">
              <LibraryIcon size={28} className="mx-auto text-ink-faint" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-ink">Nothing saved yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-relaxed text-ink-soft">
                When you finish reviewing a Work task, its output can be saved here
                alongside your own notes.
              </p>
            </div>
          ) : (
            <ul className="mt-5 flex flex-col gap-2">
              {ordered.map((artifact) => (
                <li key={artifact.id}>
                  <div className="rounded-group border border-line bg-raised px-4 py-3">
                    <p className="truncate text-sm font-medium text-ink">{artifact.title}</p>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {artifact.kind} ·{' '}
                      {artifact.provenance === 'demo-simulation'
                        ? 'simulated output'
                        : 'written by you'}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {Object.keys(projects).length > 0 && (
            <section className="mt-8">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                Projects
              </p>
              <ul className="mt-2 flex flex-col gap-2">
                {Object.values(projects).map((project) => (
                  <li
                    key={project.id}
                    className="rounded-group border border-line bg-raised px-4 py-3"
                  >
                    <p className="truncate text-sm font-medium text-ink">{project.name}</p>
                    {project.description && (
                      <p className="mt-0.5 truncate text-xs text-ink-faint">
                        {project.description}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
