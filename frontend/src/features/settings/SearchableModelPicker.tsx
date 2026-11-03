import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

/**
 * Searchable model picker for the server-chat destination (N011).
 *
 * A native <select> is honest for a handful of options, but a discovered
 * catalog can hold up to 100 persisted ids (OpenRouter) — scrolling a
 * bare dropdown for the one model you want is not a picker. This
 * component filters the provider's catalog as you type, shows a BOUNDED
 * slice of the matches (never a thousand-row render), and hands off to
 * manual entry (N010) when the catalog still does not list what you
 * need.
 *
 * The panel renders IN FLOW under the trigger (the settings surface
 * grows instead of clipping — the same pattern as the other inline
 * forms here), collapses the moment a choice is made, and never
 * mutates the catalog: filtering is a view, selection is by exact id.
 */

/** Above this catalog size the destination picker becomes searchable. */
export const MODEL_PICKER_THRESHOLD = 12

/** Matches rendered in the open panel — bounded for fast, scannable UI. */
const MAX_SHOWN_MATCHES = 30

export function SearchableModelPicker({
  models,
  value,
  onSelect,
  onManualEntry,
  disabled = false,
}: {
  /** The provider's discovered catalog (already persisted server-side). */
  models: string[]
  /** The currently selected model id (may not be in the catalog). */
  value: string | null
  /** Choose a model by exact id. */
  onSelect: (modelId: string) => void
  /** Open the manual model entry form (N010). */
  onManualEntry: () => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  function close() {
    setOpen(false)
    setQuery('')
  }

  const normalized = query.trim().toLowerCase()
  const matches = normalized
    ? models.filter((model) => model.toLowerCase().includes(normalized))
    : models
  const shown = matches.slice(0, MAX_SHOWN_MATCHES)
  const hidden = matches.length - shown.length

  return (
    <span className="relative flex flex-col items-start gap-1">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Server chat model"
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
        className="inline-flex max-w-[13rem] items-center gap-1 rounded-control border border-line bg-raised px-2 py-1 text-[12px] text-ink transition-colors hover:bg-subtle disabled:opacity-60"
      >
        <span className="truncate">{value ?? 'Pick a model'}</span>
        <ChevronDown size={13} className="shrink-0 text-ink-faint" aria-hidden="true" />
      </button>

      {open && (
        <span className="flex w-[16rem] max-w-full flex-col gap-1.5 rounded-control border border-line bg-raised p-2">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation()
                close()
              }
              // Enter commits the first shown match — the one the user
              // is looking at — by exact id.
              if (event.key === 'Enter' && shown.length > 0) {
                event.preventDefault()
                onSelect(shown[0]!)
                close()
              }
            }}
            placeholder={`Filter ${models.length} models…`}
            aria-label="Filter models"
            spellCheck={false}
            className="w-full rounded-control border border-line bg-panel px-2 py-1.5 text-[12px] text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
          <ul
            role="listbox"
            aria-label="Server chat models"
            className="flex max-h-48 flex-col gap-0.5 overflow-y-auto"
          >
            {shown.map((model) => {
              const selected = model === value
              return (
                <li key={model}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => {
                      onSelect(model)
                      close()
                    }}
                    className={`flex w-full items-center gap-1.5 rounded-control px-2 py-1.5 text-left text-[12px] transition-colors ${
                      selected ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-subtle hover:text-ink'
                    }`}
                  >
                    {selected && <Check size={12} className="shrink-0" aria-hidden="true" />}
                    <span className="min-w-0 truncate">{model}</span>
                  </button>
                </li>
              )
            })}
            {shown.length === 0 && (
              <li className="px-2 py-1.5 text-[11px] text-ink-faint">
                No model matches “{query.trim()}”.
              </li>
            )}
          </ul>
          {hidden > 0 && (
            <p className="px-1 text-[11px] text-ink-faint">
              +{hidden} more match{hidden === 1 ? '' : 'es'} — keep typing to narrow the list.
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              close()
              onManualEntry()
            }}
            className="rounded-control px-2 py-1.5 text-left text-[11.5px] font-medium text-accent transition-colors hover:bg-accent-soft"
          >
            Type a model id…
          </button>
        </span>
      )}
    </span>
  )
}
