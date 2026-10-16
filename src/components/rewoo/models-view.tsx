"use client";

import { useEffect, useState } from "react";
import { Box, ChevronDown, Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api, type CredentialInfo, type ModelInfo } from "@/lib/rewoo-client";
import { cn } from "@/lib/utils";
import { useReWoo } from "@/lib/rewoo-store";

interface ModelsRow {
  credentialId: string;
  loading: boolean;
  error: string | null;
  source: "live" | "fallback";
  models: ModelInfo[];
}

export function ModelsView({ credentials, onOpenSettings }: { credentials: CredentialInfo[]; onOpenSettings: () => void }) {
  const { selectedCredentialId, selectedModel, setSelection } = useReWoo();
  const [rows, setRows] = useState<Record<string, ModelsRow>>({});
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<string | null>(selectedCredentialId ?? credentials[0]?.id ?? null);

  async function load(cred: CredentialInfo, force = false) {
    if (!force && rows[cred.id]?.models.length) return;
    setRows((r) => ({ ...r, [cred.id]: { credentialId: cred.id, loading: true, error: null, source: "live", models: r[cred.id]?.models ?? [] } }));
    try {
      const res = await api.listModels(cred.id);
      setRows((r) => ({
        ...r,
        [cred.id]: { credentialId: cred.id, loading: false, error: res.error, source: res.source, models: res.models },
      }));
    } catch (err) {
      setRows((r) => ({
        ...r,
        [cred.id]: { credentialId: cred.id, loading: false, error: err instanceof Error ? err.message : "Failed", source: "fallback", models: [] },
      }));
    }
  }

  useEffect(() => {
    for (const cred of credentials) load(cred);
  }, [credentials.length]);

  if (credentials.length === 0) {
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
          {credentials.map((cred) => {
            const row = rows[cred.id];
            const isOpen = expanded === cred.id;
            const models = (row?.models ?? []).filter(
              (m) => !q || m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q)
            );
            return (
              <section key={cred.id} className="overflow-hidden rounded-xl border border-border bg-card">
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(isOpen ? null : cred.id);
                    load(cred);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
                  aria-expanded={isOpen}
                >
                  <span className="size-2.5 rounded-[4px]" style={{ background: accentFor(cred.provider) }} aria-hidden="true" />
                  <span className="flex-1 font-medium">{cred.label}</span>
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
                        <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" /> Fetching models from {cred.label}…
                      </div>
                    ) : row?.error && models.length === 0 ? (
                      <div className="px-4 py-5 text-sm text-muted-foreground">
                        <p className="text-destructive">{row.error}</p>
                        <Button variant="outline" size="sm" className="mt-3 rounded-lg" onClick={() => load(cred, true)}>
                          <RefreshCw className="mr-1.5 size-3.5" aria-hidden="true" /> Retry
                        </Button>
                      </div>
                    ) : (
                      <ul className="divide-y divide-border/60">
                        {models.map((m) => {
                          const selected = selectedCredentialId === cred.id && selectedModel === m.id;
                          return (
                            <li key={m.id}>
                              <button
                                type="button"
                                onClick={() => setSelection(cred.id, m.id)}
                                className={cn(
                                  "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent/50",
                                  selected && "bg-accent"
                                )}
                              >
                                <span className="min-w-0 flex-1 truncate font-mono text-sm">{m.id}</span>
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
