import { useState } from 'react'
import { useServerSessionStore } from '@/state/serverSessionStore'
import { Button } from '@/components/ui/Button'
import {
  MODEL_PICKER_THRESHOLD,
  SearchableModelPicker,
} from '@/features/settings/SearchableModelPicker'

/**
 * The explicit server-chat destination (N004): provider + model, stored
 * by exact ids. Adding or removing other profiles never changes the
 * choice; a stale choice is shown as unavailable, never swapped (N005).
 * Manual model entry (N010) works when discovery fails; large catalogs
 * get the searchable bounded picker (N011).
 *
 * Extracted from the Account server thread so the unified Chat server
 * surface (Phase B) reuses the exact same destination semantics.
 */
export function ServerDestinationPicker({ disabled = false }: { disabled?: boolean }) {
  const serverProviders = useServerSessionStore((state) => state.serverProviders)
  const serverSelection = useServerSessionStore((state) => state.serverSelection)
  const serverSelectionNotice = useServerSessionStore((state) => state.serverSelectionNotice)
  const setServerSelection = useServerSessionStore((state) => state.setServerSelection)
  const setServerProviderModel = useServerSessionStore((state) => state.setServerProviderModel)
  const [manualModelOpen, setManualModelOpen] = useState(false)
  const [manualModelDraft, setManualModelDraft] = useState('')
  const [settingModel, setSettingModel] = useState(false)

  // A provider can be a destination when it holds a key or is genuinely
  // keyless (N002/N003). The selection references EXACT ids (N004).
  const usableProviders = serverProviders.filter(
    (provider) => provider.credential.present || provider.authMode === 'none',
  )
  const selectedProvider = serverSelection
    ? serverProviders.find((provider) => provider.id === serverSelection.providerId) ?? null
    : null
  const selectedModelKnown =
    selectedProvider !== null &&
    serverSelection !== null &&
    (selectedProvider.modelId === serverSelection.modelId ||
      selectedProvider.models.includes(serverSelection.modelId))
  // N005: a removed/unusable chosen destination is an explicit state —
  // never an automatic fallback to another provider.
  const selectionUnavailable =
    serverSelection !== null &&
    (selectedProvider === null ||
      (!selectedProvider.credential.present && selectedProvider.authMode !== 'none') ||
      !selectedModelKnown)

  // Manual model entry (N010): persist the exact id on the provider row;
  // the store follows the selection because this IS the destination.
  async function applyManualModel() {
    const value = manualModelDraft.trim()
    if (!selectedProvider || !value || settingModel) return
    setSettingModel(true)
    const ok = await setServerProviderModel(selectedProvider.id, value)
    setSettingModel(false)
    if (ok) {
      setManualModelOpen(false)
      setManualModelDraft('')
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11.5px] text-ink-faint">
          Provider
          <select
            aria-label="Server chat provider"
            value={serverSelection?.providerId ?? ''}
            disabled={disabled || usableProviders.length === 0}
            onChange={(event) => {
              const provider = usableProviders.find((entry) => entry.id === event.target.value)
              if (!provider) return
              const modelId = provider.modelId ?? provider.models[0] ?? ''
              if (modelId) setServerSelection(provider.id, modelId)
            }}
            className="max-w-[13rem] truncate rounded-control border border-line bg-raised px-2 py-1 text-[12px] text-ink disabled:opacity-60"
          >
            {serverSelection &&
              !usableProviders.some((p) => p.id === serverSelection.providerId) && (
                <option value={serverSelection.providerId}>
                  {selectedProvider
                    ? `${selectedProvider.label} — unavailable`
                    : 'Selected provider was removed'}
                </option>
              )}
            {usableProviders.length === 0 && <option value="">No usable provider yet</option>}
            {usableProviders.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
                {provider.authMode === 'none' ? ' (keyless)' : ''}
              </option>
            ))}
          </select>
        </label>
        {selectedProvider &&
          (selectedProvider.models.length > MODEL_PICKER_THRESHOLD ? (
            <>
              {/* Searchable bounded catalog (N011): a large discovered
                  list filters as you type and never renders unbounded
                  options; manual entry (N010) stays one action away
                  inside the panel. */}
              <SearchableModelPicker
                models={selectedProvider.models}
                value={
                  serverSelection?.providerId === selectedProvider.id
                    ? serverSelection.modelId
                    : null
                }
                onSelect={(modelId) => setServerSelection(selectedProvider.id, modelId)}
                onManualEntry={() => setManualModelOpen(true)}
                disabled={disabled}
              />
              {/* The picker is self-labeled (its trigger carries the
                  "Server chat model" aria-label); this text keeps the
                  visual parity with the small-catalog select. */}
              <span className="sr-only">Model</span>
            </>
          ) : (
            <label className="flex items-center gap-1.5 text-[11.5px] text-ink-faint">
              Model
              <select
                aria-label="Server chat model"
                value={serverSelection?.modelId ?? ''}
                disabled={
                  disabled || (selectedProvider.models.length === 0 && !manualModelOpen)
                }
                onChange={(event) => {
                  // "Type a model id…" opens manual entry (N010); every
                  // real option still selects by exact id.
                  if (event.target.value === '__manual__') {
                    setManualModelOpen(true)
                    return
                  }
                  setServerSelection(selectedProvider.id, event.target.value)
                }}
                className="max-w-[13rem] truncate rounded-control border border-line bg-raised px-2 py-1 text-[12px] text-ink disabled:opacity-60"
              >
                {serverSelection && !selectedModelKnown && (
                  <option value={serverSelection.modelId}>
                    {serverSelection.modelId} — no longer offered
                  </option>
                )}
                {/* A manually-set model (N010) stays selectable even when
                    the discovered catalog does not list it. */}
                {selectedProvider.modelId &&
                  !selectedProvider.models.includes(selectedProvider.modelId) &&
                  selectedModelKnown && (
                    <option value={selectedProvider.modelId}>
                      {selectedProvider.modelId} — set manually
                    </option>
                  )}
                {selectedProvider.models.length === 0 && !manualModelOpen && (
                  <option value="">No models — Test above or type an id</option>
                )}
                {selectedProvider.models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
                <option value="__manual__">Type a model id…</option>
              </select>
            </label>
          ))}
        {manualModelOpen && selectedProvider && (
          <form
            className="flex flex-wrap items-center gap-1.5"
            onSubmit={(event) => {
              event.preventDefault()
              void applyManualModel()
            }}
          >
            <input
              value={manualModelDraft}
              onChange={(event) => setManualModelDraft(event.target.value)}
              placeholder="model id, e.g. grok-4-fast"
              aria-label="Model id for server chat"
              autoFocus
              className="min-w-[11rem] rounded-control border border-line bg-raised px-2 py-1 text-[12px] text-ink"
            />
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={!manualModelDraft.trim() || settingModel}
            >
              {settingModel ? 'Setting…' : 'Set model'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setManualModelOpen(false)
                setManualModelDraft('')
              }}
            >
              Cancel
            </Button>
          </form>
        )}
      </div>
      {(selectionUnavailable || serverSelectionNotice) && (
        <p role="status" className="mt-1.5 text-[12px] text-danger">
          {serverSelectionNotice ??
            'The chosen destination is unavailable — pick a provider and model above. Nothing is sent until you do.'}
        </p>
      )}
    </>
  )
}
