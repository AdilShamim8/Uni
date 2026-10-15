/**
 * YOU model gateway — provider registry, model discovery, and streaming chat
 * adapters. Server-side only: provider API keys are decrypted here and never
 * leave this layer.
 *
 * Adapter families:
 *   - openai-compatible: OpenAI, OpenRouter, Groq, Mistral, custom endpoints
 *     (covers Ollama / LM Studio / vLLM), — {base}/chat/completions
 *   - anthropic: {base}/v1/messages (x-api-key + anthropic-version)
 *   - gemini: {base}/v1beta/models/{model}:streamGenerateContent?alt=sse
 */

export type ProviderId = "openai" | "anthropic" | "gemini" | "openrouter" | "groq" | "mistral" | "custom";
export type ChatRole = "system" | "user" | "assistant";
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ProviderMeta {
  id: ProviderId;
  name: string;
  defaultBaseUrl: string;
  keyFormat: string; // hint for the UI
  keyDocs: string;
  docsUrl: string;
  requiresBaseUrl?: boolean;
  accent: string; // tailwind-friendly hex for provider glyph
}

export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  openai: {
    id: "openai", name: "OpenAI", defaultBaseUrl: "https://api.openai.com/v1",
    keyFormat: "sk-...", keyDocs: "platform.openai.com → API keys", docsUrl: "https://platform.openai.com/api-keys",
    accent: "#10a37f",
  },
  anthropic: {
    id: "anthropic", name: "Anthropic", defaultBaseUrl: "https://api.anthropic.com",
    keyFormat: "sk-ant-...", keyDocs: "console.anthropic.com → API keys", docsUrl: "https://console.anthropic.com/settings/keys",
    accent: "#d97757",
  },
  gemini: {
    id: "gemini", name: "Google Gemini", defaultBaseUrl: "https://generativelanguage.googleapis.com",
    keyFormat: "AIza...", keyDocs: "aistudio.google.com → Get API key", docsUrl: "https://aistudio.google.com/apikey",
    accent: "#4285f4",
  },
  openrouter: {
    id: "openrouter", name: "OpenRouter", defaultBaseUrl: "https://openrouter.ai/api/v1",
    keyFormat: "sk-or-...", keyDocs: "openrouter.ai → Keys", docsUrl: "https://openrouter.ai/keys",
    accent: "#8b5cf6",
  },
  groq: {
    id: "groq", name: "Groq", defaultBaseUrl: "https://api.groq.com/openai/v1",
    keyFormat: "gsk_...", keyDocs: "console.groq.com → API Keys", docsUrl: "https://console.groq.com/keys",
    accent: "#f55036",
  },
  mistral: {
    id: "mistral", name: "Mistral", defaultBaseUrl: "https://api.mistral.ai/v1",
    keyFormat: "...", keyDocs: "console.mistral.ai → API keys", docsUrl: "https://console.mistral.ai/api-keys",
    accent: "#fa520f",
  },
  custom: {
    id: "custom", name: "Custom (OpenAI-compatible)", defaultBaseUrl: "",
    keyFormat: "any", keyDocs: "e.g. Ollama, LM Studio, vLLM, internal gateways",
    docsUrl: "https://github.com/ggml-org/llama.cpp/blob/main/docs/llamacpp.md",
    requiresBaseUrl: true, accent: "#64748b",
  },
};

export function isProviderId(v: string): v is ProviderId {
  return v in PROVIDERS;
}

// ── Model discovery ──────────────────────────────────────────────────────────

export interface ModelInfo {
  id: string;
  label: string;
  contextWindow?: number;
  source: "live" | "fallback";
}

