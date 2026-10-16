"use client";

import { useEffect, useState } from "react";
import { Box, ChevronDown, Loader2, RefreshCw, Search, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api, listDirectModels, type CredentialInfo, type ModelInfo } from "@/lib/rewoo-client";
import { localFallbackModels, type LocalCredential } from "@/lib/local-store";
import { cn } from "@/lib/utils";
import { useReWoo, type WorkspaceMode } from "@/lib/rewoo-store";

/** Light mirror of the server-side tier heuristic (src/lib/providers.ts). */
function tierOf(id: string): "fast" | "powerful" | null {
  const m = id.toLowerCase();
  if (/(?<![a-z0-9])(mini|flash|haiku|instant|nano|small|lite|8b)(?![a-z0-9])/.test(m)) return "fast";
  if (/(?<![a-z0-9])(gpt-5|gpt-4\.1|gpt-4o|o[1-4](?!\d)|opus|ultra|max|large|70b|405b)(?![a-z0-9])/.test(m) ||
      /claude-(sonnet|opus)-[4-9]/.test(m) || /gemini-[2-9]\.[5-9]/.test(m)) return "powerful";
  return null;
}

interface ModelsRow {
  credentialId: string;
  loading: boolean;
  error: string | null;
  source: "live" | "fallback";
  models: ModelInfo[];
}

