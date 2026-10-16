"use client";

/**
 * ReWoo Local Mode — browser-only persistence for deployments that run
 * without a configured database (e.g. a fresh Vercel clone).
 *
 * Everything the workspace needs — provider keys and conversations — lives
 * in this browser's localStorage. Keys are sent ONLY to this app's own
 * /api/chat/direct + /api/models/direct endpoints on a per-request basis and
 * are never stored server-side. For multi-device sync and server-side
 * encrypted storage, deploy with a database (see README → Deployment).
 *
 * The store emits change events so every mounted view re-reads after a write
 * (and the `storage` event keeps other tabs in sync).
 */

import type { ChatEvent, ConversationInfo, MessageInfo, ModelInfo } from "@/lib/rewoo-client";

const STORE_KEY = "rewoo.local.v1";
const MAX_CONVERSATIONS = 200;

export interface LocalCredential {
  id: string;
  provider: string;
  label: string;
  baseUrl: string | null;
  apiKey: string; // raw key — never rendered, never sent anywhere except this app's direct routes
  createdAt: string;
}

export interface LocalConversation {
  id: string;
  title: string;
  provider: string | null;
  model: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  messages: MessageInfo[];
}

interface LocalState {
  keys: LocalCredential[];
  conversations: LocalConversation[];
}

// ── Event plumbing ───────────────────────────────────────────────────────────

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeLocal(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const l of listeners) l();
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === STORE_KEY) emit();
  });
}

// ── Read/write ───────────────────────────────────────────────────────────────

function read(): LocalState {
  if (typeof window === "undefined") return { keys: [], conversations: [] };
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    if (!raw) return { keys: [], conversations: [] };
    const parsed = JSON.parse(raw) as LocalState;
    return {
      keys: Array.isArray(parsed.keys) ? parsed.keys : [],
      conversations: Array.isArray(parsed.conversations) ? parsed.conversations : [],
    };
  } catch {
    return { keys: [], conversations: [] };
  }
}

function write(state: LocalState) {
  if (typeof window === "undefined") return;
  // Hard cap so localStorage never overflows silently.
  state.conversations = state.conversations
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_CONVERSATIONS);
  window.localStorage.setItem(STORE_KEY, JSON.stringify(state));
  emit();
}

