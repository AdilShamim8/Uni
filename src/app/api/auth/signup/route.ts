import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, hashPassword, validateEmail, validatePassword } from "@/lib/auth";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { setupErrorBody } from "@/lib/setup";

export async function POST(req: NextRequest) {
  try {
    // Creation guard: 5 sign-ups per minute per IP.
    const rl = rateLimit(`signup:${clientIp(req)}`, 5, 60_000);
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec, "Too many sign-up attempts. Try again shortly.");

    const body = (await req.json()) as { email?: string; password?: string; name?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    const name = (body.name ?? "").trim() || null;

    if (!validateEmail(email)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    const pwError = validatePassword(password);
    if (pwError) {
      return NextResponse.json({ error: pwError }, { status: 400 });
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
    }

    const user = await db.user.create({
      data: { email, name, passwordHash: hashPassword(password) },
      select: { id: true, email: true, name: true },
    });
    await createSession(user.id);
    return NextResponse.json({ user });
  } catch (err) {
    const setup = setupErrorBody(err);
    if (setup) {
      console.error("[signup] setup required:", setup.issue);
      return NextResponse.json(setup, { status: 503 });
    }
    console.error("[signup]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not create the account. Try again." }, { status: 500 });
  }
}