/** Small offline fallback catalogs — clearly labeled `source: "fallback"`. */
const FALLBACK_MODELS: Partial<Record<ProviderId, ModelInfo[]>> = {
  openai: [
    { id: "gpt-4o", label: "GPT-4o", contextWindow: 128000, source: "fallback" },
    { id: "gpt-4o-mini", label: "GPT-4o mini", contextWindow: 128000, source: "fallback" },
  ],
  anthropic: [
    { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", contextWindow: 200000, source: "fallback" },
    { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", contextWindow: 200000, source: "fallback" },
  ],
  gemini: [
    { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", contextWindow: 1000000, source: "fallback" },
    { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", contextWindow: 1000000, source: "fallback" },
  ],
  groq: [
    { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", contextWindow: 128000, source: "fallback" },
  ],
  mistral: [
    { id: "mistral-large-latest", label: "Mistral Large", contextWindow: 128000, source: "fallback" },
  ],
  openrouter: [
    { id: "openai/gpt-4o", label: "GPT-4o (via OpenRouter)", contextWindow: 128000, source: "fallback" },
  ],
};

export async function fetchModels(
  provider: ProviderId,
  apiKey: string,
  baseUrl?: string
): Promise<{ models: ModelInfo[]; error?: string }> {
  const base = (baseUrl || PROVIDERS[provider].defaultBaseUrl).replace(/\/$/, "");
  if (!base) return { models: [], error: "Base URL required for custom providers." };
  try {
    const url =
      provider === "gemini"
        ? `${base}/v1beta/models?key=${encodeURIComponent(apiKey)}`
        : `${base}/models`;
    const headers: Record<string, string> = {};
    if (provider === "anthropic") {
      headers["x-api-key"] = apiKey;
      headers["anthropic-version"] = "2023-06-01";
    } else if (provider === "gemini") {
      // key in query
    } else {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { models: [], error: `Provider returned ${res.status}. ${body.slice(0, 140)}` };
    }
    const json = (await res.json()) as Record<string, unknown>;
    const raw = (json.data ?? json.models ?? []) as Array<Record<string, unknown>>;
    const models: ModelInfo[] = raw
      .map((m) => {
        const id = String(m.name ?? m.id ?? "").replace(/^models\//, "");
        return {
          id,
          label: prettyModelLabel(id, m.displayName ? String(m.displayName) : undefined),
          contextWindow: typeof m.context_window === "number" ? (m.context_window as number) : undefined,
          source: "live" as const,
        };
      })
      .filter((m) => m.id && !m.id.includes("embedding") && !m.id.includes("tts") && !m.id.includes("whisper"))
      .slice(0, 200);
    if (models.length === 0) return { models: [], error: "Provider returned no models." };
    return { models };
  } catch (err) {
    return { models: [], error: err instanceof Error ? err.message : "Network error" };
  }
}

function prettyModelLabel(id: string, displayName?: string): string {
  if (displayName) return displayName;
  return id
    .split(/[-_/]/)
    .map((p) => (/^\d/.test(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ")
    .replace(/\bGpt\b/g, "GPT")
    .replace(/\bClaude\b/g, "Claude");
}

export function fallbackModels(provider: ProviderId): ModelInfo[] {
  return FALLBACK_MODELS[provider] ?? [];
}

// ── Streaming chat adapters ──────────────────────────────────────────────────

export interface StreamOptions {
  provider: ProviderId;
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface GatewayChunk {
  /** text delta, or undefined for done/usage events */
  text?: string;
  done?: boolean;
  usage?: { promptTokens: number; completionTokens: number };
  error?: string;
}

/**
 * Streams from the provider and yields normalized GatewayChunks.
 * Throws on non-retryable HTTP errors with a readable message.
 */
export async function* streamChat(opts: StreamOptions): AsyncGenerator<GatewayChunk> {
  const { provider, apiKey, model, messages, signal } = opts;
  const base = (opts.baseUrl || PROVIDERS[provider].defaultBaseUrl).replace(/\/$/, "");
  if (!base) throw new Error("Base URL required for custom providers.");

  if (provider === "anthropic") {
    yield* streamAnthropic({ ...opts, base });
  } else if (provider === "gemini") {
    yield* streamGemini({ ...opts, base });
  } else {
    yield* streamOpenAICompatible({ ...opts, base });
  }
  void apiKey; void model; void messages; void signal;
}

async function* readSSE(res: Response): AsyncGenerator<string> {
  if (!res.body) throw new Error("Provider returned an empty response body.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("data:")) yield trimmed.slice(5).trim();
    }
  }
  if (buffer.trim().startsWith("data:")) yield buffer.trim().slice(5).trim();
}

async function assertOk(res: Response, provider: string): Promise<void> {
  if (res.ok) return;
  let detail = "";
  try {
    const body = (await res.json()) as Record<string, unknown>;
    const err = body.error as Record<string, unknown> | undefined;
    detail = String(err?.message ?? body.message ?? "");
  } catch {
    detail = (await res.text().catch(() => "")).slice(0, 200);
  }
  const hint =
    res.status === 401 || res.status === 403
      ? " (check your API key)"
      : res.status === 429
        ? " (rate limited — try again shortly)"
        : res.status === 404
          ? " (check the model ID)"
          : "";
  throw new Error(`${provider} error ${res.status}${hint}: ${detail}`.trim());
}

// — OpenAI-compatible family ————————————————————————————————————————————————
async function* streamOpenAICompatible(o: Required<Pick<StreamOptions, "provider" | "model" | "messages">> &
  StreamOptions & { base: string }): AsyncGenerator<GatewayChunk> {
  const res = await fetch(`${o.base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${o.apiKey}`,
      ...(o.provider === "openrouter" ? { "HTTP-Referer": "https://you.local", "X-Title": "YOU Workspace" } : {}),
    },
    body: JSON.stringify({
      model: o.model,
      messages: o.messages,
      stream: true,
      stream_options: { include_usage: true },
      temperature: o.temperature ?? 0.7,
      max_tokens: o.maxTokens,
    }),
    signal: o.signal,
  });
  await assertOk(res, PROVIDERS[o.provider].name);
  for await (const data of readSSE(res)) {
    if (data === "[DONE]") { yield { done: true }; return; }
    try {
      const json = JSON.parse(data) as Record<string, unknown>;
      const delta = (json.choices as Array<Record<string, unknown>> | undefined)?.[0]
        ?.delta as Record<string, unknown> | undefined;
      const text = typeof delta?.content === "string" ? (delta.content as string) : "";
      const usage = json.usage as Record<string, number> | undefined;
      if (text) yield { text };
      if (usage) {
        yield { usage: { promptTokens: usage.prompt_tokens ?? 0, completionTokens: usage.completion_tokens ?? 0 } };
      }
    } catch {
      // ignore malformed keep-alive lines
    }
  }
  yield { done: true };
}

// — Anthropic ————————————————————————————————————————————————————————————————
async function* streamAnthropic(o: Required<Pick<StreamOptions, "provider" | "model" | "messages">> &
  StreamOptions & { base: string }): AsyncGenerator<GatewayChunk> {
  const system = o.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = o.messages.filter((m) => m.role !== "system");
  const res = await fetch(`${o.base}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": o.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: o.model,
      system: system || undefined,
      messages: rest.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      max_tokens: o.maxTokens ?? 4096,
      temperature: o.temperature ?? 0.7,
    }),
    signal: o.signal,
  });
  await assertOk(res, "Anthropic");
  let usage: { promptTokens: number; completionTokens: number } | undefined;
  for await (const data of readSSE(res)) {
    try {
      const json = JSON.parse(data) as Record<string, unknown>;
      const type = json.type as string | undefined;
      if (type === "content_block_delta") {
        const delta = json.delta as Record<string, unknown> | undefined;
        if (typeof delta?.text === "string" && delta.text) yield { text: delta.text as string };
      } else if (type === "message_start") {
        const msg = json.message as Record<string, unknown> | undefined;
        const u = msg?.usage as Record<string, number> | undefined;
        if (u) usage = { promptTokens: u.input_tokens ?? 0, completionTokens: 0 };
      } else if (type === "message_delta") {
        const u = json.usage as Record<string, number> | undefined;
        if (u && usage) usage.completionTokens = u.output_tokens ?? usage.completionTokens;
      } else if (type === "message_stop") {
        yield { done: true };
        if (usage) yield { usage };
        return;
      }
    } catch {
      // ignore
    }
  }
  if (usage) yield { usage };
  yield { done: true };
}

// — Gemini ————————————————————————————————————————————————————————————————————
async function* streamGemini(o: Required<Pick<StreamOptions, "provider" | "model" | "messages">> &
  StreamOptions & { base: string }): AsyncGenerator<GatewayChunk> {
  const system = o.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
  const rest = o.messages.filter((m) => m.role !== "system");
  const url = `${o.base}/v1beta/models/${encodeURIComponent(o.model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(o.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: system ? { parts: [{ text: system }] } : undefined,
      contents: rest.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: o.temperature ?? 0.7,
        maxOutputTokens: o.maxTokens,
      },
    }),
    signal: o.signal,
  });
  await assertOk(res, "Gemini");
  for await (const data of readSSE(res)) {
    try {
      const json = JSON.parse(data) as Record<string, unknown>;
      const cands = json.candidates as Array<Record<string, unknown>> | undefined;
      const parts = (cands?.[0]?.content as Record<string, unknown> | undefined)?.parts as
        | Array<{ text?: string }>
        | undefined;
      const text = (parts ?? []).map((p) => p.text ?? "").join("");
      if (text) yield { text };
      const usage = json.usageMetadata as Record<string, number> | undefined;
      if (usage) {
        yield {
          usage: {
            promptTokens: usage.promptTokenCount ?? 0,
            completionTokens: usage.candidatesTokenCount ?? 0,
          },
        };
      }
      if (cands?.[0]?.finishReason) { yield { done: true }; return; }
    } catch {
      // ignore
    }
  }
  yield { done: true };
}

// ── Credential validation ────────────────────────────────────────────────────

export async function validateCredential(
  provider: ProviderId,
  apiKey: string,
  baseUrl?: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await fetchModels(provider, apiKey, baseUrl);
  return error ? { ok: false, error } : { ok: true };
}
