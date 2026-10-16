import { describe, expect, test } from "bun:test";
import {
  classifyDbError,
  DB_ISSUE_MESSAGES,
  SETUP_REQUIRED_CODE,
  setupErrorBody,
  type DbSetupIssue,
} from "@/lib/setup";

/** Helper: build a Prisma-shaped error (message + machine code). */
function prismaError(code: string, message: string): Error {
  const err = new Error(message) as Error & { code?: string };
  err.code = code;
  return err;
}

describe("setup diagnostics — classifyDbError", () => {
  test("SQLite on a read-only serverless filesystem → serverless-sqlite", () => {
    expect(classifyDbError(new Error("Error code 14: Unable to open the database file"))).toBe("serverless-sqlite");
    expect(classifyDbError(new Error("attempt to write a readonly database"))).toBe("serverless-sqlite");
    expect(classifyDbError(new Error("disk I/O error at offset 0"))).toBe("serverless-sqlite");
  });

  test("missing DATABASE_URL → not-configured", () => {
    expect(classifyDbError(new Error("Environment variable not found: DATABASE_URL."))).toBe("not-configured");
    expect(classifyDbError(new Error("Environment variable not found: `DATABASE_URL`"))).toBe("not-configured");
  });

  test("URL/build mismatch → not-configured", () => {
    expect(classifyDbError(new Error("Error validating datasource `db`: the URL must start with `postgresql:`"))).toBe(
      "not-configured"
    );
  });

  test("schema never pushed → schema-missing", () => {
    expect(classifyDbError(prismaError("P2021", 'The table `main.User` does not exist in the current database.'))).toBe(
      "schema-missing"
    );
    expect(classifyDbError(prismaError("P2022", "The column `main.User.name` does not exist"))).toBe("schema-missing");
    expect(classifyDbError(new Error("The table `public.User` does not exist in the current database."))).toBe(
      "schema-missing"
    );
    // Raw SQLite phrasing (no Prisma error code attached).
    expect(classifyDbError(new Error('no such table: User'))).toBe("schema-missing");
  });

  test("connection failures → unreachable", () => {
    expect(classifyDbError(prismaError("P1001", "Can't reach database server at `db.example.com`"))).toBe("unreachable");
    expect(classifyDbError(prismaError("P1002", "Timed out fetching a new connection"))).toBe("unreachable");
    expect(classifyDbError(prismaError("P1010", "User `x` was denied access"))).toBe("unreachable");
    expect(classifyDbError(new Error("Connection terminated unexpectedly"))).toBe("unreachable");
    expect(classifyDbError(new Error("password authentication failed for user \"postgres\""))).toBe("unreachable");
  });

  test("application errors are NOT classified as setup problems", () => {
    expect(classifyDbError(prismaError("P2002", "Unique constraint failed on the fields: (`userId`,`provider`)"))).toBeNull();
    expect(classifyDbError(prismaError("P2025", "An operation failed because it depends on one or more records"))).toBeNull();
    expect(classifyDbError(new Error("Regular application failure"))).toBeNull();
    expect(classifyDbError(null)).toBeNull();
    expect(classifyDbError("just a string")).toBeNull();
  });
});

describe("setup diagnostics — setupErrorBody", () => {
  test("builds a 503-ready body for infrastructure errors", () => {
    const body = setupErrorBody(new Error("Error code 14: Unable to open the database file"));
    expect(body).not.toBeNull();
    expect(body!.code).toBe(SETUP_REQUIRED_CODE);
    expect(body!.issue).toBe("serverless-sqlite");
    expect(body!.error).toBe(DB_ISSUE_MESSAGES["serverless-sqlite" as DbSetupIssue]);
    expect(body!.error.length).toBeGreaterThan(40); // guidance, not a raw error dump
  });

  test("returns null for application errors (routes keep their own handling)", () => {
    expect(setupErrorBody(prismaError("P2002", "Unique constraint failed"))).toBeNull();
    expect(setupErrorBody(new Error("boom"))).toBeNull();
  });

  test("every classified issue has actionable guidance", () => {
    const issues: DbSetupIssue[] = ["not-configured", "serverless-sqlite", "unreachable", "schema-missing"];
    for (const issue of issues) {
      expect(DB_ISSUE_MESSAGES[issue].length).toBeGreaterThan(60);
      expect(DB_ISSUE_MESSAGES[issue]).toMatch(/database|DATABASE_URL|schema/i);
    }
  });
});
