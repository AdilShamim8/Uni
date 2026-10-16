import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Unauthorized, requireUser } from "@/lib/auth";
import { setupErrorBody } from "@/lib/setup";
import { decryptSecret } from "@/lib/crypto";
import { fallbackModels, fetchModels, isProviderId, PROVIDERS, type ProviderId } from "@/lib/providers";

export const maxDuration = 30;

function guard(err: unknown) {
  if (err instanceof Unauthorized) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const setup = setupErrorBody(err);
  if (setup) {
    console.error("[models] setup required:", setup.issue);
    return NextResponse.json(setup, { status: 503 });
  }
  console.error("[models]", err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}

/**
 * Live model discovery. Requires a stored credential.
 * Falls back to a small labeled catalog when the provider list endpoint is
 * unreachable — `source: "fallback"` tells the UI to say so honestly.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();
    const credentialId = req.nextUrl.searchParams.get("credentialId") ?? "";
    const row = await db.providerCredential.findFirst({
      where: { id: credentialId, userId: user.id },
    });
    if (!row) {
      return NextResponse.json({ error: "Credential not found." }, { status: 404 });
    }
    if (!isProviderId(row.provider)) {
      return NextResponse.json({ error: "Unknown provider type." }, { status: 400 });
    }
    const provider: ProviderId = row.provider;
    const { models, error } = await fetchModels(
      provider,
      decryptSecret(row.encryptedKey),
      row.baseUrl ?? undefined
    );
    const usingFallback = models.length === 0;
    return NextResponse.json({
      provider,
      providerName: PROVIDERS[provider].name,
      models: usingFallback ? fallbackModels(provider) : models,
      source: usingFallback ? "fallback" : "live",
      error: usingFallback ? (error ?? "Live discovery unavailable — showing fallback catalog.") : null,
    });
  } catch (err) {
    return guard(err);
  }
}
