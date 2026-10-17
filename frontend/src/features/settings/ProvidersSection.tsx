import { useState } from 'react'
import {
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unplug,
  Zap,
} from 'lucide-react'
import type { Capability, ModelInfo, ProviderKind, ProviderProfile } from '@/domain/types'
import { makeId } from '@/domain/ids'
import { useAppStore } from '@/state/store'
import { testProviderConnection } from '@/services/connection/providerConnection'
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
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google — OpenAI-compatible endpoint',
  'openai-compatible': 'OpenAI-compatible — Groq, OpenRouter, Together, Mistral, …',
  local: 'Local server — LM Studio, Ollama, vLLM, …',
}

/** Suggested base URLs, used to prefill the form when the kind changes. */
const KIND_ENDPOINTS: Record<ProviderKind, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  google: 'https://generativelanguage.googleapis.com/v1beta/openai',
  'openai-compatible': 'https://api.groq.com/openai/v1',
  local: 'http://localhost:1234/v1',
}

/** One-tap templates for popular providers — label, kind, and endpoint. */
const PRESETS: { label: string; kind: ProviderKind; endpointUrl: string }[] = [
  { label: 'OpenAI', kind: 'openai', endpointUrl: 'https://api.openai.com/v1' },
  { label: 'Anthropic', kind: 'anthropic', endpointUrl: 'https://api.anthropic.com' },
  {
    label: 'Google AI Studio',
    kind: 'google',
    endpointUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
  },
  { label: 'Groq', kind: 'openai-compatible', endpointUrl: 'https://api.groq.com/openai/v1' },
  {
    label: 'OpenRouter',
    kind: 'openai-compatible',
    endpointUrl: 'https://openrouter.ai/api/v1',
  },
  {
    label: 'Together',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.together.xyz/v1',
  },
  {
    label: 'Mistral',
    kind: 'openai-compatible',
    endpointUrl: 'https://api.mistral.ai/v1',
  },
  { label: 'Ollama (local)', kind: 'local', endpointUrl: 'http://localhost:11434/v1' },
  { label: 'LM Studio (local)', kind: 'local', endpointUrl: 'http://localhost:1234/v1' },
]

function maskKey(apiKey: string): string {
  const trimmed = apiKey.trim()
  if (trimmed.length <= 4) return '••••'
  return `•••• ${trimmed.slice(-4)}`
}

