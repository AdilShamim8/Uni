import { describe, expect, test } from "bun:test";
import { hashPassword, validateEmail, validatePassword, verifyPassword } from "@/lib/auth";

describe("password hashing (scrypt)", () => {
  test("hashes and verifies a correct password", () => {
    const stored = hashPassword("correct horse battery 7");
    expect(stored.startsWith("scrypt$")).toBe(true);
    expect(stored).not.toContain("correct horse");
    expect(verifyPassword("correct horse battery 7", stored)).toBe(true);
  });

  test("rejects a wrong password", () => {
    const stored = hashPassword("right-password-1");
    expect(verifyPassword("wrong-password-1", stored)).toBe(false);
  });

  test("salts every hash (unique stored values)", () => {
    expect(hashPassword("same-password-1")).not.toBe(hashPassword("same-password-1"));
  });

  test("rejects malformed stored hashes without throwing", () => {
    expect(verifyPassword("whatever", "not-a-hash")).toBe(false);
    expect(verifyPassword("whatever", "bcrypt$aa$bb")).toBe(false);
    expect(verifyPassword("whatever", "scrypt$zz")).toBe(false);
  });
});

describe("input validation", () => {
  test("accepts sane emails", () => {
    expect(validateEmail("user@example.com")).toBe(true);
    expect(validateEmail("first.last+tag@sub.domain.org")).toBe(true);
  });

  test("rejects malformed emails", () => {
    expect(validateEmail("no-at-sign")).toBe(false);
    expect(validateEmail("a@b")).toBe(false);
    expect(validateEmail("a b@c.d")).toBe(false);
    expect(validateEmail("")).toBe(false);
    expect(validateEmail(`${"x".repeat(250)}@example.com`)).toBe(false);
  });

  test("enforces password policy", () => {
    expect(validatePassword("short1")).not.toBeNull(); // too short
    expect(validatePassword("allletters")).not.toBeNull(); // no digit
    expect(validatePassword("12345678")).not.toBeNull(); // no letter
    expect(validatePassword("good-password-1")).toBeNull();
  });
});
