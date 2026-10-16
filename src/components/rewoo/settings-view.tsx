"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import {
  BadgeCheck, CloudUpload, Database, ExternalLink, Eye, EyeOff, HardDriveDownload,
  KeyRound, Loader2, Monitor, Moon, Plus, RefreshCw, ShieldCheck, Sun, Trash2, User,
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
import {
  api, listDirectModels, type CredentialInfo, type SessionUser,
} from "@/lib/rewoo-client";
import { localKeys, type LocalCredential } from "@/lib/local-store";
import { useReWoo, type WorkspaceMode } from "@/lib/rewoo-store";
import { cn } from "@/lib/utils";

const PROVIDER_OPTIONS = [
  { id: "openai", name: "OpenAI", hint: "platform.openai.com → API keys" },
  { id: "anthropic", name: "Anthropic", hint: "console.anthropic.com → API keys" },
  { id: "gemini", name: "Google Gemini", hint: "aistudio.google.com → Get API key" },
  { id: "openrouter", name: "OpenRouter", hint: "openrouter.ai → Keys" },
  { id: "groq", name: "Groq", hint: "console.groq.com → API Keys" },
  { id: "mistral", name: "Mistral", hint: "console.mistral.ai → API keys" },
  { id: "custom", name: "Custom (OpenAI-compatible)", hint: "Ollama, LM Studio, vLLM, gateways…" },
] as const;

type Tab = "providers" | "appearance" | "account" | "about";

