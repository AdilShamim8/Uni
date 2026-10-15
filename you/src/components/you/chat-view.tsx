"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BrainCircuit, ChevronDown, Copy, MessageSquarePlus, Pencil, RefreshCw,
  SendHorizonal, Square, Trash2, User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import {
  api, streamChatTurn, type ChatEvent, type ConversationInfo,
  type CredentialInfo, type MessageInfo, type ModelInfo,
} from "@/lib/you-client";
import { useYou } from "@/lib/you-store";
import { cn } from "@/lib/utils";
import { Markdown, StreamingDots } from "./markdown";
import { YouMark } from "./logo";

interface ChatProps {
  credentials: CredentialInfo[];
  conversations: ConversationInfo[];
  activeId: string | null;
  onConversationsChanged: () => void;
  onSelectConversation: (id: string | null) => void;
  onOpenSettings: () => void;
}

export function ChatView({
  credentials, conversations, activeId, onConversationsChanged,
  onSelectConversation, onOpenSettings,
}: ChatProps) {
  const { selectedCredentialId, selectedModel, setSelection } = useYou();
  const [messages, setMessages] = useState<MessageInfo[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [usage, setUsage] = useState<{ promptTokens: number; completionTokens: number } | null>(null);

  const [modelList, setModelList] = useState<ModelInfo[]>([]);
  const [modelListSource, setModelListSource] = useState<"live" | "fallback">("live");
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const streamHandle = useRef<ReturnType<typeof streamChatTurn> | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;
  const activeCredential = credentials.find((c) => c.id === selectedCredentialId) ?? null;

  // ── Load messages when the active conversation changes ────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeId) {
        if (!cancelled) setMessages([]);
        return;
      }
      try {
        const { conversation } = await api.getConversation(activeId);
        if (!cancelled) {
          setMessages(conversation.messages);
          setUsage(null);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load conversation.");
      }
    })();
    return () => { cancelled = true; };
  }, [activeId]);

  // ── Model discovery for the selected credential ───────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedCredentialId) {
        if (!cancelled) setModelList([]);
        return;
      }
      try {
        const res = await api.listModels(selectedCredentialId);
        if (cancelled) return;
        setModelList(res.models);
        setModelListSource(res.source);
        // Keep a valid selection
        if (selectedModel && !res.models.some((m) => m.id === selectedModel)) {
          setSelection(selectedCredentialId, res.models[0]?.id ?? null);
        }
      } catch {
        if (!cancelled) setModelList([]);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedCredentialId, selectedModel, setSelection]);

  // ── Auto-scroll while streaming ───────────────────────────────────────────
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streamText, streaming]);

  const startConversation = useCallback(
    async (firstMessage?: string): Promise<string | null> => {
      const { conversation } = await api.createConversation();
      onConversationsChanged();
      onSelectConversation(conversation.id);
      if (firstMessage) {
        await api.createConversation(); // no-op guard for typing
      }
      return conversation.id;
    },
    [onConversationsChanged, onSelectConversation]
  );

  // ── Send / regenerate ─────────────────────────────────────────────────────
  const runTurn = useCallback(
    async (opts: { message?: string; regenerate?: boolean; conversationId: string }) => {
      setStreaming(true);
      setStreamText("");
      setError(null);
      setUsage(null);

      const handle = streamChatTurn(
        {
          conversationId: opts.conversationId,
          credentialId: selectedCredentialId,
          model: selectedModel ?? "demo-brain",
          message: opts.message ?? "",
          regenerate: opts.regenerate ?? false,
        },
        (ev: ChatEvent) => {
          if (ev.type === "delta") setStreamText((t) => t + ev.text);
          else if (ev.type === "usage") setUsage({ promptTokens: ev.promptTokens, completionTokens: ev.completionTokens });
          else if (ev.type === "error") setError(ev.message);
          else if (ev.type === "done") {
            setStreaming(false);
            streamHandle.current = null;
            if (ev.assistantMessage || ev.userMessage) {
              // Reload full thread from the source of truth
              api
                .getConversation(opts.conversationId)
                .then(({ conversation }) => setMessages(conversation.messages))
                .catch(() => {});
              onConversationsChanged();
            } else if (!error) {
              // Turn produced nothing persisted (e.g. cancelled) — refresh anyway
              api
                .getConversation(opts.conversationId)
                .then(({ conversation }) => setMessages(conversation.messages))
                .catch(() => {});
            }
            setStreamText("");
          }
        }
      );
      streamHandle.current = handle;
      await handle.done.catch(() => {});
    },
    [selectedCredentialId, selectedModel, onConversationsChanged, error]
  );

  async function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    let convId = activeId;
    if (!convId) {
      const created = await startConversation();
      if (!created) return;
      convId = created;
    }
    await runTurn({ message: text, conversationId: convId });
    composerRef.current?.focus();
  }

  async function regenerate() {
    if (!activeId || streaming) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;
    await runTurn({ regenerate: true, conversationId: activeId });
  }

  function stop() {
    streamHandle.current?.cancel();
    setStreaming(false);
    setStreamText((t) => t || "");
  }

  async function deleteConversation() {
    if (!activeId) return;
    await api.deleteConversation(activeId);
    onSelectConversation(null);
    onConversationsChanged();
  }

  async function commitRename() {
    if (!activeId) return;
    const title = renameValue.trim();
    setRenaming(false);
    if (title && title !== activeConversation?.title) {
      await api.updateConversation(activeId, { title });
      onConversationsChanged();
    }
  }

  const filteredModels = modelList.filter((m) =>
    m.id.toLowerCase().includes(modelQuery.toLowerCase()) ||
    m.label.toLowerCase().includes(modelQuery.toLowerCase())
  );

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!activeId && messages.length === 0) {
    return (
      <EmptyChatState
        credentials={credentials}
        activeCredential={activeCredential}
        selectedModel={selectedModel}
        onCreate={() => startConversation()}
        onOpenSettings={onOpenSettings}
        modelPicker={
          <ModelPickerButton
            credentials={credentials}
            activeCredential={activeCredential}
            selectedModel={selectedModel}
            modelList={modelList}
            modelListSource={modelListSource}
            open={modelPickerOpen}
            onOpenChange={setModelPickerOpen}
            query={modelQuery}
            onQuery={setModelQuery}
            filteredModels={filteredModels}
            onPick={(cid, mid) => {
              setSelection(cid, mid);
              setModelPickerOpen(false);
            }}
            compact={false}
          />
        }
        composer={
          <Composer
            input={input}
            setInput={setInput}
            streaming={streaming}
            onSend={send}
            onStop={stop}
            modelPicker={
              <ModelPickerButton
                credentials={credentials}
                activeCredential={activeCredential}
                selectedModel={selectedModel}
                modelList={modelList}
                modelListSource={modelListSource}
                open={modelPickerOpen}
                onOpenChange={setModelPickerOpen}
                query={modelQuery}
                onQuery={setModelQuery}
                filteredModels={filteredModels}
                onPick={(cid, mid) => {
                  setSelection(cid, mid);
                  setModelPickerOpen(false);
                }}
                compact={false}
              />
            }
          />
        }
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-background/80 px-4 py-2.5 backdrop-blur-sm sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {renaming ? (
            <Input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              className="h-8 max-w-72"
              aria-label="Conversation title"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                setRenaming(true);
                setRenameValue(activeConversation?.title ?? "");
              }}
              className="group flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-medium transition-colors hover:bg-accent"
              title="Rename"
            >
              <span className="truncate">{activeConversation?.title ?? "New conversation"}</span>
              <Pencil className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
            </button>
          )}
          {!selectedCredentialId && (
            <Badge variant="outline" className="shrink-0 gap-1 border-primary/40 text-primary">
              <BrainCircuit className="size-3" aria-hidden="true" /> Demo brain
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => startConversation()} title="New conversation" aria-label="New conversation">
            <MessageSquarePlus className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={regenerate} disabled={streaming || messages.length === 0} title="Regenerate last response" aria-label="Regenerate">
            <RefreshCw className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={deleteConversation} title="Delete conversation" aria-label="Delete conversation">
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="you-scroll min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-7">
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className="flex gap-3.5"
              >
                <MessageAvatar role={m.role} demo={m.demo} />
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {m.role === "user" ? "You" : m.demo ? "Demo brain" : "Assistant"}
                    </span>
                    {m.model && !m.demo && <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px]">{m.model}</span>}
                  </div>
                  {m.role === "user" ? (
                    <div className="rounded-xl rounded-tl-sm border border-border bg-secondary/60 px-4 py-3 text-[0.94rem] leading-relaxed whitespace-pre-wrap">
                      {m.content}
                    </div>
                  ) : (
                    <Markdown>{m.content}</Markdown>
                  )}
                  {m.completionTokens != null && m.completionTokens > 0 && (
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {m.promptTokens ?? 0} in · {m.completionTokens} out
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Streaming bubble */}
          {streaming && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex gap-3.5">
              <MessageAvatar role="assistant" demo={!selectedCredentialId} />
              <div className="min-w-0 flex-1">
                <div className="mb-1 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {!selectedCredentialId ? "Demo brain" : "Assistant"}
                  </span>
                </div>
                {streamText ? <Markdown>{streamText}</Markdown> : <StreamingDots />}
              </div>
            </motion.div>
          )}

          {error && (
            <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="border-t border-border/70 bg-background/80 px-4 pb-4 pt-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto max-w-3xl">
          <Composer
            input={input}
            setInput={setInput}
            streaming={streaming}
            onSend={send}
            onStop={stop}
            modelPicker={
              <ModelPickerButton
                credentials={credentials}
                activeCredential={activeCredential}
                selectedModel={selectedModel}
                modelList={modelList}
                modelListSource={modelListSource}
                open={modelPickerOpen}
                onOpenChange={setModelPickerOpen}
                query={modelQuery}
                onQuery={setModelQuery}
                filteredModels={filteredModels}
                onPick={(cid, mid) => {
                  setSelection(cid, mid);
                  setModelPickerOpen(false);
                }}
                compact
              />
            }
          />
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            {selectedCredentialId
              ? `${activeCredential?.label ?? "Provider"} · ${selectedModel ?? "select a model"}${usage ? ` · last turn: ${usage.promptTokens}+${usage.completionTokens} tokens` : ""}`
              : "Demo brain active — add a provider key in Settings for live models."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function MessageAvatar({ role, demo }: { role: string; demo?: boolean }) {
  if (role === "user") {
    return (
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-secondary" aria-hidden="true">
        <User className="size-3.5 text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", demo ? "bg-muted" : "bg-primary text-primary-foreground")} aria-hidden="true">
      <YouMark size={28} className={demo ? "bg-transparent text-muted-foreground" : ""} />
    </div>
  );
}

function Composer({
  input, setInput, streaming, onSend, onStop, modelPicker,
}: {
  input: string;
  setInput: (v: string) => void;
  streaming: boolean;
  onSend: () => void;
  onStop: () => void;
  modelPicker: React.ReactNode;
}) {
  return (
    <div className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2.5 shadow-sm focus-within:border-ring/60">
      {modelPicker}
      <textarea
        ref={(el) => { if (el) el.dataset.youComposer = "1"; }}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
        rows={1}
        placeholder="Message the workspace… (Shift+Enter for a new line)"
        aria-label="Message"
        className="you-scroll max-h-44 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-[0.94rem] leading-relaxed outline-none placeholder:text-muted-foreground"
        style={{ height: Math.min(Math.max(input.split("\n").length * 24 + 12, 36), 176) }}
      />
      {streaming ? (
        <Button size="icon" className="size-9 shrink-0 rounded-xl" variant="secondary" onClick={onStop} title="Stop generating" aria-label="Stop generating">
          <Square className="size-3.5 fill-current" aria-hidden="true" />
        </Button>
      ) : (
        <Button size="icon" className="size-9 shrink-0 rounded-xl" onClick={onSend} disabled={!input.trim()} title="Send" aria-label="Send">
          <SendHorizonal className="size-4" aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}

function ModelPickerButton({
  credentials, activeCredential, selectedModel, modelList, modelListSource,
  open, onOpenChange, query, onQuery, filteredModels, onPick, compact,
}: {
  credentials: CredentialInfo[];
  activeCredential: CredentialInfo | null;
  selectedModel: string | null;
  modelList: ModelInfo[];
  modelListSource: "live" | "fallback";
  open: boolean;
  onOpenChange: (v: boolean) => void;
  query: string;
  onQuery: (v: string) => void;
  filteredModels: ModelInfo[];
  onPick: (credentialId: string | null, model: string | null) => void;
  compact: boolean;
}) {
  return (
    <Popover open={open} onOpenChange={(v) => { onOpenChange(v); if (v) onQuery(""); }}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          className={cn("h-9 shrink-0 rounded-xl text-xs font-normal", compact && "max-w-44 px-2.5")}
          title="Select provider and model"
        >
          <span className="truncate">
            {activeCredential ? activeCredential.label : "Demo"}
            {selectedModel ? ` · ${selectedModel}` : ""}
          </span>
          <ChevronDown className="ml-0.5 size-3.5 shrink-0 opacity-60" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 rounded-xl p-0" side="top">
        <div className="you-scroll max-h-96 overflow-y-auto p-1.5">
          <button
            type="button"
            onClick={() => onPick(null, null)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
          >
            <BrainCircuit className="size-4 text-primary" aria-hidden="true" />
            <span className="flex-1">Demo brain (offline)</span>
            {!selectedModel && <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />}
          </button>
          {credentials.map((cred) => {
            const models = cred.id === activeCredential?.id ? filteredModels : [];
            const isSelectedCred = cred.id === activeCredential?.id;
            return (
              <div key={cred.id}>
                <button
                  type="button"
                  onClick={() => onPick(cred.id, null)}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent"
                >
                  <span
                    className="size-2.5 shrink-0 rounded-[4px]"
                    style={{ background: providerAccent(cred.provider) }}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate">{cred.label}</span>
                  {isSelectedCred && selectedModel && (
                    <span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />
                  )}
                </button>
                {isSelectedCred && (
                  <div className="mt-0.5 border-l border-border/70 pl-2 ml-4">
                    {modelList.length === 0 ? (
                      <p className="px-2 py-1.5 text-xs text-muted-foreground">
                        Select this provider to load its models…
                      </p>
                    ) : (
                      <>
                        <Input
                          value={query}
                          onChange={(e) => onQuery(e.target.value)}
                          placeholder={`Search ${modelList.length} models…`}
                          className="mb-1.5 h-8 rounded-lg text-xs"
          aria-label="Search models"
                        />
                        {modelListSource === "fallback" && (
                          <p className="px-2 pb-1 text-[11px] text-muted-foreground">
                            Live list unavailable — showing fallback catalog.
                          </p>
                        )}
                        <div className="you-scroll max-h-52 overflow-y-auto">
                          {filteredModels.map((m) => (
                            <button
                              key={m.id}
                              type="button"
                              onClick={() => onPick(cred.id, m.id)}
                              className={cn(
                                "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent",
                                selectedModel === m.id && "bg-accent"
                              )}
                            >
                              <span className="min-w-0 flex-1 truncate font-mono">{m.id}</span>
                              {m.contextWindow && (
                                <span className="shrink-0 text-[10px] text-muted-foreground">
                                  {Math.round(m.contextWindow / 1000)}k
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function providerAccent(provider: string): string {
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

function EmptyChatState({
  credentials, activeCredential, selectedModel, onCreate, onOpenSettings, composer, modelPicker,
}: {
  credentials: CredentialInfo[];
  activeCredential: CredentialInfo | null;
  selectedModel: string | null;
  onCreate: () => void;
  onOpenSettings: () => void;
  composer: React.ReactNode;
  modelPicker: React.ReactNode;
}) {
  void credentials; void activeCredential; void selectedModel; void onCreate; void modelPicker;
  const suggestions = [
    "Explain how the BYOK credential vault encrypts my keys",
    "Draft a launch announcement for an open-source project",
    "Compare local models vs cloud APIs for privacy",
    "Help me plan a research workflow with citations",
  ];
  return (
    <div className="you-scroll h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center px-5 py-10">
        <div className="mb-8 text-center">
          <YouMark size={44} className="mx-auto rounded-xl" />
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">How can I help you today?</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {credentials.length === 0
              ? "No provider connected yet — the offline demo brain will answer while you explore."
              : "Pick a provider and model, or start typing."}
          </p>
          {credentials.length === 0 && (
            <Button variant="outline" size="sm" className="mt-4 rounded-lg" onClick={onOpenSettings}>
              Connect a provider
            </Button>
          )}
        </div>
        <div className="mb-6 grid gap-2 sm:grid-cols-2">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={onCreate}
              className="rounded-xl border border-border bg-card px-4 py-3 text-left text-sm text-muted-foreground transition-colors hover:border-ring/50 hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
        {composer}
      </div>
    </div>
  );
}
