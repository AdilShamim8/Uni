"use client";

/**
 * ReWoo client API layer — typed fetch helpers + SSE stream reader.
 * All requests use relative paths (same-origin).
 */

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

export interface CredentialInfo {
  id: string;
  provider: string;
  label: string;
  baseUrl: string | null;
  maskedKey: string;
  lastValidatedAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface ModelInfo {
  id: string;
  label: string;
  contextWindow?: number;
  source: "live" | "fallback";
}

export interface ConversationInfo {
  id: string;
  title: string;
  provider: string | null;
  model: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MessageInfo {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "system";
  content: string;
  provider?: string | null;
  model?: string | null;
  demo?: boolean;
  promptTokens?: number | null;
  completionTokens?: number | null;
  createdAt: string;
}

/** Fetch error carrying HTTP status and a machine-readable code (e.g. setup_required). */
export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; code?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, res.status, data.code);
  return data;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface HealthInfo {
  ok: boolean;
  service: string;
  db: boolean;
  dbIssue: "not-configured" | "serverless-sqlite" | "unreachable" | "schema-missing" | null;
  dbMessage: string | null;
  masterKey: "env" | "file" | "ephemeral";
  setupRequired: boolean;
  time: string;
}

export const api = {
  /** Deployment diagnostics. 503 is a valid outcome — never throws for it. */
  health: async (): Promise<HealthInfo | null> => {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      return (await res.json().catch(() => null)) as HealthInfo | null;
    } catch {
      return null;
    }
  },
  me: () => jsonFetch<{ user: SessionUser | null }>("/api/auth/me"),
  signup: (email: string, password: string, name?: string) =>
    jsonFetch<{ user: SessionUser }>("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, name }),
    }),
  signin: (email: string, password: string) =>
    jsonFetch<{ user: SessionUser }>("/api/auth/signin", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  signout: () => jsonFetch<{ ok: boolean }>("/api/auth/signout", { method: "POST" }),

  // Providers
  listProviders: () => jsonFetch<{ providers: CredentialInfo[] }>("/api/providers"),
  addProvider: (input: { provider: string; label?: string; apiKey: string; baseUrl?: string }) =>
    jsonFetch<{ provider: CredentialInfo; validated: boolean; validationError: string | null }>(
      "/api/providers",
      { method: "POST", body: JSON.stringify(input) }
    ),
  updateProvider: (id: string, input: { apiKey?: string; label?: string }) =>
    jsonFetch<{ provider: CredentialInfo }>(`/api/providers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteProvider: (id: string) =>
    jsonFetch<{ ok: boolean }>(`/api/providers/${id}`, { method: "DELETE" }),
  validateProvider: (id: string) =>
    jsonFetch<{ ok: boolean; error: string | null }>("/api/providers/validate", {
      method: "POST",
      body: JSON.stringify({ id }),
    }),

  // Models
  listModels: (credentialId: string) =>
    jsonFetch<{
      provider: string;
      providerName: string;
      models: ModelInfo[];
      source: "live" | "fallback";
      error: string | null;
    }>(`/api/models?credentialId=${encodeURIComponent(credentialId)}`),

  // Conversations
  listConversations: () => jsonFetch<{ conversations: ConversationInfo[] }>("/api/conversations"),
  createConversation: (input?: { title?: string; provider?: string; model?: string }) =>
    jsonFetch<{ conversation: ConversationInfo }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify(input ?? {}),
    }),
  getConversation: (id: string) =>
    jsonFetch<{ conversation: ConversationInfo & { messages: MessageInfo[] } }>(
      `/api/conversations/${id}`
    ),
  updateConversation: (id: string, input: { title?: string; pinned?: boolean }) =>
    jsonFetch<{ conversation: ConversationInfo }>(`/api/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
  deleteConversation: (id: string) =>
    jsonFetch<{ ok: boolean }>(`/api/conversations/${id}`, { method: "DELETE" }),
};

// ── SSE chat streaming ───────────────────────────────────────────────────────

export type ChatEvent =
  | { type: "meta"; demo: boolean; provider: string; model: string }
  | { type: "delta"; text: string }
  | { type: "usage"; promptTokens: number; completionTokens: number }
  | { type: "done"; userMessage: MessageInfo | null; assistantMessage: MessageInfo | null }
  | { type: "error"; message: string };

export interface StreamHandle {
  cancel: () => void;
  done: Promise<void>;
}

/**
 * Streams a chat turn. `onEvent` receives normalized events.
 * Returns a handle for cancellation (user pressed Stop).
 */
export function streamChatTurn(
  input: {
    conversationId: string;
    credentialId: string | null;
    model: string;
    message: string;
    regenerate?: boolean;
  },
  onEvent: (ev: ChatEvent) => void
): StreamHandle {
  const controller = new AbortController();
  const done = (async () => {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      onEvent({ type: "error", message: data.error ?? `Chat failed (${res.status}).` });
      onEvent({ type: "done", userMessage: null, assistantMessage: null });
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done: rdone, value } = await reader.read();
      if (rdone) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.trim();
        if (!line.startsWith("data:")) continue;
        try {
          onEvent(JSON.parse(line.slice(5).trim()) as ChatEvent);
        } catch {
          // ignore malformed frame
        }
      }
    }
  })();
  return { cancel: () => controller.abort(), done };
}
