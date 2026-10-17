import { useState } from 'react'
import { Check, Lock, Pencil, Plus, Trash2, Zap } from 'lucide-react'
import type { Capability, ModelInfo, ProviderKind, ProviderProfile } from '@/domain/types'
import { makeId } from '@/domain/ids'
import { useAppStore } from '@/state/store'
import { Button } from '@/components/ui/Button'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Spinner } from '@/components/ui/Spinner'
import { TextField } from '@/components/ui/TextField'
import { Badge } from '@/components/ui/Tooltip'

const CAPABILITIES: Capability[] = [
  'chat',
  'search',
  'research',
  'images',
  'voice',
  'canvas',
  'data-analysis',
  'code',
]

const KIND_LABELS: Record<ProviderKind, string> = {
  openai: 'OpenAI (concept)',
  anthropic: 'Anthropic (concept)',
  google: 'Google (concept)',
  'openai-compatible': 'OpenAI-compatible endpoint',
  local: 'Local endpoint',
}

function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

/* ------------------------------------------------------------------ */
/* Model + capability editor                                           */
/* ------------------------------------------------------------------ */

interface ModelDraft {
  id: string
  label: string
  capabilities: Capability[]
}

function ModelEditor({
  model,
  onChange,
  onRemove,
}: {
  model: ModelDraft
  onChange: (model: ModelDraft) => void
  onRemove: () => void
}) {
  return (
    <div className="rounded-xl border border-line bg-raised p-3">
      <div className="flex flex-wrap items-end gap-2">
        <TextField
          className="min-w-[10rem] flex-1"
          label="Model ID"
          value={model.id}
          placeholder="e.g. my-model"
          onChange={(event) => onChange({ ...model, id: event.target.value })}
        />
        <TextField
          className="min-w-[10rem] flex-1"
          label="Display label"
          value={model.label}
          placeholder="e.g. My Model"
          onChange={(event) => onChange({ ...model, label: event.target.value })}
        />
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 size={14} />
          Remove
        </Button>
      </div>
      <div className="mt-2.5">
        <p className="text-xs font-medium text-ink-soft">Capabilities advertised by this model</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {CAPABILITIES.map((capability) => {
            const enabled = model.capabilities.includes(capability)
            return (
              <button
                key={capability}
                type="button"
                aria-pressed={enabled}
                onClick={() =>
                  onChange({
                    ...model,
                    capabilities: enabled
                      ? model.capabilities.filter((item) => item !== capability)
                      : [...model.capabilities, capability],
                  })
                }
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  enabled
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line text-ink-faint hover:text-ink'
                }`}
              >
                {capability}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Provider form                                                       */
/* ------------------------------------------------------------------ */

interface ProviderDraft {
  id: string
  label: string
  kind: ProviderKind
  endpointUrl: string
  models: ModelDraft[]
}

function emptyModel(): ModelDraft {
  return { id: '', label: '', capabilities: ['chat'] }
}

function ProviderForm({
  initial,
  isNew,
  onSave,
  onCancel,
}: {
  initial: ProviderDraft
  isNew: boolean
  onSave: (draft: ProviderDraft) => void
  onCancel: () => void
}) {
  const [draft, setDraft] = useState<ProviderDraft>(initial)
  const valid =
    draft.label.trim().length > 0 &&
    draft.endpointUrl.trim().length > 0 &&
    draft.models.every((model) => model.id.trim().length > 0 && model.label.trim().length > 0)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-accent bg-raised p-4">
      <TextField
        label="Profile label"
        value={draft.label}
        placeholder="e.g. My local setup"
        onChange={(event) => setDraft({ ...draft, label: event.target.value })}
      />
      <div>
        <label htmlFor={`kind-${draft.id}`} className="block text-sm font-medium text-ink">
          Provider type (configuration concept)
        </label>
        <select
          id={`kind-${draft.id}`}
          value={draft.kind}
          onChange={(event) => setDraft({ ...draft, kind: event.target.value as ProviderKind })}
          className="mt-1.5 w-full rounded-[10px] border border-line bg-raised px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
        >
          {(Object.keys(KIND_LABELS) as ProviderKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </div>
      <TextField
        label="Endpoint URL"
        value={draft.endpointUrl}
        placeholder="https://your-endpoint.example/v1"
        onChange={(event) => setDraft({ ...draft, endpointUrl: event.target.value })}
      />

      <div>
        <p className="text-sm font-medium text-ink">
          API key
          <Lock size={12} className="ml-1.5 inline text-ink-faint" aria-hidden="true" />
        </p>
        <input
          type="password"
          disabled
          placeholder="Secure credential entry arrives with the integration milestone"
          aria-describedby={`keynote-${draft.id}`}
          className="mt-1.5 w-full cursor-not-allowed rounded-[10px] border border-line bg-subtle px-3 py-2 text-sm text-ink-faint placeholder:text-ink-faint"
        />
        <p id={`keynote-${draft.id}`} className="mt-1 text-xs leading-relaxed text-ink-faint">
          This UI-only milestone never solicits, stores, logs, or transmits
          credentials. Everything you configure here stays in this browser.
        </p>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-ink">Models</p>
        <div className="flex flex-col gap-2.5">
          {draft.models.map((model, index) => (
            <ModelEditor
              key={index}
              model={model}
              onChange={(next) =>
                setDraft({
                  ...draft,
                  models: draft.models.map((item, itemIndex) => (itemIndex === index ? next : item)),
                })
              }
              onRemove={() =>
                setDraft({ ...draft, models: draft.models.filter((_, itemIndex) => itemIndex !== index) })
              }
            />
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => setDraft({ ...draft, models: [...draft.models, emptyModel()] })}
        >
          <Plus size={14} />
          Add model
        </Button>
      </div>

      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={!valid}
          onClick={() =>
            onSave({
              ...draft,
              models: draft.models.filter((model) => model.id.trim() && model.label.trim()),
            })
          }
        >
          {isNew ? 'Add profile' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Section                                                             */
/* ------------------------------------------------------------------ */

export function ProvidersSection() {
  const providers = useAppStore((state) => state.providers)
  const activeProviderId = useAppStore((state) => state.activeProviderId)
  const activeModelId = useAppStore((state) => state.activeModelId)
  const setActiveModel = useAppStore((state) => state.setActiveModel)
  const addProvider = useAppStore((state) => state.addProvider)
  const updateProvider = useAppStore((state) => state.updateProvider)
  const removeProvider = useAppStore((state) => state.removeProvider)

  const [editing, setEditing] = useState<{ id: string; draft: ProviderDraft } | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProviderProfile | null>(null)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, string>>({})

  function simulateConnectionTest(provider: ProviderProfile) {
    setTestingId(provider.id)
    setTimeout(() => {
      const latency = 18 + (hashString(provider.label) % 64)
      setResults((previous) => ({
        ...previous,
        [provider.id]: `Demo result: reachable (simulated) · ${latency}ms`,
      }))
      setTestingId(null)
    }, 700)
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium text-ink">Providers and models</h3>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">
          Local configuration concepts — nothing is contacted. Click a model to
          make it active; tool availability in the composer follows the model's
          advertised capabilities.
        </p>
      </div>

      {creating && (
        <ProviderForm
          isNew
          initial={{
            id: makeId('provider'),
            label: '',
            kind: 'openai-compatible',
            endpointUrl: '',
            models: [emptyModel()],
          }}
          onCancel={() => setCreating(false)}
          onSave={(draft) => {
            addProvider({
              id: draft.id,
              label: draft.label.trim(),
              kind: draft.kind,
              endpointUrl: draft.endpointUrl.trim(),
              demo: true,
              models: draft.models.map<ModelInfo>((model) => ({
                id: model.id.trim(),
                label: model.label.trim(),
                demo: true,
                capabilities: model.capabilities,
              })),
            })
            setCreating(false)
          }}
        />
      )}

      {providers.map((provider) => {
        const isActiveProvider = provider.id === activeProviderId
        return (
          <article key={provider.id} className="rounded-xl border border-line bg-raised p-4">
            {editing?.id === provider.id ? (
              <ProviderForm
                isNew={false}
                initial={editing.draft}
                onCancel={() => setEditing(null)}
                onSave={(draft) => {
                  updateProvider({
                    ...provider,
                    label: draft.label.trim(),
                    kind: draft.kind,
                    endpointUrl: draft.endpointUrl.trim(),
                    models: draft.models.map<ModelInfo>((model) => ({
                      id: model.id.trim(),
                      label: model.label.trim(),
                      demo: true,
                      capabilities: model.capabilities,
                    })),
                  })
                  setEditing(null)
                }}
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-sm font-semibold text-ink">{provider.label}</h4>
                  {isActiveProvider && <Badge tone="accent">Active profile</Badge>}
                  {provider.demo && <Badge>Demo</Badge>}
                </div>
                <p className="mt-1 break-all text-xs text-ink-faint">
                  {KIND_LABELS[provider.kind]} · {provider.endpointUrl}
                </p>

                <div className="mt-3">
                  <p className="text-xs font-medium text-ink-soft">Models (click to activate)</p>
                  <ul className="mt-1.5 flex flex-wrap gap-1.5">
                    {provider.models.length === 0 && (
                      <li className="text-xs text-ink-faint">No models configured</li>
                    )}
                    {provider.models.map((model) => {
                      const isActiveModel = isActiveProvider && model.id === activeModelId
                      return (
                        <li key={model.id}>
                          <button
                            type="button"
                            aria-pressed={isActiveModel}
                            onClick={() => setActiveModel(provider.id, model.id)}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                              isActiveModel
                                ? 'border-accent bg-accent-soft text-accent'
                                : 'border-line text-ink-soft hover:bg-subtle hover:text-ink'
                            }`}
                          >
                            {isActiveModel && <Check size={11} />}
                            {model.label}
                            {model.demo && <span className="text-[10px] text-ink-faint">demo</span>}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={testingId === provider.id}
                    onClick={() => simulateConnectionTest(provider)}
                  >
                    {testingId === provider.id ? <Spinner size={13} /> : <Zap size={13} />}
                    Simulate connection test
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setEditing({
                        id: provider.id,
                        draft: {
                          id: provider.id,
                          label: provider.label,
                          kind: provider.kind,
                          endpointUrl: provider.endpointUrl,
                          models: provider.models.map((model) => ({
                            id: model.id,
                            label: model.label,
                            capabilities: model.capabilities,
                          })),
                        },
                      })
                    }
                  >
                    <Pencil size={13} />
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-danger hover:bg-danger-soft"
                    onClick={() => setDeleteTarget(provider)}
                  >
                    <Trash2 size={13} />
                    Delete
                  </Button>
                  {results[provider.id] && (
                    <span aria-live="polite" className="text-xs font-medium text-success">
                      {results[provider.id]}
                    </span>
                  )}
                </div>
              </>
            )}
          </article>
        )
      })}

      {!creating && (
        <Button variant="secondary" className="self-start" onClick={() => setCreating(true)}>
          <Plus size={14} />
          Add provider profile
        </Button>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete provider profile?"
        body={`“${deleteTarget?.label ?? ''}” will be removed from this browser. If it holds the active model, the selection clears.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteTarget) removeProvider(deleteTarget.id)
        }}
      />
    </div>
  )
}
