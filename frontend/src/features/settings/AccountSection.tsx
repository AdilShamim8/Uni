import { useEffect, useRef, useState } from 'react'
import { CloudUpload, Eye, ListTree, LogIn, LogOut, RefreshCw, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { SettingsGroup, SettingsRow } from '@/components/ui/SettingsGroup'
import { useServerSessionStore } from '@/state/serverSessionStore'
import type { ServerConversationDetail } from '@/state/serverSessionStore'
import { readFileText } from '@/services/readFileText'
import type { ImportCommitResponse, ImportPreviewResponse } from '@/services/api/serverContracts'

/**
 * Account settings (B02): server identity with explicit, deliberate
 * actions. Local data is never uploaded implicitly — importing is a
 * two-step preview + confirm on this page, and local originals stay in
 * this browser afterwards. Server chats are read-only here until the
 * server-side chat runs land (next milestone).
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
/* Server conversations — read-only, reload-safe                       */
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

  useEffect(() => {
    if (status === 'signed-in') void loadConversations()
  }, [status, loadConversations])

  if (status !== 'signed-in') return null

  return (
    <SettingsGroup
      title="Chats on this account"
      footer="Read-only server copies — sending messages from the server account arrives with the chat-runs milestone. Reload this page any time: this list is re-fetched from the server, never cached between sessions."
    >
      <SettingsRow
        label={`Server conversations (${conversations.length})`}
        description={conversationsLoading ? 'Loading…' : 'Newest first; select one to read it.'}
      >
        <Button variant="ghost" size="sm" onClick={() => void loadConversations()}>
          <RefreshCw size={14} />
          Refresh
        </Button>
      </SettingsRow>

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

/** A compact read-only rendering of the server message tree. */
function ServerThread({ detail }: { detail: ServerConversationDetail }) {
  const activePath = new Set<string>()
  let cursor = detail.activeLeafId
  const byId = new Map(detail.nodes.map((node) => [node.id, node]))
  while (cursor) {
    activePath.add(cursor)
    const node = byId.get(cursor)
    cursor = node?.parentId ?? null
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
      </ol>
      <p className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-faint">
        <ShieldCheck size={12} aria-hidden="true" />
        Read-only server copy — the active branch is highlighted; siblings are preserved.
      </p>
    </div>
  )
}
