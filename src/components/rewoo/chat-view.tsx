"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowDown, BrainCircuit, Check, Copy, MessageSquarePlus, Pencil, Pin,
  PinOff, RefreshCw, SendHorizonal, Sparkles, Square, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  api, streamChatTurn, streamDirectChat, type ChatEvent, type ConversationInfo,
  type CredentialInfo, type MessageInfo,
} from "@/lib/rewoo-client";
import {
  localConversations, streamLocalDemoTurn, type LocalCredential,
} from "@/lib/local-store";
import { useReWoo, type WorkspaceMode } from "@/lib/rewoo-store";
import { cn } from "@/lib/utils";
import { Markdown, StreamingDots } from "./markdown";
import { ReWooMark } from "./logo";
import { ModelPicker } from "./model-picker";

interface ChatProps {
  mode: WorkspaceMode;
  credentials: CredentialInfo[];
  localKeys: LocalCredential[];
  conversations: ConversationInfo[];
  activeId: string | null;
  onConversationsChanged: () => void;
  onSelectConversation: (id: string | null) => void;
  onOpenSettings: () => void;
}

const SUGGESTIONS: Array<{ title: string; prompt: string }> = [
  {
    title: "Explain something",
    prompt: "Explain the attention mechanism in transformers, with a small ASCII diagram and a concrete example.",
  },
  {
    title: "Write code",
    prompt: "Write a Python script that organizes photos into folders by EXIF date, with a --dry-run flag. Include comments.",
  },
  {
    title: "Draft content",
    prompt: "Draft a friendly, concise launch post for an open-source AI workspace called ReWoo. Include a headline and 3 bullet points.",
  },
  {
    title: "Compare options",
    prompt: "Compare Postgres, SQLite, and MongoDB for a multi-user chat app. Present the trade-offs in a table.",
  },
];

const SYSTEM_PROMPT =
  "You are an assistant inside ReWoo, an open-source AI workspace. Be helpful, precise, and concise. Use Markdown when it aids clarity.";