export function SettingsView({
  mode, user, credentials, localKeys: keyList, onCredentialsChanged,
  onLocalKeysChanged, onSignedOut, onOpenSetup,
}: {
  mode: WorkspaceMode;
  user: SessionUser | null;
  credentials: CredentialInfo[];
  localKeys: LocalCredential[];
  onCredentialsChanged: () => void;
  onLocalKeysChanged: () => void;
  onSignedOut: () => void;
  onOpenSetup: () => void;
}) {
  const { setSelection } = useReWoo();
  const [tab, setTab] = useState<Tab>("providers");

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
      if (mode === "local") {
        // Validate against the provider (via the stateless direct route),
        // then keep the key in this browser only.
        const key = form.apiKey.trim();
        const provider = form.provider;
        const baseUrl = form.baseUrl.trim() || undefined;
        let validationError: string | null = null;
        if (provider !== "custom") {
          try {
            const res = await listDirectModels({ provider, apiKey: key, baseUrl });
            validationError = res.error;
          } catch (err) {
            validationError = err instanceof Error ? err.message : "Verification failed.";
          }
        }
        const label = form.label.trim() || (PROVIDER_OPTIONS.find((p) => p.id === provider)?.name ?? provider);
        localKeys.add({ provider, label, apiKey: key, baseUrl: form.baseUrl.trim() || null });
        onLocalKeysChanged();
        setAddOpen(false);
        setForm({ provider: "openai", label: "", apiKey: "", baseUrl: "" });
        setNotice(
          validationError
            ? `${label} saved locally, but verification failed: ${validationError} — you can still try chatting.`
            : `${label} saved in this browser and verified against the provider.`
        );
      } else {
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
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add the key.");
    } finally {
      setBusy(false);
    }
  }

  async function removeCredential(id: string, label: string) {
    if (!confirm(`Delete key “${label}”? Conversations stay; new messages need another provider.`)) return;
    if (mode === "local") localKeys.remove(id);
    else await api.deleteProvider(id);
    const { selectedCredentialId } = useReWoo.getState();
    if (selectedCredentialId === id) setSelection(null, null);
    if (mode === "local") onLocalKeysChanged();
    else onCredentialsChanged();
  }

  async function revalidate(id: string) {
    setBusy(true);
    try {
      if (mode === "local") {
        const key = keyList.find((k) => k.id === id);
        if (!key) return;
        const res = await listDirectModels({ provider: key.provider, apiKey: key.apiKey, baseUrl: key.baseUrl ?? undefined });
        setNotice(res.error ? `Verification failed: ${res.error}` : "Key verified ✓");
      } else {
        const res = await api.validateProvider(id);
        onCredentialsChanged();
        setNotice(res.ok ? "Credential verified ✓" : `Verification failed: ${res.error}`);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Verification failed.");
    } finally {
      setBusy(false);
    }
  }

  function clearLocalData() {
    if (!confirm("Delete ALL local-mode data (keys + conversations) from this browser? This cannot be undone.")) return;
    window.localStorage.removeItem("rewoo.local.v1");
    setSelection(null, null);
    onLocalKeysChanged();
    setNotice("All local data cleared.");
  }

  return (
    <div className="rewoo-scroll h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <header className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mode === "local"
              ? "Local mode — keys and history live in this browser only."
              : "Providers, account, appearance, and about this build."}
          </p>
        </header>

        {mode === "local" && (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] leading-relaxed">
            <Database className="size-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
            <span className="min-w-0 flex-1 text-amber-700 dark:text-amber-300">
              This deployment has no database configured, so ReWoo is running in local mode.
              Set one up to unlock accounts, server-side encrypted keys, and cross-device sync.
            </span>
            <Button size="sm" variant="outline" className="rounded-lg" onClick={onOpenSetup}>
              <CloudUpload className="size-3.5" aria-hidden="true" /> Setup guide
            </Button>
          </div>
        )}

        <div className="mb-6 flex gap-1 rounded-xl border border-border bg-card p-1" role="tablist" aria-label="Settings sections">
          {([
            ["providers", "Providers"],
            ["appearance", "Appearance"],
            ["account", "Account"],
            ["about", "About"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn(
                "flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                tab === id ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
              )}
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

        {/* ── Providers ─────────────────────────────────────────────────────── */}
        {tab === "providers" && (
          <section aria-label="Provider keys">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold">Provider API keys</h2>
                <p className="mt-0.5 text-[13px] text-muted-foreground">
                  {mode === "local"
                    ? "Stored in this browser, sent only to ReWoo's own proxy per request — never saved server-side."
                    : "Validated, then encrypted (AES-256-GCM) before storage. Never returned by APIs."}
                </p>
              </div>
              <Button className="shrink-0 gap-2 rounded-xl" onClick={() => { setError(null); setAddOpen(true); }}>
                <Plus className="size-4" aria-hidden="true" /> Add key
              </Button>
            </div>

            <div className="overflow-hidden rounded-xl border border-border">
              {mode === "local" && keyList.length === 0 && <EmptyProviders />}
              {mode === "cloud" && credentials.length === 0 && <EmptyProviders />}
              {(mode === "local" ? keyList : credentials).map((c) => {
                const masked = "apiKey" in c
                  ? `${c.apiKey.slice(0, 3)}•••${c.apiKey.slice(-4)}`
                  : c.maskedKey;
                return (
                  <div key={c.id} className="flex flex-wrap items-center gap-3 border-b border-border/60 px-4 py-3 last:border-0">
                    <ShieldCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.label}</p>
                      <p className="truncate font-mono text-[11.5px] text-muted-foreground">{masked}</p>
                    </div>
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {c.provider}
                    </span>
                    <Button variant="ghost" size="icon" className="size-8 rounded-lg" disabled={busy} onClick={() => void revalidate(c.id)} aria-label="Re-validate key" title="Re-validate">
                      <RefreshCw className="size-3.5" aria-hidden="true" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8 rounded-lg text-muted-foreground hover:text-destructive" onClick={() => void removeCredential(c.id, c.label)} aria-label="Delete key" title="Delete">
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Appearance ────────────────────────────────────────────────────── */}
        {tab === "appearance" && <AppearanceTab />}

        {/* ── Account ───────────────────────────────────────────────────────── */}
        {tab === "account" && (
          <section aria-label="Account" className="space-y-4">
            {mode === "cloud" && user ? (
              <>
                <div className="flex items-center gap-4 rounded-xl border border-border px-4 py-4">
                  <span className="flex size-11 items-center justify-center rounded-full bg-primary/15 text-[15px] font-semibold text-primary" aria-hidden="true">
                    {(user.name ?? user.email).charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{user.name ?? "Account"}</p>
                    <p className="truncate text-[13px] text-muted-foreground">{user.email}</p>
                  </div>
                  <BadgeCheck className="size-5 shrink-0 text-emerald-500" aria-hidden="true" />
                </div>
                <Button variant="outline" className="gap-2 rounded-xl" onClick={async () => { await api.signout().catch(() => {}); onSignedOut(); }}>
                  <User className="size-4" aria-hidden="true" /> Sign out
                </Button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-4 rounded-xl border border-border px-4 py-4">
                  <span className="flex size-11 items-center justify-center rounded-full bg-primary/15" aria-hidden="true">
                    <KeyRound className="size-5 text-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">Guest · Local mode</p>
                    <p className="text-[13px] text-muted-foreground">No account — data never leaves this browser.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" className="gap-2 rounded-xl" onClick={onOpenSetup}>
                    <CloudUpload className="size-4" aria-hidden="true" /> Enable accounts (setup guide)
                  </Button>
                  <Button variant="outline" className="gap-2 rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10" onClick={clearLocalData}>
                    <HardDriveDownload className="size-4" aria-hidden="true" /> Clear local data
                  </Button>
                </div>
              </>
            )}
          </section>
        )}

        {/* ── About ─────────────────────────────────────────────────────────── */}
        {tab === "about" && (
          <section aria-label="About" className="space-y-4 text-sm leading-relaxed">
            <div className="rounded-xl border border-border px-4 py-4">
              <h2 className="text-[15px] font-semibold">ReWoo — open-source AI workspace</h2>
              <ul className="mt-2 space-y-1.5 text-[13px] text-muted-foreground">
                <li>· Multi-provider BYOK gateway: OpenAI, Anthropic, Gemini, OpenRouter, Groq, Mistral, custom OpenAI-compatible endpoints.</li>
                <li>· Streaming chat with usage accounting, markdown + syntax highlighting.</li>
                <li>· Local mode for zero-config deployments; cloud mode with accounts when a database is configured.</li>
                <li>· Apache-2.0 licensed. UX patterns inspired by Open WebUI, LibreChat, and LobeChat (see THIRD_PARTY_NOTICES).</li>
                <li>· Provider usage is billed by your chosen providers at their rates — ReWoo adds no markup.</li>
              </ul>
            </div>
          </section>
        )}
      </div>

      {/* ── Add key dialog ───────────────────────────────────────────────────── */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add provider key</DialogTitle>
            <DialogDescription>
              {mode === "local"
                ? "The key is verified against the provider, then saved in this browser only. It is sent to ReWoo's own proxy per request and never stored server-side."
                : "The key is validated against the provider, then encrypted before storage. It is never displayed again."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={addCredential} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="provider">Provider</Label>
              <Select value={form.provider} onValueChange={(v) => setForm((f) => ({ ...f, provider: v }))}>
                <SelectTrigger id="provider" className="rounded-lg"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROVIDER_OPTIONS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{PROVIDER_OPTIONS.find((p) => p.id === form.provider)?.hint}</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="label">Label <span className="text-muted-foreground">(optional)</span></Label>
              <Input
                id="label" className="rounded-lg" placeholder="e.g. Personal" maxLength={60}
                value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="apiKey">API key</Label>
              <div className="relative">
                <Input
                  id="apiKey" className="rounded-lg pr-10 font-mono text-[13px]" required
                  type={showKey ? "text" : "password"} autoComplete="off"
                  placeholder={form.provider === "openai" ? "sk-…" : "paste your key"}
                  value={form.apiKey} onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                />
                <button
                  type="button" onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                  aria-label={showKey ? "Hide key" : "Show key"}
                >
                  {showKey ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
                </button>
              </div>
            </div>
            {form.provider === "custom" && (
              <div className="grid gap-2">
                <Label htmlFor="baseUrl">Base URL</Label>
                <Input
                  id="baseUrl" className="rounded-lg font-mono text-[13px]" required
                  placeholder="http://localhost:11434/v1"
                  value={form.baseUrl} onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                />
              </div>
            )}
            {error && <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-[13px] text-destructive" role="alert">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="ghost" className="rounded-lg" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button type="submit" className="rounded-lg gap-2" disabled={busy || !form.apiKey.trim() || (form.provider === "custom" && !form.baseUrl.trim())}>
                {busy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                {mode === "local" ? "Verify & save locally" : "Verify & save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptyProviders() {
  return (
    <div className="px-4 py-8 text-center">
      <KeyRound className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
      <p className="mt-2 text-sm font-medium">No providers yet</p>
      <p className="mt-1 text-[13px] text-muted-foreground">Until then, Chat runs on the offline demo brain.</p>
    </div>
  );
}

function AppearanceTab() {
  const { theme, setTheme } = useTheme();
  const options = [
    { id: "light", label: "Light", icon: Sun },
    { id: "dark", label: "Dark", icon: Moon },
    { id: "system", label: "System", icon: Monitor },
  ] as const;
  return (
    <section aria-label="Appearance">
      <h2 className="text-[15px] font-semibold">Theme</h2>
      <p className="mt-0.5 text-[13px] text-muted-foreground">Choose how ReWoo looks. System follows your OS preference.</p>
      <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Theme">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={theme === o.id}
            onClick={() => setTheme(o.id)}
            className={cn(
              "flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-[13px] font-medium transition-colors",
              theme === o.id ? "border-primary/60 bg-accent text-accent-foreground" : "border-border text-muted-foreground hover:border-ring/40 hover:text-foreground"
            )}
          >
            <o.icon className="size-5" aria-hidden="true" />
            {o.label}
          </button>
        ))}
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-[12px] text-muted-foreground">
        <ExternalLink className="size-3" aria-hidden="true" />
        Tip: toggle anytime from the sidebar.
      </p>
    </section>
  );
}
