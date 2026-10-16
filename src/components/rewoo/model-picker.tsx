"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronsUpDown, KeyRound, Loader2, Search, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  api, listDirectModels, type CredentialInfo, type ModelInfo,
} from "@/lib/rewoo-client";
import { localFallbackModels, type LocalCredential } from "@/lib/local-store";
import { PROVIDERS, type ProviderId } from "@/lib/providers";
import type { WorkspaceMode } from "@/lib/rewoo-store";
import { cn } from "@/lib/utils";

interface PickerProps {
  mode: WorkspaceMode;
  credentials: CredentialInfo[]; // cloud mode
  localKeys: LocalCredential[];  // local mode
  selectedCredentialId: string | null;
  selectedModel: string | null;
  onSelect: (credentialId: string | null, model: string | null) => void;
  onOpenSettings: () => void;
}

/** One entry per connected key: server credential (cloud) or local key (local). */
interface KeyEntry {
  id: string;
  provider: ProviderId;
  label: string;
  baseUrl: string | null;
  apiKey?: string; // local mode only
}

/**
 * Model picker — provider sections with live discovery (per key), searchable,
 * with clearly-labeled offline fallback lists. Mirrors the selector patterns
 * of Open WebUI / LibreChat / LobeChat.
 */
export function ModelPicker({
  mode, credentials, localKeys, selectedCredentialId, selectedModel, onSelect, onOpenSettings,
}: PickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loadingKeyId, setLoadingKeyId] = useState<string | null>(null);
  const [discovered, setDiscovered] = useState<Record<string, { models: ModelInfo[]; source: "live" | "fallback" }>>({});

  const entries: KeyEntry[] = useMemo(
    () =>
      mode === "local"
        ? localKeys.map((k) => ({ id: k.id, provider: k.provider as ProviderId, label: k.label, baseUrl: k.baseUrl, apiKey: k.apiKey }))
        : credentials.map((c) => ({ id: c.id, provider: c.provider as ProviderId, label: c.label, baseUrl: c.baseUrl })),
    [mode, localKeys, credentials]
  );

  const selectedEntry = entries.find((e) => e.id === selectedCredentialId) ?? null;

  // Lazy discovery: load models for a key the first time the picker opens
  // (or whenever its id changes), cached per key id.
  useEffect(() => {
    if (!open) return;
    const missing = entries.filter((e) => !discovered[e.id]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const entry of missing) {
        if (cancelled) return;
        setLoadingKeyId(entry.id);
        try {
          if (mode === "local" && entry.apiKey) {
            const res = await listDirectModels({
              provider: entry.provider,
              apiKey: entry.apiKey,
              baseUrl: entry.baseUrl ?? undefined,
            });
            if (res.models.length > 0) {
              if (!cancelled) setDiscovered((d) => ({ ...d, [entry.id]: { models: res.models, source: "live" } }));
              continue;
            }
          } else if (mode === "cloud") {
            const res = await api.listModels(entry.id);
            if (res.models.length > 0) {
              if (!cancelled) setDiscovered((d) => ({ ...d, [entry.id]: { models: res.models, source: res.source } }));
              continue;
            }
          }
          if (!cancelled) {
            setDiscovered((d) => ({ ...d, [entry.id]: { models: localFallbackModels(entry.provider), source: "fallback" } }));
          }
        } catch {
          if (!cancelled) {
            setDiscovered((d) => ({ ...d, [entry.id]: { models: localFallbackModels(entry.provider), source: "fallback" } }));
          }
        }
      }
      if (!cancelled) setLoadingKeyId(null);
    })();
    return () => { cancelled = true; };
     
  }, [open, entries.map((e) => e.id).join(","), mode]);

  const q = query.trim().toLowerCase();
  const visibleSections = entries.map((entry) => {
    const d = discovered[entry.id];
    const models = (d?.models ?? []).filter(
      (m) => !q || m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q)
    );
    return { entry, models, source: d?.source, loading: loadingKeyId === entry.id };
  });

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 max-w-[240px] gap-1.5 rounded-lg px-2 text-[13px] font-normal text-muted-foreground hover:text-foreground"
          aria-label="Select model"
        >
          {selectedEntry && selectedModel ? (
            <>
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: PROVIDERS[selectedEntry.provider]?.accent ?? "#64748b" }}
                aria-hidden="true"
              />
              <span className="truncate">{selectedModel}</span>
            </>
          ) : (
            <>
              <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Demo brain</span>
            </>
          )}
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[340px] overflow-hidden p-0" sideOffset={8}>
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models…"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
            aria-label="Search models"
          />
        </div>

        <div className="rewoo-scroll max-h-[320px] overflow-y-auto p-1.5">
          {/* Demo brain — always available */}
          <button
            type="button"
            onClick={() => { onSelect(null, null); setOpen(false); }}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-accent",
              !selectedCredentialId && "bg-accent font-medium"
            )}
          >
            <Sparkles className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="flex-1">Demo brain</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">offline</span>
          </button>

          {visibleSections.map(({ entry, models, source, loading }) => (
            <div key={entry.id} className="mt-1">
              <div className="flex items-center gap-2 px-2.5 pb-1 pt-2">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: PROVIDERS[entry.provider]?.accent ?? "#64748b" }}
                  aria-hidden="true"
                />
                <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  {PROVIDERS[entry.provider]?.name ?? entry.provider}
                </span>
                <span className="truncate text-[11px] text-muted-foreground/70">{entry.label}</span>
                {loading && <Loader2 className="size-3 animate-spin text-muted-foreground" aria-hidden="true" />}
                {source === "fallback" && !loading && (
                  <span className="ml-auto rounded-full border border-border px-1.5 py-px text-[9px] uppercase tracking-wide text-muted-foreground/80">
                    offline list
                  </span>
                )}
              </div>
              {models.length === 0 && !loading && q && (
                <p className="px-2.5 pb-1 text-[12px] text-muted-foreground">No models match “{query}”.</p>
              )}
              {models.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => { onSelect(entry.id, m.id); setOpen(false); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors hover:bg-accent",
                    selectedCredentialId === entry.id && selectedModel === m.id && "bg-accent font-medium"
                  )}
                >
                  <Zap className="size-3 shrink-0 text-muted-foreground/60" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{m.id}</span>
                    {m.label !== m.id && (
                      <span className="block truncate text-[11px] text-muted-foreground">{m.label}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ))}

          {entries.length === 0 && (
            <div className="px-2.5 py-4 text-center">
              <KeyRound className="mx-auto size-5 text-muted-foreground" aria-hidden="true" />
              <p className="mt-2 text-[13px] font-medium">No provider connected</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                Add an API key to talk to live models — or use the demo brain.
              </p>
              <Button size="sm" className="mt-3 rounded-lg" onClick={() => { setOpen(false); onOpenSettings(); }}>
                Add a key in Settings
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
