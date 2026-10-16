import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Unauthorized, requireUser } from "@/lib/auth";
import { setupErrorBody } from "@/lib/setup";
import { decryptSecret, encryptSecret, maskKey } from "@/lib/crypto";
import { isProviderId, PROVIDERS, validateCredential } from "@/lib/providers";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const maxDuration = 30;

function guard(err: unknown) {
  if (err instanceof Unauthorized) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const setup = setupErrorBody(err);
  if (setup) {
    console.error("[providers] setup required:", setup.issue);
    return NextResponse.json(setup, { status: 503 });
  }
  console.error("[providers]", err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}

/** List the signed-in user's provider credentials (keys masked, never returned). */
export async function GET() {
  try {
    const user = await requireUser();
    const rows = await db.providerCredential.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({
      providers: rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        label: r.label,
        baseUrl: r.baseUrl,
        maskedKey: maskKey(decryptSecret(r.encryptedKey)),
        lastValidatedAt: r.lastValidatedAt,
        lastError: r.lastError,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    return guard(err);
  }
}

/** Add a provider credential (BYOK). Key is encrypted before it touches disk. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    // Outbound-call guard: 10 credential additions per minute per user.
    const rl = rateLimit(`providers-add:${user.id}`, 10, 60_000);
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

    const body = (await req.json()) as {
      provider?: string;
      label?: string;
      apiKey?: string;
      baseUrl?: string;
    };
    const provider = body.provider ?? "";
    if (!isProviderId(provider)) {
      return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
    }
    const apiKey = (body.apiKey ?? "").trim();
    if (!apiKey) {
      return NextResponse.json({ error: "API key is required." }, { status: 400 });
    }
    if (apiKey.length > 4096) {
      return NextResponse.json({ error: "API key is too long." }, { status: 400 });
    }
    const baseUrl = (body.baseUrl ?? "").trim() || null;
    if (PROVIDERS[provider].requiresBaseUrl && !baseUrl) {
      return NextResponse.json(
        { error: "A base URL is required for custom OpenAI-compatible providers." },
        { status: 400 }
      );
    }
    const label =
      (body.label ?? "").trim() ||
      PROVIDERS[provider].name +
        " " +
        ((await db.providerCredential.count({ where: { userId: user.id, provider } })) + 1);

    const dup = await db.providerCredential.findUnique({
      where: { userId_provider_label: { userId: user.id, provider, label } },
    });
    if (dup) {
      return NextResponse.json({ error: "A credential with this label already exists." }, { status: 409 });
    }

    // Validate against the live provider before storing (best-effort).
    const check = await validateCredential(provider, apiKey, baseUrl ?? undefined);

    const row = await db.providerCredential.create({
      data: {
        userId: user.id,
        provider,
        label,
        baseUrl,
        encryptedKey: encryptSecret(apiKey),
        lastValidatedAt: check.ok ? new Date() : null,
        lastError: check.ok ? null : (check.error ?? null),
      },
    });
    return NextResponse.json({
      provider: {
        id: row.id,
        provider: row.provider,
        label: row.label,
        baseUrl: row.baseUrl,
        maskedKey: maskKey(apiKey),
        lastValidatedAt: row.lastValidatedAt,
        lastError: row.lastError,
        createdAt: row.createdAt,
      },
      validated: check.ok,
      validationError: check.error ?? null,
    });
  } catch (err) {
    return guard(err);
  }
}
