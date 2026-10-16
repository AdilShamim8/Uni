import { NextRequest } from "next/server";
import { isProviderId, streamChat, type ChatMessage } from "@/lib/providers";
import { rateLimit, tooManyRequests, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
// Vercel: allow long streaming responses (Hobby plan max).
export const maxDuration = 60;

/**
 * POST /api/chat/direct — stateless streaming chat for Local Mode.
 *
 * Body: { provider, apiKey, baseUrl?, model, messages[], temperature? }
 *
 * Unlike /api/chat this route touches NO database and NO session: the caller
 * (a guest on an unconfigured deployment) supplies a provider key per request
 * and owns the conversation state entirely in their browser. The key is used
 * for this single upstream call and then discarded:
 *   - never persisted, never logged, never echoed in errors
 *   - IP rate-limited (burst guard against key-testing abuse)
 *
 * Emits the same SSE protocol as /api/chat (meta/delta/usage/done/error).
 */

const MAX_MESSAGES = 60;
const MAX_MESSAGE_CHARS = 32_000;
const MAX_TOTAL_CHARS = 200_000;
const MAX_KEY_CHARS = 4_096;

export async function POST(req: NextRequest) {
  try {
    // Burst guard per IP: 20 direct turns / minute (this route is keyless
    // from the server's perspective, so it is the natural abuse surface).
    const rl = rateLimit(`chat-direct:${clientIp(req)}`, 20, 60_000);
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

    const body = (await req.json()) as {
      provider?: string;
      apiKey?: string;
      baseUrl?: string;
      model?: string;
      messages?: ChatMessage[];
      temperature?: number;
    };

    // ── Strict validation (never echo input values in errors) ────────────────
    if (!body.provider || !isProviderId(body.provider)) {
      return Response.json({ error: "Unknown provider." }, { status: 400 });
    }
    if (typeof body.apiKey !== "string" || body.apiKey.length < 8 || body.apiKey.length > MAX_KEY_CHARS) {
      return Response.json({ error: "A provider API key is required for live models." }, { status: 400 });
    }
    if (!body.model || typeof body.model !== "string" || body.model.length > 200) {
      return Response.json({ error: "Select a model first." }, { status: 400 });
    }
    const messages = Array.isArray(body.messages) ? body.messages : [];
    if (messages.length === 0 || messages.length > MAX_MESSAGES) {
      return Response.json({ error: `Send between 1 and ${MAX_MESSAGES} messages.` }, { status: 400 });
    }
    let total = 0;
    for (const m of messages) {
      if (!m || (m.role !== "user" && m.role !== "assistant" && m.role !== "system")) {
        return Response.json({ error: "Invalid message list." }, { status: 400 });
      }
      if (typeof m.content !== "string") {
        return Response.json({ error: "Invalid message content." }, { status: 400 });
      }
      if (m.content.length > MAX_MESSAGE_CHARS) {
        return Response.json({ error: "A message exceeds the 32k character limit." }, { status: 400 });
      }
      total += m.content.length;
    }
    if (total > MAX_TOTAL_CHARS) {
      return Response.json({ error: "Conversation is too long for a single request." }, { status: 400 });
    }
    const temperature =
      typeof body.temperature === "number" && Number.isFinite(body.temperature)
        ? Math.min(Math.max(body.temperature, 0), 2)
        : undefined;

    const provider = body.provider;
    const apiKey = body.apiKey;
    const baseUrl = typeof body.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl.trim() : undefined;

    // Defense-in-depth: never let any error path leak the key back to the
    // client (e.g. if an upstream error message quotes the request URL).
    const sanitize = (msg: string) => msg.split(apiKey).join("•••");

    // ── SSE plumbing ─────────────────────────────────────────────────────────
    const encoder = new TextEncoder();
    const abort = new AbortController();
    req.signal.addEventListener("abort", () => abort.abort(), { once: true });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        let full = "";
        let usage: { promptTokens: number; completionTokens: number } | undefined;

        try {
          send({ type: "meta", demo: false, provider, model: body.model! });
          for await (const chunk of streamChat({
            provider,
            apiKey,
            model: body.model!,
            messages,
            baseUrl,
            temperature,
            signal: abort.signal,
          })) {
            if (chunk.text) {
              full += chunk.text;
              send({ type: "delta", text: chunk.text });
            }
            if (chunk.usage) usage = chunk.usage;
            if (chunk.error) send({ type: "error", message: sanitize(chunk.error) });
          }
          if (!full.trim() && !abort.signal.aborted) {
            send({ type: "error", message: "The model returned an empty response." });
          }
          if (usage) send({ type: "usage", ...usage });
          send({ type: "done", userMessage: null, assistantMessage: null });
        } catch (err) {
          const message = sanitize(err instanceof Error ? err.message : "Streaming failed.");
          send({ type: "error", message });
          send({ type: "done", userMessage: null, assistantMessage: null });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    // Log without the body (which contains the key) — message text only.
    console.error("[chat/direct]", err instanceof Error ? err.message : err);
    return Response.json({ error: "Chat failed." }, { status: 500 });
  }
}
