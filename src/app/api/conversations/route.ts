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
    console.error("[conversations] setup required:", setup.issue);
    return NextResponse.json(setup, { status: 503 });
  }
  console.error("[conversations]", err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
}

/** List conversations for the signed-in user (newest first). */
export async function GET() {
  try {
    const user = await requireUser();
    const rows = await db.conversation.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, title: true, provider: true, model: true, pinned: true,
        createdAt: true, updatedAt: true,
        messages: { select: { id: true }, take: 1 },
      },
    });
    return NextResponse.json({
      conversations: rows.map((r) => ({
        id: r.id, title: r.title, provider: r.provider, model: r.model,
        pinned: r.pinned, createdAt: r.createdAt, updatedAt: r.updatedAt,
        messageCount: undefined,
      })),
    });
  } catch (err) {
    return guard(err);
  }
}

/** Create a new conversation. */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json().catch(() => ({}))) as { title?: string; provider?: string; model?: string };
    const row = await db.conversation.create({
      data: {
        userId: user.id,
        title: (body.title ?? "").trim() || "New conversation",
        provider: body.provider ?? null,
        model: body.model ?? null,
      },
    });
    return NextResponse.json({ conversation: { id: row.id, title: row.title, provider: row.provider, model: row.model, pinned: row.pinned, createdAt: row.createdAt, updatedAt: row.updatedAt } });
  } catch (err) {
    return guard(err);
  }
}