function formatCheckedAt(timestamp: number | null): string {
  if (timestamp === null) return ''
  const seconds = Math.max(0, Math.round((Date.now() - timestamp) / 1000))
  if (seconds < 45) return 'just now'
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`
  return new Date(timestamp).toLocaleDateString()
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

  function changeKind(kind: ProviderKind) {
    // Prefill the suggested base URL when the field is empty or still holds
    // another kind's suggestion — never clobber a URL the user typed.
    const previous = Object.values(KIND_ENDPOINTS)
    const endpointIsSuggestion =
      draft.endpointUrl.trim() === '' || previous.includes(draft.endpointUrl.trim())
    setDraft({
      ...draft,
      kind,
      endpointUrl: endpointIsSuggestion ? KIND_ENDPOINTS[kind] : draft.endpointUrl,
    })
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-accent bg-raised p-4">
      {isNew && (
        <div>
          <p className="text-sm font-medium text-ink">Start from a provider</p>
          <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">
            One tap fills in the endpoint — you only add a name if you want your own.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {PRESETS.map((preset) => {
              const selected =
                draft.label === preset.label && draft.endpointUrl.trim() === preset.endpointUrl
              return (
                <button
                  key={preset.label}
                  type="button"
                  aria-pressed={selected}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      label: preset.label,
                      kind: preset.kind,
                      endpointUrl: preset.endpointUrl,
                    })
                  }
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    selected
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line text-ink-soft hover:bg-subtle hover:text-ink'
                  }`}
                >
                  {preset.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
      <TextField
        label="Profile label"
        value={draft.label}
        placeholder="e.g. My OpenAI key"
        onChange={(event) => setDraft({ ...draft, label: event.target.value })}
      />
      <div>
        <label htmlFor={`kind-${draft.id}`} className="block text-sm font-medium text-ink">
          Provider type
        </label>
        <select
          id={`kind-${draft.id}`}
          value={draft.kind}
          onChange={(event) => changeKind(event.target.value as ProviderKind)}
          className="mt-1.5 w-full rounded-[10px] border border-line bg-raised px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
        >
          {(Object.keys(KIND_LABELS) as ProviderKind[]).map((kind) => (
            <option key={kind} value={kind}>
              {KIND_LABELS[kind]}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs leading-relaxed text-ink-faint">
          Any OpenAI-compatible endpoint works (Groq, OpenRouter, Together, Mistral, LM Studio,
          Ollama, …). Anthropic uses its native protocol. The type only decides headers and URL
          paths — the key and endpoint stay yours.
        </p>
      </div>
      <TextField
        label="Endpoint base URL"
        value={draft.endpointUrl}
        placeholder="https://your-endpoint.example/v1"
        hint="Usually ends in /v1. Do not include /chat/completions — that path is added automatically."
        onChange={(event) => setDraft({ ...draft, endpointUrl: event.target.value })}
      />

      <div>
        <p className="mb-2 text-sm font-medium text-ink">Models (optional)</p>
        <p className="mb-2 text-xs leading-relaxed text-ink-faint">
          Leave empty — connecting with an API key below discovers the endpoint's model list
          automatically and fills this in for you.
        </p>
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
/* Connection block — the BYOK heart of this section                   */
/* ------------------------------------------------------------------ */

function ConnectionBlock({ provider }: { provider: ProviderProfile }) {
  const credential = useAppStore((state) => state.credentials[provider.id])
  const setCredential = useAppStore((state) => state.setCredential)
  const clearCredential = useAppStore((state) => state.clearCredential)
  const updateProvider = useAppStore((state) => state.updateProvider)
  const setActiveModel = useAppStore((state) => state.setActiveModel)
  const showToast = useAppStore((state) => state.showToast)

  const [keyDraft, setKeyDraft] = useState('')
  const [reveal, setReveal] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  async function connect(apiKey: string) {
    setTesting(true)
    setMessage(null)
    const result = await testProviderConnection(provider, apiKey)
    setTesting(false)

    if (result.ok) {
      setCredential(provider.id, {
        providerId: provider.id,
        apiKey: apiKey.trim(),
        status: 'connected',
        lastCheckedAt: Date.now(),
        lastError: null,
        discoveredModels: result.models ?? [],
      })
      setMessage({ ok: true, text: result.message })

      // Adopt the endpoint's model list, and activate the first model when
      // this provider is (or becomes) the natural place to chat from.
      const discovered = result.models ?? []
      const nextModels: ModelInfo[] =
        discovered.length > 0
          ? discovered.map((id) => ({ id, label: id, demo: false, capabilities: ['chat'] }))
          : provider.models
      updateProvider({ ...provider, demo: false, models: nextModels })
      if (discovered.length > 0) {
        const { activeProviderId, activeModelId } = useAppStore.getState()
        if (activeProviderId === provider.id || activeProviderId === null || !activeModelId) {
          setActiveModel(provider.id, discovered[0])
        }
      }
      showToast(`Connected to ${provider.label}`)
      setKeyDraft('')
      setReveal(false)
    } else {
      // Remember the failure against a saved credential, or surface it inline
      // for an unsaved attempt — never store a key that did not authenticate.
      if (credential) {
        setCredential(provider.id, {
          ...credential,
          status: 'error',
          lastCheckedAt: Date.now(),
          lastError: result.message,
        })
      }
      setMessage({ ok: false, text: result.message })
    }
  }

  /* --- Connected or errored credential: status + management actions --- */
  if (credential) {
    const connected = credential.status === 'connected'
    return (
      <div className="mt-3 border-t border-line pt-3">
        <div
          className={`flex flex-wrap items-center gap-2 rounded-[10px] px-3 py-2 ${
            connected ? 'bg-success-soft' : 'bg-danger-soft'
          }`}
        >
          {connected ? (
            <ShieldCheck size={15} className="text-success" />
          ) : (
            <Unplug size={15} className="text-danger" />
          )}
          <span className={`text-xs font-semibold ${connected ? 'text-success' : 'text-danger'}`}>
            {connected ? 'Connected' : 'Connection failed'}
          </span>
          <span className="text-xs text-ink-faint">
            {maskKey(credential.apiKey)} · checked {formatCheckedAt(credential.lastCheckedAt)}
          </span>
          <span className="flex-1" />
          <Button
            variant="ghost"
            size="sm"
            disabled={testing}
            onClick={() => connect(credential.apiKey)}
          >
            {testing ? <Spinner size={13} /> : <RefreshCw size={13} />}
            Test again
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              clearCredential(provider.id)
              setMessage(null)
              setKeyDraft('')
            }}
          >
            <Trash2 size={13} />
            Disconnect
          </Button>
        </div>

        {credential.lastError && (
          <p className="mt-1.5 break-words text-xs leading-relaxed text-danger">
            {credential.lastError}
          </p>
        )}
        {connected && credential.discoveredModels.length > 0 && (
          <p className="mt-1.5 text-xs text-ink-faint">
            {credential.discoveredModels.length} model
            {credential.discoveredModels.length === 1 ? '' : 's'} discovered on this endpoint
          </p>
        )}

        <p aria-live="polite" className="mt-1.5 text-xs font-medium">
          {testing && <span className="text-ink-soft">Testing connection…</span>}
          {message && (
            <span className={message.ok ? 'text-success' : 'text-danger'}>{message.text}</span>
          )}
        </p>
      </div>
    )
  }

  /* --- No credential yet: key entry + connect --- */
  return (
    <div className="mt-3 border-t border-line pt-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-[12rem] flex-1">
          <label
            htmlFor={`key-${provider.id}`}
            className="block text-sm font-medium text-ink"
          >
            API key
          </label>
          <div className="relative mt-1.5">
            <KeyRound
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
              aria-hidden="true"
            />
            <input
              id={`key-${provider.id}`}
              type={reveal ? 'text' : 'password'}
              value={keyDraft}
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-…"
              aria-describedby={`keynote-${provider.id}`}
              onChange={(event) => setKeyDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && keyDraft.trim() && !testing) {
                  event.preventDefault()
                  void connect(keyDraft)
                }
              }}
              className="w-full rounded-control border border-line bg-raised py-2 pl-9 pr-10 text-[16px] text-ink placeholder:text-ink-faint transition-[border-color,box-shadow] duration-[var(--motion-fast)] focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--c-focus-ring)]"
            />
            <button
              type="button"
              aria-label={reveal ? 'Hide API key' : 'Show API key'}
              onClick={() => setReveal((previous) => !previous)}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-ink-faint transition-colors hover:bg-subtle hover:text-ink"
            >
              {reveal ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <p id={`keynote-${provider.id}`} className="mt-1 text-xs leading-relaxed text-ink-faint">
            Stored only in this browser and sent only to{' '}
            <span className="break-all">{provider.endpointUrl}</span> — never to anything else.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          className="mt-6"
          disabled={!keyDraft.trim() || testing}
          onClick={() => void connect(keyDraft)}
        >
          {testing ? <Spinner size={13} /> : <Zap size={13} />}
          Connect
        </Button>
      </div>
      <p aria-live="polite" className="mt-1.5 text-xs font-medium">
        {testing && <span className="text-ink-soft">Testing connection…</span>}
        {message && (
          <span className={message.ok ? 'text-success' : 'text-danger'}>{message.text}</span>
        )}
      </p>
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

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium text-ink">Providers and models</h3>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">
          Bring your own key: add any provider profile, connect it with an API key, and chat live
          with the models it offers. Keys stay in this browser and are sent only to the endpoint
          you configure. Demo profiles keep working fully offline.
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
            models: [],
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
                      <li className="text-xs text-ink-faint">
                        No models yet — connect with an API key to discover them
                      </li>
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

                <ConnectionBlock provider={provider} />

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
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
        body={`“${deleteTarget?.label ?? ''}” will be removed from this browser, together with its saved API key. If it holds the active model, the selection clears.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteTarget) removeProvider(deleteTarget.id)
        }}
      />
    </div>
  )
}
