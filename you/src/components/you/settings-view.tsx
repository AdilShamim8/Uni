"use client";

import { useState } from "react";
import {
  BadgeCheck, ExternalLink, Eye, EyeOff, KeyRound, Loader2, Plus,
  RefreshCw, ShieldCheck, Trash2, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { api, type CredentialInfo, type SessionUser } from "@/lib/you-client";
import { useYou } from "@/lib/you-store";

const PROVIDER_OPTIONS = [
  { id: "openai", name: "OpenAI", hint: "platform.openai.com → API keys" },
  { id: "anthropic", name: "Anthropic", hint: "console.anthropic.com → API keys" },
  { id: "gemini", name: "Google Gemini", hint: "aistudio.google.com → Get API key" },
  { id: "openrouter", name: "OpenRouter", hint: "openrouter.ai → Keys" },
  { id: "groq", name: "Groq", hint: "console.groq.com → API Keys" },
  { id: "mistral", name: "Mistral", hint: "console.mistral.ai → API keys" },
  { id: "custom", name: "Custom (OpenAI-compatible)", hint: "Ollama, LM Studio, vLLM, gateways…" },
] as const;

export function SettingsView({
  user, credentials, onCredentialsChanged, onSignedOut,
}: {
  user: SessionUser;
  credentials: CredentialInfo[];
  onCredentialsChanged: () => void;
  onSignedOut: () => void;
}) {
  const { setSelection } = useYou();
  const [tab, setTab] = useState<"providers" | "profile" | "about">("providers");

  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ provider: "openai", label: "", apiKey: "", baseUrl: "" });
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function addCredential(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.addProvider({
        provider: form.provider,
        label: form.label.trim() || undefined,
        apiKey: form.apiKey.trim(),
        baseUrl: form.baseUrl.trim() || undefined,
      });
      onCredentialsChanged();
      setAddOpen(false);
      setForm({ provider: "openai", label: "", apiKey: "", baseUrl: "" });
      setNotice(
        res.validated
          ? `${res.provider.label} added and verified against the provider.`
          : `${res.provider.label} added, but verification failed: ${res.validationError ?? "unknown error"} — you can retry from the list.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the credential.");
    } finally {
      setBusy(false);
    }
  }

  async function removeCredential(id: string, label: string) {
    if (!confirm(`Delete credential “${label}”? Conversations stay; new messages need another provider.`)) return;
    await api.deleteProvider(id);
    const { selectedCredentialId } = useYou.getState();
    if (selectedCredentialId === id) setSelection(null, null);
    onCredentialsChanged();
  }

  async function revalidate(id: string) {
    setBusy(true);
    try {
      const res = await api.validateProvider(id);
      onCredentialsChanged();
      setNotice(res.ok ? "Credential verified ✓" : `Verification failed: ${res.error}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="you-scroll h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <header className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Providers, account, and about this build.</p>
        </header>

        <div className="mb-6 flex gap-1 rounded-xl border border-border bg-card p-1" role="tablist" aria-label="Settings sections">
          {([
            ["providers", "Providers"],
            ["profile", "Account"],
            ["about", "About"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                tab === id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {notice && (
          <div role="status" className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-primary/30 bg-accent px-4 py-3 text-sm">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">✕</button>
          </div>
        )}

        {tab === "providers" && (
          <section aria-label="Provider credentials">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Provider credentials (BYOK)</h2>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <ShieldCheck className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
                  Keys are encrypted with AES-256-GCM and only decrypted inside the server-side gateway.
                </p>
              </div>
              <Button size="sm" className="rounded-lg" onClick={() => { setAddOpen(true); setError(null); }}>
                <Plus className="mr-1 size-3.5" aria-hidden="true" /> Add
              </Button>
            </div>

            {credentials.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center">
                <KeyRound className="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
                <p className="mt-3 text-sm text-muted-foreground">
                  No providers yet. Until then, Chat runs on the offline demo brain.
                </p>
              </div>
            ) : (
              <ul className="space-y-2.5">
                {credentials.map((cred) => (
                  <li key={cred.id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <span className="font-mono text-xs text-muted-foreground">{cred.maskedKey}</span>
                      {cred.lastValidatedAt ? (
                        <Badge variant="outline" className="gap-1 text-[10px] text-primary">
                          <BadgeCheck className="size-3" aria-hidden="true" /> verified
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">unverified</Badge>
                      )}
                      <span className="flex-1" />
                      <Button variant="ghost" size="sm" className="h-7 rounded-lg text-xs" disabled={busy} onClick={() => revalidate(cred.id)}>
                        <RefreshCw className="mr-1 size-3" aria-hidden="true" /> Verify
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 rounded-lg text-xs text-destructive hover:text-destructive" onClick={() => removeCredential(cred.id, cred.label)}>
                        <Trash2 className="mr-1 size-3" aria-hidden="true" /> Remove
                      </Button>
                    </div>
                    <p className="mt-2 text-sm font-medium">{cred.label}</p>
                    {cred.baseUrl && <p className="mt-0.5 font-mono text-xs text-muted-foreground">{cred.baseUrl}</p>}
                    {cred.lastError && <p className="mt-1 text-xs text-destructive">{cred.lastError}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "profile" && (
          <section aria-label="Account" className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
                <User className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="font-medium">{user.name ?? "Workspace member"}</p>
                <p className="truncate text-sm text-muted-foreground">{user.email}</p>
              </div>
            </div>
            <div className="mt-5 border-t border-border/70 pt-5">
              <Button variant="outline" className="rounded-lg" onClick={async () => { await api.signout(); onSignedOut(); }}>
                Sign out
              </Button>
              <p className="mt-3 text-xs text-muted-foreground">
                Sessions are opaque tokens stored as httpOnly cookies; only their hash is kept server-side.
              </p>
            </div>
          </section>
        )}

        {tab === "about" && (
          <section aria-label="About" className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold text-foreground">YOU — open-source AI workspace</h2>
              <p className="mt-1.5">
                Foundation milestone: multi-user accounts, BYOK provider vault, live model discovery,
                streaming chat with persistence, and the offline demo brain.
              </p>
              <ul className="mt-3 space-y-1.5">
                <li>· Agent orchestration, research, knowledge, skills, automations: later milestones (honestly labeled in the sidebar).</li>
                <li>· Provider usage is billed by your chosen providers at their rates — YOU adds no markup.</li>
                <li>· Core code: Apache-2.0. Self-hosting and architecture docs live in the repository.</li>
              </ul>
            </div>
          </section>
        )}
      </div>

      {/* Add credential dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add provider credential</DialogTitle>
            <DialogDescription>
              The key is validated against the provider, then encrypted before storage. It is never
              shown again or sent to the browser.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addCredential} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="prov-select">Provider</Label>
              <Select value={form.provider} onValueChange={(v) => setForm((f) => ({ ...f, provider: v }))}>
                <SelectTrigger id="prov-select" className="rounded-lg" aria-label="Provider">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_OPTIONS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {PROVIDER_OPTIONS.find((p) => p.id === form.provider)?.hint}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prov-label">Label (optional)</Label>
              <Input
                id="prov-label"
                className="rounded-lg"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Work OpenAI"
                maxLength={60}
              />
            </div>
            {form.provider === "custom" && (
              <div className="space-y-1.5">
                <Label htmlFor="prov-base">Base URL</Label>
                <Input
                  id="prov-base"
                  className="rounded-lg font-mono text-sm"
                  value={form.baseUrl}
                  onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                  placeholder="http://localhost:11434/v1"
                  required
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="prov-key">API key</Label>
              <div className="relative">
                <Input
                  id="prov-key"
                  className="rounded-lg pr-10 font-mono text-sm"
                  type={showKey ? "text" : "password"}
                  value={form.apiKey}
                  onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                  placeholder={form.provider === "openai" ? "sk-…" : "paste your key"}
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                </button>
              </div>
            </div>
            {error && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" className="rounded-lg" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" className="rounded-lg" disabled={busy || !form.apiKey.trim()}>
                {busy && <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" />}
                Add & verify
              </Button>
            </DialogFooter>
          </form>
          <p className="text-[11px] text-muted-foreground">
            <ExternalLink className="mr-1 inline size-3" aria-hidden="true" />
            Get keys: {PROVIDER_OPTIONS.find((p) => p.id === form.provider)?.hint}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}
