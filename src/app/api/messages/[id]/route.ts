import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Unauthorized, requireUser } from "@/lib/auth";
import { setupErrorBody } from "@/lib/setup";

function guard(err: unknown) {
  if (err instanceof Unauthorized) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  const setup = setupErrorBody(err);
  if (setup) {
    console.error("[message] setup required:", setup.issue);
    return NextResponse.json(setup, { status: 503 });
  }
  console.error("[message]", err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}

type Params = { params: Promise<{ id: string }> };

/**
 * DELETE /api/messages/[id] — remove a single message from a conversation
 * owned by the session user (used by the regenerate flow to replace the last
 * assistant turn cleanly instead of stacking duplicates).
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const row = await db.message.findFirst({
      where: { id, conversation: { userId: user.id } },
    });
    if (!row) return NextResponse.json({ error: "Message not found." }, { status: 404 });
    await db.message.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return guard(err);
  }
}
