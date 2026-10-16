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
    console.error("[conversation] setup required:", setup.issue);
    return NextResponse.json(setup, { status: 503 });
  }
  console.error("[conversation]", err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}

type Params = { params: Promise<{ id: string }> };

/** Full conversation with messages (tenant-scoped). */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const row = await db.conversation.findFirst({
      where: { id, userId: user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!row) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    return NextResponse.json({ conversation: row });
  } catch (err) {
    return guard(err);
  }
}

/** Rename / pin / update model snapshot. */
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await req.json()) as { title?: string; pinned?: boolean; provider?: string; model?: string };
    const row = await db.conversation.findFirst({ where: { id, userId: user.id } });
    if (!row) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    const data: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const title = body.title.trim();
      if (!title) return NextResponse.json({ error: "Title cannot be empty." }, { status: 400 });
      data.title = title.slice(0, 200);
    }
    if (body.pinned !== undefined) data.pinned = !!body.pinned;
    if (body.provider !== undefined) data.provider = body.provider;
    if (body.model !== undefined) data.model = body.model;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }
    const updated = await db.conversation.update({ where: { id }, data });
    return NextResponse.json({ conversation: { id: updated.id, title: updated.title, pinned: updated.pinned, provider: updated.provider, model: updated.model, updatedAt: updated.updatedAt } });
  } catch (err) {
    return guard(err);
  }
}

/** Delete a conversation and (cascade) its messages. */
export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const row = await db.conversation.findFirst({ where: { id, userId: user.id } });
    if (!row) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    await db.conversation.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return guard(err);
  }
}
