import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Unauthorized, requireUser } from "@/lib/auth";
import { decryptSecret, encryptSecret, maskKey } from "@/lib/crypto";
import { validateCredential } from "@/lib/providers";

function guard(err: unknown) {
  if (err instanceof Unauthorized) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  throw err;
}

type Params = { params: Promise<{ id: string }> };

/** Rotate the key or rename the label of a credential. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await req.json()) as { apiKey?: string; label?: string };

    const row = await db.providerCredential.findFirst({ where: { id, userId: user.id } });
    if (!row) return NextResponse.json({ error: "Credential not found." }, { status: 404 });

    const data: Record<string, unknown> = {};
    if (body.apiKey !== undefined) {
      const apiKey = body.apiKey.trim();
      if (!apiKey) return NextResponse.json({ error: "API key cannot be empty." }, { status: 400 });
      data.encryptedKey = encryptSecret(apiKey);
      const check = await validateCredential(
        row.provider as never,
        apiKey,
        row.baseUrl ?? undefined
      );
      data.lastValidatedAt = check.ok ? new Date() : null;
      data.lastError = check.ok ? null : (check.error ?? null);
    }
    if (body.label !== undefined) {
      const label = body.label.trim();
      if (!label) return NextResponse.json({ error: "Label cannot be empty." }, { status: 400 });
      data.label = label;
    }
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const updated = await db.providerCredential.update({ where: { id }, data });
    return NextResponse.json({
      provider: {
        id: updated.id,
        provider: updated.provider,
        label: updated.label,
        baseUrl: updated.baseUrl,
        maskedKey: maskKey(body.apiKey?.trim() ?? decryptSecret(updated.encryptedKey)),
        lastValidatedAt: updated.lastValidatedAt,
        lastError: updated.lastError,
        createdAt: updated.createdAt,
      },
    });
  } catch (err) {
    return guard(err);
  }
}

/** Delete a credential. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const row = await db.providerCredential.findFirst({ where: { id, userId: user.id } });
    if (!row) return NextResponse.json({ error: "Credential not found." }, { status: 404 });
    await db.providerCredential.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return guard(err);
  }
}
