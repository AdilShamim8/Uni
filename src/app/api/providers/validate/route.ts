import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Unauthorized, requireUser } from "@/lib/auth";
import { setupErrorBody } from "@/lib/setup";
import { decryptSecret } from "@/lib/crypto";
import { validateCredential } from "@/lib/providers";

function guard(err: unknown) {
  if (err instanceof Unauthorized) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const setup = setupErrorBody(err);
  if (setup) {
    console.error("[providers-validate] setup required:", setup.issue);
    return NextResponse.json(setup, { status: 503 });
  }
  console.error("[providers-validate]", err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}

/** Re-validate a stored credential against the live provider. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as { id?: string };
    const row = await db.providerCredential.findFirst({
      where: { id: body.id ?? "", userId: user.id },
    });
    if (!row) return NextResponse.json({ error: "Credential not found." }, { status: 404 });

    const check = await validateCredential(
      row.provider as never,
      decryptSecret(row.encryptedKey),
      row.baseUrl ?? undefined
    );
    await db.providerCredential.update({
      where: { id: row.id },
      data: { lastValidatedAt: check.ok ? new Date() : null, lastError: check.error ?? null },
    });
    return NextResponse.json({ ok: check.ok, error: check.error ?? null });
  } catch (err) {
    return guard(err);
  }
}
