import { NextRequest } from "next/server";
import { fetchModels, isProviderId, PROVIDERS } from "@/lib/providers";
import { rateLimit, tooManyRequests, clientIp } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * POST /api/models/direct — live model discovery for Local Mode.
 *
 * Body: { provider, apiKey, baseUrl? }
 * The key is used for this single upstream call, then discarded — never
 * persisted, never logged. IP rate-limited (10/min) to deter key testing.
 */
export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(`models-direct:${clientIp(req)}`, 10, 60_000);
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

    const body = (await req.json()) as {
      provider?: string;
      apiKey?: string;
      baseUrl?: string;
    };

    if (!body.provider || !isProviderId(body.provider)) {
      return Response.json({ error: "Unknown provider." }, { status: 400 });
    }
    if (typeof body.apiKey !== "string" || body.apiKey.length < 8 || body.apiKey.length > 4096) {
      return Response.json({ error: "A provider API key is required." }, { status: 400 });
    }
    const baseUrl = typeof body.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl.trim() : undefined;

    const { models, error } = await fetchModels(body.provider, body.apiKey, baseUrl);
    return Response.json({
      provider: body.provider,
      providerName: PROVIDERS[body.provider].name,
      models,
      source: "live" as const,
      error: error ?? null,
    });
  } catch (err) {
    console.error("[models/direct]", err instanceof Error ? err.message : err);
    return Response.json({ error: "Model discovery failed." }, { status: 500 });
  }
}
