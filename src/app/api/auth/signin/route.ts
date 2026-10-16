import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, verifyPassword } from "@/lib/auth";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { setupErrorBody } from "@/lib/setup";

export async function POST(req: NextRequest) {
  try {
    // Brute-force guard: 10 attempts per minute per IP.
    const rl = rateLimit(`signin:${clientIp(req)}`, 10, 60_000);
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec, "Too many sign-in attempts. Try again shortly.");

    const body = (await req.json()) as { email?: string; password?: string };
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { email } });
    // Constant-shape response: same error for unknown email and wrong password.
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "Incorrect email or password." }, { status: 401 });
    }

    await createSession(user.id);
    return NextResponse.json({ user: { id: user.id, email: user.email, name: user.name } });
  } catch (err) {
    const setup = setupErrorBody(err);
    if (setup) {
      console.error("[signin] setup required:", setup.issue);
      return NextResponse.json(setup, { status: 503 });
    }
    console.error("[signin]", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not sign in. Try again." }, { status: 500 });
  }
}