export function ChatView({
  mode, credentials, localKeys, conversations, activeId, onConversationsChanged,
  onSelectConversation, onOpenSettings,
}: ChatProps) {
  const { selectedCredentialId, selectedModel, setSelection } = useReWoo();
  const [messages, setMessages] = useState<MessageInfo[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState("");
  const [streamMeta, setStreamMeta] = useState<{ provider: string; model: string; demo: boolean } | null>(null);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const streamHandle = useRef<{ cancel: () => void } | null>(null);
  const streamTextRef = useRef("");
  const streamUsageRef = useRef<{ promptTokens: number; completionTokens: number } | null>(null);
  // mirror of streamMeta usable inside onEvent closures (set on arrival, not in an effect)
  const streamMetaRef = useRef<{ provider: string; model: string; demo: boolean } | null>(null);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;

  // Selected credential resolves differently per mode.
  const activeLocalKey = mode === "local" ? localKeys.find((k) => k.id === selectedCredentialId) ?? null : null;
  const hasLiveModel = mode === "local" ? !!activeLocalKey && !!selectedModel : !!selectedCredentialId && !!selectedModel;

  const activeProviderId = mode === "local" ? activeLocalKey?.provider ?? null : credentials.find((c) => c.id === selectedCredentialId)?.provider ?? null;

  // ── Load messages when the active conversation changes ────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeId) {
        if (!cancelled) { setMessages([]); setError(null); }
        return;
      }
      try {
        if (mode === "local") {
          const conv = localConversations.get(activeId);
          if (!cancelled) { setMessages(conv?.messages ?? []); setError(null); }
        } else {
          const { conversation } = await api.getConversation(activeId);
          if (!cancelled) { setMessages(conversation.messages); setError(null); }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load conversation.");
      }
    })();
    return () => { cancelled = true; };
  }, [activeId, mode, conversations.length]);

  // ── Auto-scroll while pinned to bottom ────────────────────────────────────
  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  useEffect(() => {
    if (atBottom) scrollToBottom(false);
     
  }, [messages.length, streamText]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 90);
  }, []);

  // ── Composer auto-grow ─────────────────────────────────────────────────────
  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [input]);

  // ── Ensure a conversation exists before the first send ────────────────────
  const ensureConversation = useCallback(async (): Promise<string | null> => {
    if (activeId) return activeId;
    try {
      const conv =
        mode === "local"
          ? localConversations.create()
          : (await api.createConversation()).conversation;
      onSelectConversation(conv.id);
      onConversationsChanged();
      return conv.id;
    } catch {
      return null;
    }
  }, [activeId, mode, onSelectConversation, onConversationsChanged]);

  // ── The streaming turn ─────────────────────────────────────────────────────
  const runTurn = useCallback(
    async (conversationId: string, opts: { regenerate?: boolean; skipUserMessage?: string } = {}) => {
      setStreaming(true);
      setStreamText("");
      setStreamMeta(null);
      setError(null);
      streamTextRef.current = "";
      streamUsageRef.current = null;

      const finish = (err?: string) => {
        setStreaming(false);
        if (err) setError(err);
        onConversationsChanged();
      };

      const onEvent = (ev: ChatEvent) => {
        if (ev.type === "meta") {
          const meta = { provider: ev.provider, model: ev.model, demo: ev.demo };
          streamMetaRef.current = meta;
          setStreamMeta(meta);
        }
        else if (ev.type === "delta") {
          streamTextRef.current += ev.text;
          setStreamText(streamTextRef.current);
        } else if (ev.type === "usage") {
          streamUsageRef.current = { promptTokens: ev.promptTokens, completionTokens: ev.completionTokens };
        } else if (ev.type === "error") {
          setError(ev.message);
        } else if (ev.type === "done") {
          const content = streamTextRef.current;
          if (mode === "local" && content.trim()) {
            localConversations.appendMessage(conversationId, {
              role: "assistant",
              content,
              provider: streamMetaRef.current?.provider ?? activeProviderId,
              model: streamMetaRef.current?.model ?? selectedModel,
              demo: streamMetaRef.current?.demo ?? !hasLiveModel,
              promptTokens: streamUsageRef.current?.promptTokens ?? null,
              completionTokens: streamUsageRef.current?.completionTokens ?? null,
            });
          }
          finish();
          // Cloud mode: reload persisted messages (done event carries them, but
          // a full reload also picks up auto-titles and usage columns).
          if (mode === "cloud" && activeId === conversationId) {
            api.getConversation(conversationId)
              .then(({ conversation }) => setMessages(conversation.messages))
              .catch(() => {});
          }
        }
      };

      if (mode === "local") {
        const conv = localConversations.get(conversationId);
        const history = (conv?.messages ?? [])
          .slice(-40)
          .map((m) => ({ role: m.role, content: m.content })) as Array<{ role: "system" | "user" | "assistant"; content: string }>;
        if (activeLocalKey && selectedModel) {
          streamHandle.current = streamDirectChat(
            {
              provider: activeLocalKey.provider,
              apiKey: activeLocalKey.apiKey,
              baseUrl: activeLocalKey.baseUrl,
              model: selectedModel,
              messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history],
            },
            onEvent
          );
        } else {
          const lastUser = [...history].reverse().find((m) => m.role === "user");
          streamHandle.current = streamLocalDemoTurn(lastUser?.content ?? "your message", onEvent);
        }
      } else {
        streamHandle.current = streamChatTurn(
          {
            conversationId,
            credentialId: selectedCredentialId,
            model: selectedModel ?? "",
            message: opts.skipUserMessage ?? "",
            regenerate: opts.regenerate,
          },
          onEvent
        );
      }
    },
     
    [mode, activeId, selectedCredentialId, selectedModel, activeLocalKey, activeProviderId, hasLiveModel, onConversationsChanged]
  );

  // ── Send ───────────────────────────────────────────────────────────────────
  async function send(textRaw?: string) {
    const text = (textRaw ?? input).trim();
    if (!text || streaming) return;
    const conversationId = await ensureConversation();
    if (!conversationId) {
      setError("Could not start a conversation. Try again.");
      return;
    }
    setInput("");
    if (mode === "local") {
      localConversations.appendMessage(conversationId, { role: "user", content: text });
      onConversationsChanged();
      setMessages((prev) => [...prev, {
        id: `tmp-u-${Date.now()}`, conversationId, role: "user" as const, content: text, createdAt: new Date().toISOString(),
      }]);
    } else {
      setMessages((prev) => [...prev, {
        id: `tmp-u-${Date.now()}`, conversationId, role: "user" as const, content: text, createdAt: new Date().toISOString(),
      }]);
    }
    setAtBottom(true);
    await runTurn(conversationId, { skipUserMessage: text });
  }

  // ── Regenerate the last assistant turn ────────────────────────────────────
  async function regenerate() {
    if (streaming || !activeId) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    try {
      if (mode === "local") {
        localConversations.truncateFrom(activeId, lastAssistant.id);
        setMessages((prev) => prev.filter((m) => m.id !== lastAssistant.id));
        await runTurn(activeId, { regenerate: true });
      } else {
        await api.deleteMessage(lastAssistant.id).catch(() => {});
        setMessages((prev) => prev.filter((m) => m.id !== lastAssistant.id));
        await runTurn(activeId, { regenerate: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not regenerate.");
    }
  }

  function stop() {
    streamHandle.current?.cancel();
  }

  // ── Conversation header actions ────────────────────────────────────────────
  async function saveRename() {
    if (!activeConversation) return;
    const title = renameValue.trim();
    setRenaming(false);
    if (!title || title === activeConversation.title) return;
    try {
      if (mode === "local") localConversations.update(activeConversation.id, { title });
      else await api.updateConversation(activeConversation.id, { title });
      onConversationsChanged();
    } catch {
      setError("Could not rename the conversation.");
    }
  }

  async function togglePin() {
    if (!activeConversation) return;
    try {
      if (mode === "local") localConversations.update(activeConversation.id, { pinned: !activeConversation.pinned });
      else await api.updateConversation(activeConversation.id, { pinned: !activeConversation.pinned });
      onConversationsChanged();
    } catch {
      setError("Could not pin the conversation.");
    }
  }

  async function removeConversation() {
    if (!activeConversation) return;
    if (!confirm(`Delete “${activeConversation.title}”? This cannot be undone.`)) return;
    try {
      if (mode === "local") localConversations.delete(activeConversation.id);
      else await api.deleteConversation(activeConversation.id);
      onSelectConversation(null);
      onConversationsChanged();
    } catch {
      setError("Could not delete the conversation.");
    }
  }

  async function copyMessage(m: MessageInfo) {
    try {
      await navigator.clipboard.writeText(m.content);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId(null), 1600);
    } catch { /* clipboard unavailable */ }
  }

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id ?? null;
  const empty = messages.length === 0 && !streaming;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border/70 bg-background/80 px-3 backdrop-blur md:px-5">
        <ModelPicker
          mode={mode}
          credentials={credentials}
          localKeys={localKeys}
          selectedCredentialId={selectedCredentialId}
          selectedModel={selectedModel}
          onSelect={(credId, model) => setSelection(credId, model)}
          onOpenSettings={onOpenSettings}
        />
        <span className="flex-1" />
        {activeConversation && (
          <>
            {renaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={saveRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveRename();
                  if (e.key === "Escape") setRenaming(false);
                }}
                className="h-8 w-56 rounded-lg border border-border bg-background px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                aria-label="Conversation title"
                maxLength={120}
              />
            ) : (
              <button
                type="button"
                onClick={() => { setRenaming(true); setRenameValue(activeConversation.title); }}
                className="group flex min-w-0 max-w-[38%] items-center gap-1.5 rounded-lg px-2 py-1 text-sm transition-colors hover:bg-accent"
                title="Rename conversation"
              >
                {activeConversation.pinned && <Pin className="size-3 shrink-0 text-primary" aria-hidden="true" />}
                <span className="truncate font-medium">{activeConversation.title}</span>
                <Pencil className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden="true" />
              </button>
            )}
            <Button variant="ghost" size="icon" className="size-8 rounded-lg" onClick={togglePin}
              title={activeConversation.pinned ? "Unpin" : "Pin"} aria-label={activeConversation.pinned ? "Unpin conversation" : "Pin conversation"}>
              {activeConversation.pinned ? <PinOff className="size-4" aria-hidden="true" /> : <Pin className="size-4" aria-hidden="true" />}
            </Button>
            <Button variant="ghost" size="icon" className="size-8 rounded-lg text-muted-foreground hover:text-destructive"
              onClick={removeConversation} title="Delete conversation" aria-label="Delete conversation">
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </>
        )}
      </header>

      {/* ── Messages ───────────────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="rewoo-scroll relative min-h-0 flex-1 overflow-y-auto"
        role="log"
        aria-label="Conversation messages"
      >
        {empty ? (
          <EmptyState onPick={(prompt) => void send(prompt)} hasLiveModel={hasLiveModel} mode={mode} onOpenSettings={onOpenSettings} />
        ) : (
          <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-6 md:px-6">
            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="group/msg flex justify-end py-2.5">
                  <div className="max-w-[85%]">
                    <div className="rounded-2xl rounded-br-md border border-border/70 bg-primary/10 px-4 py-2.5 text-[0.94rem] whitespace-pre-wrap break-words">
                      {m.content}
                    </div>
                    <div className="mt-1 flex justify-end pr-1 opacity-0 transition-opacity group-hover/msg:opacity-100">
                      <button
                        type="button"
                        onClick={() => void copyMessage(m)}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                        aria-label="Copy message"
                      >
                        {copiedId === m.id ? <Check className="size-3 text-emerald-500" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
                        {copiedId === m.id ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div key={m.id} className="group/msg flex gap-3 py-2.5">
                  <ReWooMark size={30} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 pb-0.5">
                      <span className="text-[13px] font-semibold">ReWoo</span>
                      {m.demo && (
                        <span className="rounded-full border border-border px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
                          demo
                        </span>
                      )}
                      <span className="text-[11px] text-muted-foreground/70" title={new Date(m.createdAt).toLocaleString()}>
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <Markdown>{m.content}</Markdown>
                    {(m.provider || m.model) && (
                      <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                        {m.model}
                        {m.model && (m.promptTokens || m.completionTokens) ? ` · ${m.promptTokens ?? 0}+${m.completionTokens ?? 0} tokens` : ""}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100">
                      <button
                        type="button"
                        onClick={() => void copyMessage(m)}
                        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        aria-label="Copy message" title="Copy"
                      >
                        {copiedId === m.id ? <Check className="size-3.5 text-emerald-500" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
                      </button>
                      {m.id === lastAssistantId && !streaming && (
                        <button
                          type="button"
                          onClick={() => void regenerate()}
                          className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          aria-label="Regenerate response" title="Regenerate"
                        >
                          <RefreshCw className="size-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            )}

            {/* Streaming turn */}
            {streaming && (
              <div className="flex gap-3 py-2.5">
                <ReWooMark size={30} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 pb-0.5">
                    <span className="text-[13px] font-semibold">ReWoo</span>
                    {streamMeta?.demo && (
                      <span className="rounded-full border border-border px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-muted-foreground">demo</span>
                    )}
                    {streamMeta && <span className="text-[11px] text-muted-foreground/70">{streamMeta.model}</span>}
                  </div>
                  {streamText ? <Markdown>{streamText}</Markdown> : <StreamingDots />}
                </div>
              </div>
            )}

            {error && (
              <div className="my-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-[13px] text-destructive" role="alert">
                {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Scroll-to-bottom */}
      <AnimatePresence>
        {!atBottom && !empty && (
          <motion.button
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            onClick={() => { setAtBottom(true); scrollToBottom(true); }}
            className="absolute bottom-36 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-background p-2 shadow-md"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="size-4" aria-hidden="true" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Composer ───────────────────────────────────────────────────────── */}
      <div className="shrink-0 bg-gradient-to-t from-background via-background to-transparent px-4 pb-4 pt-2 md:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <div className="rounded-2xl border border-border bg-card shadow-sm focus-within:border-ring/60 focus-within:shadow-md">
            <textarea
              ref={composerRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              placeholder={hasLiveModel ? "Message ReWoo…" : "Message ReWoo (demo brain until you add a key)…"}
              className="rewoo-scroll max-h-[220px] w-full resize-none bg-transparent px-4 pb-1 pt-3.5 text-[0.95rem] outline-none placeholder:text-muted-foreground"
              aria-label="Message input"
              maxLength={32000}
            />
            <div className="flex items-center justify-between gap-2 px-3 pb-2.5 pt-0.5">
              <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
                {hasLiveModel ? (
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden="true" />
                    <span className="truncate">{selectedModel}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="flex items-center gap-1.5 rounded-md px-1 py-0.5 transition-colors hover:text-foreground"
                  >
                    <Sparkles className="size-3 shrink-0" aria-hidden="true" />
                    Connect a model key
                  </button>
                )}
                <span className="hidden sm:inline">·</span>
                <span className="hidden shrink-0 sm:inline">Enter ↵ send · Shift+Enter newline</span>
              </div>
              {streaming ? (
                <Button size="icon" className="size-9 rounded-xl" onClick={stop} aria-label="Stop generating" title="Stop generating">
                  <Square className="size-4 fill-current" aria-hidden="true" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  className="size-9 rounded-xl"
                  onClick={() => void send()}
                  disabled={!input.trim()}
                  aria-label="Send message"
                  title="Send"
                >
                  <SendHorizonal className="size-4" aria-hidden="true" />
                </Button>
              )}
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground/70">
            {mode === "local"
              ? "Local mode — conversations and keys stay in this browser."
              : "Models can make mistakes. Verify important information."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
  onPick, hasLiveModel, mode, onOpenSettings,
}: {
  onPick: (prompt: string) => void;
  hasLiveModel: boolean;
  mode: WorkspaceMode;
  onOpenSettings: () => void;
}) {
  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col items-center justify-center px-6 py-10">
      <ReWooMark size={56} />
      <h1 className="mt-5 text-2xl font-semibold tracking-tight">
        {hasLiveModel ? "What can I help with?" : "Welcome to ReWoo"}
      </h1>
      <p className="mt-2 max-w-md text-center text-sm leading-relaxed text-muted-foreground">
        {hasLiveModel
          ? "Pick a model above, or just start typing."
          : mode === "local"
            ? "You're in local mode — everything stays in this browser. Add a provider key to talk to live models."
            : "Add a provider key in Settings to talk to live models, or explore with the offline demo brain."}
      </p>
      {!hasLiveModel && (
        <Button variant="outline" size="sm" className="mt-4 gap-2 rounded-xl" onClick={onOpenSettings}>
          <BrainCircuit className="size-4" aria-hidden="true" />
          Connect an API key
        </Button>
      )}
      <div className="mt-8 grid w-full gap-2.5 sm:grid-cols-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s.title}
            type="button"
            onClick={() => onPick(s.prompt)}
            className="group rounded-xl border border-border bg-card/60 p-3.5 text-left transition-all hover:border-ring/50 hover:bg-card hover:shadow-sm"
          >
            <span className="flex items-center gap-1.5 text-[13px] font-medium">
              <MessageSquarePlus className="size-3.5 text-muted-foreground transition-colors group-hover:text-primary" aria-hidden="true" />
              {s.title}
            </span>
            <span className="mt-1 line-clamp-2 block text-[12.5px] leading-snug text-muted-foreground">{s.prompt}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
