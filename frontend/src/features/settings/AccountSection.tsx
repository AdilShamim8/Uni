import { useEffect, useRef, useState } from 'react'
import {
  CloudUpload,
  Eye,
  KeyRound,
  ListTree,
  LogIn,
  LogOut,
  MessageSquare,
  PenLine,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Square,
  Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SettingsGroup, SettingsRow } from '@/components/ui/SettingsGroup'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerConversationDetail } from '@/state/serverSessionStore'
import type { ServerProvider } from '@/services/api/serverProviders'
import { ReadinessStrip } from './ReadinessStrip'
import { MODEL_PICKER_THRESHOLD, SearchableModelPicker } from './SearchableModelPicker'
import { providerErrorLabel } from './providerErrors'
import { readFileText } from '@/services/readFileText'
import type { ImportCommitResponse, ImportPreviewResponse } from '@/services/api/serverContracts'

/**
 * Account settings (B02–B03): server identity, deliberate import, and
 * the server chat surface — providers with server-encrypted keys, plus
 * conversations that execute runs server-side and stream back. Local
 * data is never uploaded implicitly; local originals always stay.
 */

export function AccountSection() {
  const status = useServerSessionStore((state) => state.status)
  const initialize = useServerSessionStore((state) => state.initialize)

  useEffect(() => {
    void initialize()
  }, [initialize])

  return (
    <div className="flex flex-col gap-5">
      {status === 'signed-in' ? <SignedInView /> : <SignedOutView />}
      {status === 'signed-in' && <ServerProvidersView />}
      <ServerConversationsView />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Signed out — explicit sign-in / sign-up                             */
/* ------------------------------------------------------------------ */

function SignedOutView() {
  const signIn = useServerSessionStore((state) => state.signIn)
  const signUp = useServerSessionStore((state) => state.signUp)
  const error = useServerSessionStore((state) => state.error)
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      const ok =
        mode === 'sign-in'
          ? await signIn(email.trim(), password)
          : await signUp(name.trim(), email.trim(), password)
      if (ok) {
        setName('')
        setEmail('')
        setPassword('')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <SettingsGroup
      title="Uni account"
      footer="Sign-in uses an HttpOnly session cookie. Your local workspace keeps working exactly as before — nothing is uploaded unless you explicitly import it below."
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        {mode === 'sign-up' && (
          <label className="flex flex-col gap-1 text-[13px] text-ink-soft">
            Name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              required
              minLength={1}
              className="rounded-control border border-line bg-panel px-3 py-2 text-sm text-ink"
            />
          </label>
        )}
        <label className="flex flex-col gap-1 text-[13px] text-ink-soft">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            className="rounded-control border border-line bg-panel px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-[13px] text-ink-soft">
          Password (8+ characters)
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
            required
            minLength={8}
            className="rounded-control border border-line bg-panel px-3 py-2 text-sm text-ink"
          />
        </label>

        {error && (
          <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-[13px] text-danger">
            {error}
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" size="sm" disabled={busy}>
            <LogIn size={14} />
            {mode === 'sign-in' ? 'Sign in' : 'Create account'}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
          >
            {mode === 'sign-in' ? 'Need an account?' : 'Have an account?'}
          </Button>
        </div>
      </form>
    </SettingsGroup>
  )
}

/* ------------------------------------------------------------------ */
/* Signed in — identity, sign-out, deliberate import                   */
/* ------------------------------------------------------------------ */

function SignedInView() {
  const account = useServerSessionStore((state) => state.account)
  const signOut = useServerSessionStore((state) => state.signOut)
  const importPreview = useServerSessionStore((state) => state.importPreview)
  const importCommit = useServerSessionStore((state) => state.importCommit)
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null)
  const [pendingBackup, setPendingBackup] = useState<unknown | null>(null)
  const [commitResult, setCommitResult] = useState<ImportCommitResponse | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File | null) {
    if (!file) return
    setImportError(null)
    setPreview(null)
    setCommitResult(null)
    setPendingBackup(null)
    setBusy(true)
    try {
      const raw = await readFileText(file)
      const backup = JSON.parse(raw) as unknown
      const result = await importPreview(backup)
      if (result) {
        setPreview(result)
        setPendingBackup(backup)
      }
    } catch {
      setImportError('That file is not a readable workspace backup — nothing was imported.')
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function confirmImport() {
    if (pendingBackup === null) return
    setBusy(true)
    setImportError(null)
    try {
      // Commit exactly what was previewed.
      const result = await importCommit(pendingBackup)
      if (result) {
        setCommitResult(result)
        setPreview(null)
        setPendingBackup(null)
      }
    } catch {
      setImportError('The import could not be completed — nothing was changed on the server.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SettingsGroup
        title={`Signed in — ${account?.user.email ?? ''}`}
        footer="Your workspace lives on your Uni server. Signing out clears every server-derived record from this browser; local data stays."
      >
        <SettingsRow
          label="Workspace"
          description={`${account?.workspace.name ?? ''} · ${account?.workspace.role ?? ''}`}
        >
          <Button variant="secondary" size="sm" onClick={() => void signOut()}>
            <LogOut size={14} />
            Sign out
          </Button>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup
        title="Import local workspace"
        footer="Two steps, on purpose: preview what will move, then confirm. Your local chats, employees, and settings stay in this browser untouched. API keys are never part of a backup; temporary chats are never imported."
      >
        <SettingsRow
          label="Choose backup file"
          description="Use the workspace backup downloaded from Data settings (uni-workspace-backup-*.json)."
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            aria-label="Backup file"
            className="text-[13px] text-ink-soft file:mr-2 file:rounded-control file:border-0 file:bg-subtle file:px-3 file:py-1.5 file:text-[13px] file:text-ink"
            onChange={(event) => void handleFile(event.target.files?.[0] ?? null)}
          />
        </SettingsRow>

        {busy && <p className="text-[13px] text-ink-faint">Working…</p>}
        {importError && (
          <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-[13px] text-danger">
            {importError}
          </p>
        )}

        {preview && !commitResult && (
          <div className="rounded-group border border-line bg-raised p-3.5 text-[13px] text-ink-soft">
            <p className="font-medium text-ink">
              Ready to import {preview.counts.conversations} chat
              {preview.counts.conversations === 1 ? '' : 's'} ({preview.counts.messages} messages)
            </p>
            {preview.counts.skippedTemporary > 0 && (
              <p className="mt-1">{preview.counts.skippedTemporary} temporary chats will be skipped.</p>
            )}
            {preview.errors.length > 0 && (
              <ul className="mt-1 list-inside list-disc text-danger">
                {preview.errors.slice(0, 5).map((issue, index) => (
                  <li key={index}>
                    {issue.conversationId}: {issue.message}
                  </li>
                ))}
              </ul>
            )}
            {preview.unsupported.length > 0 && (
              <p className="mt-1.5 text-ink-faint">
                Not imported yet (later milestones): {preview.unsupported.join(', ')}
              </p>
            )}
            <div className="mt-2.5 flex items-center gap-2">
              <Button variant="primary" size="sm" disabled={busy} onClick={() => void confirmImport()}>
                <CloudUpload size={14} />
                Import to my workspace
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {commitResult && (
          <div className="rounded-group border border-accent/40 bg-accent-soft/40 p-3.5 text-[13px] text-ink-soft">
            <p className="font-medium text-ink">
              Imported {commitResult.imported.conversations} chat
              {commitResult.imported.conversations === 1 ? '' : 's'} ({commitResult.imported.messages}{' '}
              messages)
            </p>
            {commitResult.idempotentReplay && (
              <p className="mt-1">
                This backup was already imported — nothing was duplicated. The same server chats are
                shown below.
              </p>
            )}
            <p className="mt-1.5 text-ink-faint">
              Your local copy is untouched. Importing the same file again is a safe no-op.
            </p>
          </div>
        )}
      </SettingsGroup>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Server providers — encrypted credentials live on the server        */
/* ------------------------------------------------------------------ */

function ServerProvidersView() {
  const providers = useServerSessionStore((state) => state.serverProviders)
  const loading = useServerSessionStore((state) => state.serverProvidersLoading)
  const providerError = useServerSessionStore((state) => state.serverProviderError)
  const providerTest = useServerSessionStore((state) => state.serverProviderTest)
  const loadServerProviders = useServerSessionStore((state) => state.loadServerProviders)
  const addServerProvider = useServerSessionStore((state) => state.addServerProvider)
  const testServerProviderById = useServerSessionStore((state) => state.testServerProviderById)
  const setServerProviderModel = useServerSessionStore((state) => state.setServerProviderModel)
  const deleteServerProvider = useServerSessionStore((state) => state.deleteServerProvider)
  const serverSelection = useServerSessionStore((state) => state.serverSelection)
  const [adding, setAdding] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<ServerProvider | null>(null)
  // Manual model setup (N010): the provider row whose manual-model form
  // is open — for endpoints whose discovery found nothing usable.
  const [manualTarget, setManualTarget] = useState<ServerProvider | null>(null)
  const [manualDraft, setManualDraft] = useState('')
  const [settingModel, setSettingModel] = useState(false)
  const [busy, setBusy] = useState(false)
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<'openai-compatible' | 'anthropic'>('openai-compatible')
  const [endpointUrl, setEndpointUrl] = useState('https://api.x.ai/v1')
  const [modelId, setModelId] = useState('')
  const [apiKey, setApiKey] = useState('')

  useEffect(() => {
    void loadServerProviders()
  }, [loadServerProviders])

  // Keyless connections (N003): local runtimes (Ollama, LM Studio, vLLM)
  // speak OpenAI-compatible and usually need no key — the field stays
  // optional for that protocol and the server persists authMode 'none'.
  const keylessAllowed = kind === 'openai-compatible'

  async function submit() {
    if (!label.trim() || !endpointUrl.trim()) return
    if (!apiKey.trim() && !keylessAllowed) return
    setBusy(true)
    const ok = await addServerProvider({
      label: label.trim(),
      kind,
      endpointUrl: endpointUrl.trim(),
      modelId: modelId.trim() || undefined,
      apiKey: apiKey.trim(),
    })
    setBusy(false)
    if (ok) {
      setAdding(false)
      setLabel('')
      setModelId('')
      setApiKey('')
    }
  }

  async function submitManualModel() {
    const value = manualDraft.trim()
    if (!manualTarget || !value || settingModel) return
    setSettingModel(true)
    const ok = await setServerProviderModel(manualTarget.id, value)
    setSettingModel(false)
    if (ok) {
      setManualTarget(null)
      setManualDraft('')
    }
  }

  return (
    <SettingsGroup
      title="Server providers"
      footer="Keys added here are encrypted on the server (AES-256-GCM) and used only for its outbound model requests — they never enter this browser's storage, exports, or logs. This is separate from the browser BYOK keys in Provider settings."
    >
      <SettingsRow
        label={`Providers on the server (${providers.length})`}
        description={
          loading
            ? 'Loading…'
            : providers.length === 0
              ? 'None yet — add one to use server chat.'
              : 'Server chat uses the first provider with a saved key or a keyless local runtime.'
        }
      >
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void loadServerProviders()}>
            <RefreshCw size={14} />
            Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setAdding(!adding)}>
            <Plus size={14} />
            {adding ? 'Cancel' : 'Add provider'}
          </Button>
        </div>
      </SettingsRow>

      {providers.length > 0 && (
        <ul className="flex flex-col gap-1" aria-label="Server providers">
          {providers.map((provider) => {
            const activeModel = provider.modelId ?? provider.models[0] ?? null
            const testResult = providerTest?.providerId === provider.id ? providerTest : null
            return (
              <li
                key={provider.id}
                className="flex flex-col gap-1 rounded-control px-2.5 py-2 text-[13px]"
              >
                <span className="flex items-center gap-2">
                  <KeyRound size={13} className="shrink-0 text-ink-faint" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{provider.label}</span>
                    <span className="block truncate text-[11px] text-ink-faint">
                      {provider.kind === 'anthropic' ? 'Anthropic' : 'OpenAI-compatible'} ·{' '}
                      {provider.endpointUrl}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                      provider.credential.present || provider.authMode === 'none'
                        ? 'bg-accent-soft text-accent'
                        : 'bg-subtle text-ink-faint'
                    }`}
                  >
                    {provider.credential.present
                      ? 'Key saved'
                      : provider.authMode === 'none'
                        ? 'Keyless'
                        : 'No key'}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => void testServerProviderById(provider.id)}
                  >
                    Test
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    aria-label={`Delete provider ${provider.label}`}
                    onClick={() => setConfirmDelete(provider)}
                  >
                    <Trash2 size={13} />
                    Delete
                  </Button>
                </span>
                {activeModel && (
                  <span className="pl-[21px] text-[11px] text-ink-faint">
                    Model for server chat:{' '}
                    <span className="font-medium text-ink-soft">{activeModel}</span>
                    {provider.modelId ? '' : ' — first discovered model'}
                  </span>
                )}
                {/* Manual model setup (N010): endpoints whose discovery
                    fails or lists nothing stay usable — the user sets the
                    exact model id by hand, persisted on the provider row. */}
                {!activeModel && manualTarget?.id !== provider.id && (
                  <span className="pl-[21px]">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setManualTarget(provider)
                        setManualDraft('')
                      }}
                    >
                      <PenLine size={13} />
                      Set model manually
                    </Button>
                  </span>
                )}
                {manualTarget?.id === provider.id && (
                  <form
                    className="ml-[21px] flex flex-wrap items-center gap-1.5"
                    onSubmit={(event) => {
                      event.preventDefault()
                      void submitManualModel()
                    }}
                  >
                    <input
                      value={manualDraft}
                      onChange={(event) => setManualDraft(event.target.value)}
                      placeholder="model id, e.g. grok-4-fast"
                      aria-label={`Model id for ${provider.label}`}
                      autoFocus
                      className="min-w-[12rem] flex-1 rounded-control border border-line bg-raised px-2.5 py-1.5 text-[12px] text-ink"
                    />
                    <Button type="submit" variant="secondary" size="sm" disabled={!manualDraft.trim() || settingModel}>
                      {settingModel ? 'Setting…' : 'Set model'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setManualTarget(null)
                        setManualDraft('')
                      }}
                    >
                      Cancel
                    </Button>
                    <p className="w-full text-[11px] leading-relaxed text-ink-faint">
                      For endpoints whose model discovery found nothing — the id is saved on the
                      provider and used exactly as typed.
                    </p>
                  </form>
                )}
                {testResult && (
                  <div className="ml-[21px]">
                    <p
                      role="status"
                      className={`rounded-control px-2.5 py-1.5 text-[12px] ${
                        testResult.ok ? 'bg-accent-soft/60 text-ink-soft' : 'bg-danger/10 text-danger'
                      }`}
                    >
                      {!testResult.ok && testResult.errorKind && (
                        <span
                          className="mr-1.5 inline-block rounded-full bg-danger/15 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide"
                        >
                          {providerErrorLabel(testResult.errorKind)}
                        </span>
                      )}
                      {testResult.message}
                      {testResult.ok && testResult.latencyMs !== null && <> · {testResult.latencyMs} ms</>}
                      {testResult.ok && testResult.discoveredModels && (
                        <>
                          {' '}
                          · {testResult.discoveredModels.length} model
                          {testResult.discoveredModels.length === 1 ? '' : 's'} discovered
                          {testResult.discoveredModels.length > 0 &&
                            ` (${testResult.discoveredModels.slice(0, 3).join(', ')}${
                              testResult.discoveredModels.length > 3
                                ? `, +${testResult.discoveredModels.length - 3} more`
                                : ''
                            })`}
                        </>
                      )}
                    </p>
                    {/* The per-axis breakdown behind the aggregate outcome (N007). */}
                    <ReadinessStrip
                      readiness={testResult.readiness}
                      modelCount={
                        testResult.readiness.catalog === 'ok'
                          ? testResult.discoveredModels?.length
                          : undefined
                      }
                    />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {adding && (
        <form
          className="flex flex-col gap-2.5 rounded-group border border-line bg-panel p-3"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <label className="flex flex-col gap-1 text-[13px] text-ink-soft">
            Label
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              required
              placeholder="xAI · Grok"
              className="rounded-control border border-line bg-raised px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-ink-soft">
            Protocol
            <select
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as 'openai-compatible' | 'anthropic')
              }
              className="rounded-control border border-line bg-raised px-3 py-2 text-sm text-ink"
            >
              <option value="openai-compatible">OpenAI-compatible (Grok, GPT, DeepSeek…)</option>
              <option value="anthropic">Anthropic (Claude)</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-ink-soft">
            Endpoint URL
            <input
              value={endpointUrl}
              onChange={(event) => setEndpointUrl(event.target.value)}
              required
              placeholder="https://api.x.ai/v1"
              className="rounded-control border border-line bg-raised px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-ink-soft">
            Model (optional — discovered on test)
            <input
              value={modelId}
              onChange={(event) => setModelId(event.target.value)}
              placeholder="grok-4-fast"
              className="rounded-control border border-line bg-raised px-3 py-2 text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-[13px] text-ink-soft">
            API key {keylessAllowed && <span className="text-ink-faint">(optional — local runtimes need none)</span>}
            <input
              type="password"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              required={!keylessAllowed}
              autoComplete="off"
              placeholder={
                keylessAllowed
                  ? 'Sent once, encrypted on the server — leave empty for a local runtime'
                  : 'Sent once, encrypted on the server'
              }
              className="rounded-control border border-line bg-raised px-3 py-2 text-sm text-ink"
            />
          </label>
          {providerError && (
            <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-[13px] text-danger">
              {providerError}
            </p>
          )}
          <Button type="submit" variant="primary" size="sm" disabled={busy}>
            <KeyRound size={14} />
            {busy ? 'Saving…' : apiKey.trim() || !keylessAllowed ? 'Save provider + key' : 'Save keyless provider'}
          </Button>
        </form>
      )}

      {!adding && providerError && (
        <p role="alert" className="rounded-control bg-danger/10 px-3 py-2 text-[13px] text-danger">
          {providerError}
        </p>
      )}

      {confirmDelete && (
        <div role="dialog" aria-modal="true" aria-label="Delete server provider" className="rounded-group border border-line bg-panel p-3">
          <p className="text-[13px] text-ink">
            Delete <span className="font-medium">{confirmDelete.label}</span> and its encrypted key
            from the server?
          </p>
          <p className="mt-1 text-[12px] text-ink-faint">
            {serverSelection?.providerId === confirmDelete.id
              ? 'It is the selected destination for server chat — you will need to pick another provider before sending again. '
              : ''}
            Existing conversations are kept. This cannot be undone.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => {
                const target = confirmDelete
                setConfirmDelete(null)
                setBusy(true)
                void deleteServerProvider(target.id).then(() => setBusy(false))
              }}
            >
              <Trash2 size={13} />
              Delete provider
            </Button>
          </div>
        </div>
      )}
    </SettingsGroup>
  )
}

/* ------------------------------------------------------------------ */
/* Server conversations — chat surface with server-side runs          */
/* ------------------------------------------------------------------ */

function ServerConversationsView() {
  const status = useServerSessionStore((state) => state.status)
  const conversations = useServerSessionStore((state) => state.conversations)
  const conversationsLoading = useServerSessionStore((state) => state.conversationsLoading)
  const loadConversations = useServerSessionStore((state) => state.loadConversations)
  const openServerConversation = useServerSessionStore((state) => state.openServerConversation)
  const openConversation = useServerSessionStore((state) => state.openConversation)
  const openConversationId = useServerSessionStore((state) => state.openConversationId)
  const openConversationLoading = useServerSessionStore((state) => state.openConversationLoading)
  const newServerConversation = useServerSessionStore((state) => state.newServerConversation)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (status === 'signed-in') void loadConversations()
  }, [status, loadConversations])

  if (status !== 'signed-in') return null

  async function createConversation() {
    const title = newTitle.trim() || 'Server chat'
    setCreating(true)
    await newServerConversation(title)
    setCreating(false)
    setNewTitle('')
  }

  return (
    <SettingsGroup
      title="Chats on this account"
      footer="These conversations execute on your Uni server: the server stores the tree, runs the model through its saved provider, and streams replies back. Reload any time — everything is re-fetched from the server, never cached between sessions."
    >
      <SettingsRow
        label={`Server conversations (${conversations.length})`}
        description={
          conversationsLoading ? 'Loading…' : 'Newest first; select one to open it.'
        }
      >
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void loadConversations()}>
            <RefreshCw size={14} />
            Refresh
          </Button>
        </div>
      </SettingsRow>

      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void createConversation()
        }}
      >
        <input
          value={newTitle}
          onChange={(event) => setNewTitle(event.target.value)}
          placeholder="Start a server chat…"
          aria-label="New server conversation title"
          className="min-w-0 flex-1 rounded-control border border-line bg-panel px-3 py-2 text-[13px] text-ink"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={creating}>
          <MessageSquare size={14} />
          New
        </Button>
      </form>

      {conversations.length > 0 && (
        <ul className="flex max-h-52 flex-col gap-1 overflow-y-auto" aria-label="Server conversations">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                type="button"
                aria-current={openConversationId === conversation.id ? 'true' : undefined}
                onClick={() =>
                  void openServerConversation(
                    openConversationId === conversation.id ? null : conversation.id,
                  )
                }
                className="flex w-full items-center gap-2 rounded-control px-2.5 py-2 text-left text-[13px] text-ink-soft transition-colors hover:bg-subtle hover:text-ink"
              >
                <ListTree size={13} className="shrink-0 text-ink-faint" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{conversation.title}</span>
                <span className="shrink-0 text-[11px] text-ink-faint">
                  {conversation.messageCount} msg
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {openConversationId && openConversationLoading && (
        <p className="text-[13px] text-ink-faint">Opening conversation…</p>
      )}

      {openConversation && <ServerThread detail={openConversation} />}
    </SettingsGroup>
  )
}

/** The server conversation: transcript + destination picker + composer. */
function ServerThread({ detail }: { detail: ServerConversationDetail }) {
  const sendServerMessage = useServerSessionStore((state) => state.sendServerMessage)
  const stopActiveServerRun = useServerSessionStore((state) => state.stopActiveServerRun)
  const activeRun = useServerSessionStore((state) => state.activeRun)
  const runError = useServerSessionStore((state) => state.runError)
  const serverProviders = useServerSessionStore((state) => state.serverProviders)
  const serverSelection = useServerSessionStore((state) => state.serverSelection)
  const serverSelectionNotice = useServerSessionStore((state) => state.serverSelectionNotice)
  const setServerSelection = useServerSessionStore((state) => state.setServerSelection)
  const setServerProviderModel = useServerSessionStore((state) => state.setServerProviderModel)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  // Manual model entry in the destination picker (N010): typing an exact
  // id for models the provider's catalog does not list.
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

  const activePath = new Set<string>()
  let cursor = detail.activeLeafId
  const byId = new Map(detail.nodes.map((node) => [node.id, node]))
  while (cursor) {
    activePath.add(cursor)
    const node = byId.get(cursor)
    cursor = node?.parentId ?? null
  }

  const runIsLive =
    activeRun !== null &&
    activeRun.conversationId === detail.id &&
    (activeRun.status === 'running' || activeRun.status === 'cancelling')

  async function send() {
    const text = draft.trim()
    if (!text || sending || runIsLive) return
    setSending(true)
    setDraft('')
    await sendServerMessage(text)
    setSending(false)
  }

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
    <div
      className="rounded-group border border-line bg-panel p-3"
      aria-label={`Server conversation ${detail.title}`}
    >
      <p className="mb-2 flex items-center gap-1.5 text-[13px] font-medium text-ink">
        <Eye size={13} aria-hidden="true" />
        {detail.title}
      </p>
      <ol className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        {detail.nodes.map((node) => {
          const onActiveBranch = activePath.has(node.id)
          return (
            <li
              key={node.id}
              className={`rounded-control px-2.5 py-1.5 text-[13px] leading-relaxed ${
                onActiveBranch ? 'bg-subtle text-ink' : 'text-ink-faint opacity-70'
              }`}
            >
              <span className="mr-1.5 font-medium">
                {node.role === 'user' ? 'You' : 'Assistant'}
                {!onActiveBranch && ' · other branch'}
                {node.status === 'stopped' && ' · stopped'}
                {node.status === 'error' && ' · error'}
              </span>
              <span className="whitespace-pre-wrap">{node.content}</span>
            </li>
          )
        })}
        {activeRun && activeRun.conversationId === detail.id && (
          <li className="rounded-control bg-subtle px-2.5 py-1.5 text-[13px] leading-relaxed text-ink">
            <span className="mr-1.5 font-medium">
              Assistant
              {activeRun.status === 'running' && ' · streaming…'}
              {activeRun.status === 'cancelling' && ' · stopping…'}
              {activeRun.status === 'stopped' && ' · stopped'}
              {activeRun.status === 'repetition_stopped' && ' · stopped — repetitive output'}
              {activeRun.status === 'error' && ' · error'}
            </span>
            <span className="whitespace-pre-wrap">{activeRun.text}</span>
            {activeRun.errorMessage && (
              <span className="mt-1 block text-[12px] text-danger">{activeRun.errorMessage}</span>
            )}
          </li>
        )}
      </ol>

      {/* The explicit destination (N004): provider + model, stored by
          exact ids. Adding or removing other profiles never changes it;
          a stale choice is shown as unavailable, not swapped (N005). */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[11.5px] text-ink-faint">
          Provider
          <select
            aria-label="Server chat provider"
            value={serverSelection?.providerId ?? ''}
            disabled={runIsLive || usableProviders.length === 0}
            onChange={(event) => {
              const provider = usableProviders.find((entry) => entry.id === event.target.value)
              if (!provider) return
              const modelId = provider.modelId ?? provider.models[0] ?? ''
              if (modelId) setServerSelection(provider.id, modelId)
            }}
            className="max-w-[13rem] truncate rounded-control border border-line bg-raised px-2 py-1 text-[12px] text-ink disabled:opacity-60"
          >
            {serverSelection && !usableProviders.some((p) => p.id === serverSelection.providerId) && (
              <option value={serverSelection.providerId}>
                {selectedProvider ? `${selectedProvider.label} — unavailable` : 'Selected provider was removed'}
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
                disabled={runIsLive}
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
                disabled={runIsLive || (selectedProvider.models.length === 0 && !manualModelOpen)}
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
            <Button type="submit" variant="secondary" size="sm" disabled={!manualModelDraft.trim() || settingModel}>
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

      <form
        className="mt-2.5 flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void send()
            }
          }}
          rows={2}
          aria-label="Message the server assistant"
          placeholder={
            usableProviders.length === 0
              ? 'Add a server provider (key or keyless local) above first…'
              : serverSelection
                ? 'Message runs on your Uni server…'
                : 'Pick a provider and model above to send…'
          }
          className="min-h-[44px] min-w-0 flex-1 resize-y rounded-control border border-line bg-raised px-3 py-2 text-[13px] text-ink"
        />
        {runIsLive ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => void stopActiveServerRun()}>
            <Square size={14} />
            Stop
          </Button>
        ) : (
          <Button type="submit" variant="primary" size="sm" disabled={sending || !draft.trim()}>
            <Send size={14} />
            {sending ? 'Sending…' : 'Send'}
          </Button>
        )}
      </form>

      {runError && (
        <p role="alert" className="mt-2 rounded-control bg-danger/10 px-3 py-2 text-[12.5px] text-danger">
          {runError}
        </p>
      )}

      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-faint">
        <ShieldCheck size={12} aria-hidden="true" />
        Server execution — the model runs through your Uni server's saved provider; the active branch
        is highlighted and siblings are preserved.
      </p>
    </div>
  )
}
