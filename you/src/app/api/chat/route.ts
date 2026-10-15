import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireUser, Unauthorized } from "@/lib/auth";
import { decryptSecret } from "@/lib/crypto";
import { isProviderId, streamChat, type ChatMessage } from "@/lib/providers";

export const dynamic = "force-dynamic";

/**
 * POST /api/chat — streaming chat via the server-side model gateway.
 *
 * Body: { conversationId, credentialId | null, model, message, regenerate? }
 * When credentialId is null, the offline Demo brain answers (clearly labeled).
 *
 * Responds with an SSE stream of events:
 *   { type: "meta", demo, provider, model }
 *   { type: "delta", text }
 *   { type: "usage", promptTokens, completionTokens }
 *   { type: "done", userMessage, assistantMessage }
 *   { type: "error", message }
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      conversationId?: string;
      credentialId?: string | null;
      model?: string;
      message?: string;
      regenerate?: boolean;
      temperature?: number;
    };

    const conversation = await db.conversation.findFirst({
      where: { id: body.conversationId ?? "", userId: user.id },
    });
    if (!conversation) {
      return Response.json({ error: "Conversation not found." }, { status: 404 });
    }

    // ── Persist the user's message (unless regenerating) ─────────────────────
    let userMessage: { id: string; role: string; content: string; createdAt: Date } | null = null;
    if (!body.regenerate) {
      const text = (body.message ?? "").trim();
      if (!text) return Response.json({ error: "Message is empty." }, { status: 400 });
      if (text.length > 32000) return Response.json({ error: "Message is too long (32k char limit)." }, { status: 400 });
      userMessage = await db.message.create({
        data: { conversationId: conversation.id, role: "user", content: text },
      });
    }

    // ── History (everything before this turn) ────────────────────────────────
    const history = await db.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
    });
    // Drop a trailing assistant message when regenerating.
    const priorMessages: ChatMessage[] = history
      .filter((m) => !(body.regenerate && m.id === history[history.length - 1]?.id && m.role === "assistant"))
      .slice(-40) // context window management: cap history
      .map((m) => ({ role: m.role as ChatMessage["role"], content: m.content }));

    // ── Resolve the credential ───────────────────────────────────────────────
    const demo = !body.credentialId;
    let provider = "demo";
    let model = "demo-brain";
    let apiKey = "";
    let baseUrl: string | undefined;

    if (!demo) {
      const cred = await db.providerCredential.findFirst({
        where: { id: body.credentialId ?? "", userId: user.id },
      });
      if (!cred) return Response.json({ error: "Provider credential not found." }, { status: 404 });
      if (!isProviderId(cred.provider)) return Response.json({ error: "Unknown provider." }, { status: 400 });
      if (!body.model) return Response.json({ error: "Select a model first." }, { status: 400 });
      provider = cred.provider;
      model = body.model;
      apiKey = decryptSecret(cred.encryptedKey);
      baseUrl = cred.baseUrl ?? undefined;
    }

    await db.conversation.update({
      where: { id: conversation.id },
      data: { provider, model },
    });

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
          send({ type: "meta", demo, provider, model });

          if (demo) {
            // ── Offline Demo brain — clearly labeled, never pretending ────────
            const lastUser = [...priorMessages].reverse().find((m) => m.role === "user");
            const demoText = demoBrainResponse(lastUser?.content ?? "your message");
            for (const chunk of demoText.match(/[\s\S]{1,24}/g) ?? []) {
              if (abort.signal.aborted) break;
              send({ type: "delta", text: chunk });
              full += chunk;
              await new Promise((r) => setTimeout(r, 24));
            }
          } else {
            for await (const chunk of streamChat({
              provider: provider as never,
              apiKey,
              model,
              messages: [
                {
                  role: "system",
                  content:
                    "You are an assistant inside YOU, an open-source AI workspace. Be helpful, precise, and concise. Use Markdown when it aids clarity.",
                },
                ...priorMessages,
              ],
              baseUrl,
              temperature: body.temperature,
              signal: abort.signal,
            })) {
              if (chunk.text) {
                full += chunk.text;
                send({ type: "delta", text: chunk.text });
              }
              if (chunk.usage) usage = chunk.usage;
              if (chunk.error) send({ type: "error", message: chunk.error });
            }
          }

          if (!full.trim() && !abort.signal.aborted) {
            send({ type: "error", message: "The model returned an empty response." });
          }

          const assistantMessage = await db.message.create({
            data: {
              conversationId: conversation.id,
              role: "assistant",
              content: full,
              provider,
              model,
              demo,
              promptTokens: usage?.promptTokens ?? null,
              completionTokens: usage?.completionTokens ?? null,
            },
          });

          // Auto-title from the first exchange.
          if (conversation.title === "New conversation") {
            const firstUser = history.find((m) => m.role === "user");
            if (firstUser) {
              const title =
                firstUser.content.replace(/\s+/g, " ").trim().slice(0, 60) +
                (firstUser.content.length > 60 ? "…" : "");
              await db.conversation.update({
                where: { id: conversation.id },
                data: { title },
              });
            }
          }

          if (usage) send({ type: "usage", ...usage });
          send({ type: "done", userMessage, assistantMessage });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Streaming failed.";
          // Persist whatever streamed before the failure, so nothing is lost.
          if (full.trim()) {
            await db.message.create({
              data: {
                conversationId: conversation.id,
                role: "assistant",
                content: full + `\n\n_(stream interrupted: ${message})_`,
                provider, model, demo,
              },
            }).catch(() => {});
          }
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
    if (err instanceof Unauthorized) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("[chat]", err instanceof Error ? err.message : err);
    return Response.json({ error: "Chat failed." }, { status: 500 });
  }
}

function demoBrainResponse(question: string): string {
  return [
    "**Demo brain** — you're seeing the offline model because no provider credential is selected for this conversation.",
    "",
    "Everything else in this workspace is real: your account, this conversation, and the messages you send are persisted. To talk to a live model:",
    "",
    "1. Open **Settings → Providers**",
    "2. Add an API key for OpenAI, Anthropic, Gemini, OpenRouter, Groq, or Mistral (or any OpenAI-compatible endpoint like Ollama)",
    "3. Pick a model in the chat composer",
    "",
    "---",
    "",
    `Your message was:`,
    "",
    `> ${question.slice(0, 500)}`,
    "",
    "When a live model is connected, its answer streams here with token usage and full persistence.",
  ].join("\n");
}
