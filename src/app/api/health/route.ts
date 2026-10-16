import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { classifyDbError, DB_ISSUE_MESSAGES, type DbSetupIssue } from "@/lib/setup";
import { masterKeySource } from "@/lib/crypto";

/**
 * GET /api/health — deployment diagnostics.
 *
 * Probes a real table (not just `SELECT 1`) so a reachable-but-empty database
 * (schema never pushed) is reported as a distinct setup problem. Reports safe
 * enum values + guidance — never secrets. Returns HTTP 503 when setup is
 * required so uptime monitors and humans see the truth, and the client
 * renders the setup screen instead of a broken workspace.
 */
export async function GET() {
  let dbIssue: DbSetupIssue | null = null;
  try {
    await db.user.findFirst({ select: { id: true } });
  } catch (err) {
    dbIssue = classifyDbError(err) ?? "unreachable";
  }

  const keySource = masterKeySource();
  const setupRequired = dbIssue !== null || keySource === "ephemeral";

  return NextResponse.json(
    {
      ok: !setupRequired,
      service: "rewoo-workspace",
      db: dbIssue === null,
      dbIssue,
      dbMessage: dbIssue ? DB_ISSUE_MESSAGES[dbIssue] : null,
      masterKey: keySource,
      setupRequired,
      time: new Date().toISOString(),
    },
    { status: setupRequired ? 503 : 200 }
  );
}