export function ModelsView({
  mode, credentials, localKeys, onOpenSettings,
}: {
  mode: WorkspaceMode;
  credentials: CredentialInfo[];
  localKeys: LocalCredential[];
  onOpenSettings: () => void;
}) {
  const { selectedCredentialId, selectedModel, setSelection } = useReWoo();
  const [rows, setRows] = useState<Record<string, ModelsRow>>({});
  const [query, setQuery] = useState("");

  // Unified entry list: server credentials (cloud) or local keys (local mode).
  const entries = (mode === "local" ? localKeys : credentials).map((c) => ({
    id: c.id,
    provider: c.provider,
    label: c.label,
    key: "apiKey" in c ? c.apiKey : undefined,
    baseUrl: c.baseUrl,
  }));
  const [expanded, setExpanded] = useState<string | null>(selectedCredentialId ?? entries[0]?.id ?? null);

  async function load(entry: { id: string; provider: string; label: string; key?: string; baseUrl: string | null }, force = false) {
    if (!force && rows[entry.id]?.models.length) return;
    setRows((r) => ({ ...r, [entry.id]: { credentialId: entry.id, loading: true, error: null, source: "live", models: r[entry.id]?.models ?? [] } }));
    try {
      if (mode === "local" && entry.key) {
        const res = await listDirectModels({ provider: entry.provider, apiKey: entry.key, baseUrl: entry.baseUrl ?? undefined });
        setRows((r) => ({
          ...r,
          [entry.id]: {
            credentialId: entry.id,
            loading: false,
            error: res.error,
            source: res.models.length ? "live" : "fallback",
            models: res.models.length ? res.models : localFallbackModels(entry.provider),
          },
        }));
      } else {
        const res = await api.listModels(entry.id);
        setRows((r) => ({
          ...r,
          [entry.id]: { credentialId: entry.id, loading: false, error: res.error, source: res.source, models: res.models },
        }));
      }
    } catch (err) {
      setRows((r) => ({
        ...r,
        [entry.id]: { credentialId: entry.id, loading: false, error: err instanceof Error ? err.message : "Failed", source: "fallback", models: localFallbackModels(entry.provider) },
      }));
    }
  }

  useEffect(() => {
    for (const entry of entries) load(entry);
     
  }, [entries.map((e) => e.id).join(",")]);

  if (entries.length === 0) {
    return (
      <div className="rewoo-scroll h-full overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-16 text-center">
          <Box className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
          <h1 className="mt-5 text-xl font-semibold">No providers connected</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Model discovery reads live catalogs from your connected providers. Add a provider
            credential in Settings to browse its models here.
          </p>
          <Button className="mt-6 rounded-xl" onClick={onOpenSettings}>Open Settings → Providers</Button>
        </div>
      </div>
    );
  }

  const q = query.toLowerCase();

  return (
    <div className="rewoo-scroll h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8">
        <header className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight">Models</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Live catalogs fetched from your providers — no stale hardcoded lists. Click a model to
            use it in Chat.
          </p>
        </header>

        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search across all providers…"
            className="rounded-xl pl-9"
            aria-label="Search models"
          />
        </div>

        <div className="space-y-3">
          {entries.map((entry) => {
            const row = rows[entry.id];
            const isOpen = expanded === entry.id;
            const models = (row?.models ?? []).filter(
              (m) => !q || m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q)
            );
            return (
              <section key={entry.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(isOpen ? null : entry.id);
                    load(entry);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
                  aria-expanded={isOpen}
                >
                  <span className="size-2.5 rounded-[4px]" style={{ background: accentFor(entry.provider) }} aria-hidden="true" />
                  <span className="flex-1 font-medium">{entry.label}</span>
                  {row?.source === "fallback" && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">fallback</Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {row?.loading ? "loading…" : `${models.length} models`}
                  </span>
                  <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
                </button>
                {isOpen && (
                  <div className="border-t border-border/70">
                    {row?.loading ? (
                      <div className="flex items-center justify-center py-8 text-muted-foreground">
                        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> Fetching models from {entry.label}…
                      </div>
                    ) : row?.error && models.length === 0 ? (
                      <div className="px-4 py-5 text-sm text-muted-foreground">
                        <p className="text-destructive">{row.error}</p>
                        <Button variant="outline" size="sm" className="mt-3 rounded-lg" onClick={() => load(entry, true)}>
                          <RefreshCw className="mr-1.5 size-3.5" aria-hidden="true" /> Retry
                        </Button>
                      </div>
                    ) : (
                      <ul className="divide-y divide-border/60">
                        {models.map((m) => {
                          const selected = selectedCredentialId === entry.id && selectedModel === m.id;
                          const tier = tierOf(m.id);
                          return (
                            <li key={m.id}>
                              <button
                                type="button"
                                onClick={() => setSelection(entry.id, m.id)}
                                className={cn(
                                  "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/50",
                                  selected && "bg-accent"
                                )}
                              >
                                <span className="min-w-0 flex-1 truncate font-mono text-sm">{m.id}</span>
                                {tier === "fast" && (
                                  <Badge variant="outline" className="shrink-0 gap-1 text-[10px] text-muted-foreground">
                                    <Zap className="size-2.5" aria-hidden="true" /> fast &amp; affordable
                                  </Badge>
                                )}
                                {tier === "powerful" && (
                                  <Badge variant="outline" className="shrink-0 gap-1 text-[10px] text-primary">
                                    <Sparkles className="size-2.5" aria-hidden="true" /> flagship
                                  </Badge>
                                )}
                                {m.contextWindow ? (
                                  <span className="shrink-0 text-xs text-muted-foreground">{(m.contextWindow / 1000).toFixed(0)}k ctx</span>
                                ) : null}
                                {m.source === "fallback" && (
                                  <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">cached</Badge>
                                )}
                                {selected && <Badge className="shrink-0 text-[10px]">In use</Badge>}
                              </button>
                            </li>
                          );
                        })}
                        {models.length === 0 && (
                          <li className="px-4 py-5 text-sm text-muted-foreground">No models match “{query}”.</li>
                        )}
                      </ul>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function accentFor(provider: string): string {
  switch (provider) {
    case "openai": return "#10a37f";
    case "anthropic": return "#d97757";
    case "gemini": return "#4285f4";
    case "openrouter": return "#8b5cf6";
    case "groq": return "#f55036";
    case "mistral": return "#fa520f";
    default: return "#64748b";
  }
}