export function uid(): string {
  return `l_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ── Credentials (local API keys) ─────────────────────────────────────────────

export const localKeys = {
  list(): LocalCredential[] {
    return read().keys;
  },
  add(input: { provider: string; label: string; apiKey: string; baseUrl?: string | null }): LocalCredential {
    const state = read();
    const entry: LocalCredential = {
      id: uid(),
      provider: input.provider,
      label: input.label,
      baseUrl: input.baseUrl ?? null,
      apiKey: input.apiKey.trim(),
      createdAt: nowIso(),
    };
    state.keys = [...state.keys.filter((k) => !(k.provider === entry.provider && k.label === entry.label)), entry];
    write(state);
    return entry;
  },
  remove(id: string): void {
    const state = read();
    state.keys = state.keys.filter((k) => k.id !== id);
    write(state);
  },
};

// ── Conversations ────────────────────────────────────────────────────────────

function toInfo(c: LocalConversation): ConversationInfo {
  const { messages: _messages, ...info } = c;
  return info;
}

export const localConversations = {
  list(): ConversationInfo[] {
    const { conversations } = read();
    return conversations
      .map(toInfo)
      .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.updatedAt.localeCompare(a.updatedAt));
  },
  get(id: string): (ConversationInfo & { messages: MessageInfo[] }) | null {
    const c = read().conversations.find((x) => x.id === id);
    return c ? { ...toInfo(c), messages: c.messages } : null;
  },
  create(input?: { title?: string }): ConversationInfo {
    const state = read();
    const conv: LocalConversation = {
      id: uid(),
      title: input?.title ?? "New conversation",
      provider: null,
      model: null,
      pinned: false,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      messages: [],
    };
    state.conversations = [conv, ...state.conversations];
    write(state);
    return toInfo(conv);
  },
  update(id: string, input: { title?: string; pinned?: boolean; provider?: string | null; model?: string | null }): ConversationInfo | null {
    const state = read();
    const idx = state.conversations.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    const c = state.conversations[idx]!;
    state.conversations[idx] = {
      ...c,
      ...(input.title !== undefined ? { title: input.title.trim().slice(0, 120) || c.title } : {}),
      ...(input.pinned !== undefined ? { pinned: input.pinned } : {}),
      ...(input.provider !== undefined ? { provider: input.provider } : {}),
      ...(input.model !== undefined ? { model: input.model } : {}),
      updatedAt: nowIso(),
    };
    write(state);
    return toInfo(state.conversations[idx]!);
  },
  delete(id: string): void {
    const state = read();
    state.conversations = state.conversations.filter((c) => c.id !== id);
    write(state);
  },
  /**
   * Appends one message; auto-titles untitled conversations from the first
   * user message (same behaviour as the server route).
   */
  appendMessage(conversationId: string, msg: Omit<MessageInfo, "id" | "conversationId" | "createdAt"> & { id?: string }): MessageInfo | null {
    const state = read();
    const idx = state.conversations.findIndex((c) => c.id === conversationId);
    if (idx === -1) return null;
    const c = state.conversations[idx]!;
    const message: MessageInfo = {
      id: msg.id ?? uid(),
      conversationId: conversationId,
      role: msg.role,
      content: msg.content,
      provider: msg.provider ?? null,
      model: msg.model ?? null,
      demo: msg.demo ?? false,
      promptTokens: msg.promptTokens ?? null,
      completionTokens: msg.completionTokens ?? null,
      createdAt: nowIso(),
    };
    let title = c.title;
    if (title === "New conversation" && msg.role === "user") {
      title = msg.content.replace(/\s+/g, " ").trim().slice(0, 60) + (msg.content.length > 60 ? "…" : "");
    }
    state.conversations[idx] = {
      ...c,
      title,
      updatedAt: nowIso(),
      messages: [...c.messages, message],
    };
    write(state);
    return message;
  },
  /** Replaces the content of a message (edit / regenerate flows). */
  updateMessage(conversationId: string, messageId: string, patch: Partial<Pick<MessageInfo, "content" | "provider" | "model">>): void {
    const state = read();
    const idx = state.conversations.findIndex((c) => c.id === conversationId);
    if (idx === -1) return;
    const c = state.conversations[idx]!;
    state.conversations[idx] = {
      ...c,
      updatedAt: nowIso(),
      messages: c.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
    };
    write(state);
  },
  /** Removes messages from `messageId` (inclusive) to the end — regenerate flow. */
  truncateFrom(conversationId: string, messageId: string): void {
    const state = read();
    const idx = state.conversations.findIndex((c) => c.id === conversationId);
    if (idx === -1) return;
    const c = state.conversations[idx]!;
    const cut = c.messages.findIndex((m) => m.id === messageId);
    if (cut === -1) return;
    state.conversations[idx] = {
      ...c,
      updatedAt: nowIso(),
      messages: c.messages.slice(0, cut),
    };
    write(state);
  },
};

// ── Demo brain (no key) — client-side, clearly labeled ───────────────────────

export function demoBrainText(question: string): string {
  return [
    "**Demo brain** — you're seeing the offline model because no API key is connected for this conversation.",
    "",
    "Everything else is real: this chat, your keys, and your history are saved locally in this browser. To talk to a live model:",
    "",
    "1. Open **Settings → Providers**",
    "2. Add an API key for OpenAI, Anthropic, Gemini, OpenRouter, Groq, or Mistral (or any OpenAI-compatible endpoint like Ollama)",
    "3. Pick a model in the chat composer",
    "",
    "---",
    "",
    "Your message was:",
    "",
    `> ${question.slice(0, 500)}`,
    "",
    "When a live model is connected, its answer streams here with token usage.",
  ].join("\n");
}

/**
 * Streams the demo brain locally (no server round-trip) using the same
 * ChatEvent protocol as the SSE endpoints, so the UI code path is identical.
 */
export function streamLocalDemoTurn(question: string, onEvent: (ev: ChatEvent) => void): { cancel: () => void } {
  let cancelled = false;
  const text = demoBrainText(question);
  const chunks = text.match(/[\s\S]{1,24}/g) ?? [];
  (async () => {
    onEvent({ type: "meta", demo: true, provider: "demo", model: "demo-brain" });
    for (const chunk of chunks) {
      if (cancelled) break;
      onEvent({ type: "delta", text: chunk });
      await new Promise((r) => setTimeout(r, 24));
    }
    if (!cancelled) onEvent({ type: "done", userMessage: null, assistantMessage: null });
  })();
  return { cancel: () => { cancelled = true; } };
}

// ── Local model catalog (offline fallback when discovery is unavailable) ─────

/** Shared shape so the model picker can render fallback entries in Local Mode. */
export function localFallbackModels(provider: string): ModelInfo[] {
  const table: Record<string, Array<[string, string]>> = {
    openai: [["gpt-4o-mini", "GPT-4o mini"], ["gpt-4o", "GPT-4o"]],
    anthropic: [["claude-3-5-haiku-20241022", "Claude 3.5 Haiku"], ["claude-sonnet-4-20250514", "Claude Sonnet 4"]],
    gemini: [["gemini-2.0-flash", "Gemini 2.0 Flash"], ["gemini-2.5-pro", "Gemini 2.5 Pro"]],
    openrouter: [["openai/gpt-4o-mini", "GPT-4o mini"]],
    groq: [["llama-3.3-70b-versatile", "Llama 3.3 70B"]],
    mistral: [["mistral-small-latest", "Mistral Small"]],
  };
  return (table[provider] ?? []).map(([id, label]) => ({ id, label, source: "fallback" as const }));
}
