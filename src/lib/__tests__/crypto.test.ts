import { describe, expect, test } from "bun:test";
import { decryptSecret, encryptSecret, maskKey } from "@/lib/crypto";

describe("credential vault (AES-256-GCM)", () => {
  test("round-trips a provider API key", () => {
    const key = "sk-test-0123456789abcdef";
    const payload = encryptSecret(key);
    expect(payload).not.toContain(key);
    expect(decryptSecret(payload)).toBe(key);
  });

  test("produces a different ciphertext per call (random IV)", () => {
    const a = encryptSecret("sk-same-input");
    const b = encryptSecret("sk-same-input");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("sk-same-input");
    expect(decryptSecret(b)).toBe("sk-same-input");
  });

  test("detects tampering (auth tag verification)", () => {
    const payload = encryptSecret("sk-sensitive");
    const [iv, tag, data] = payload.split(":");
    // Flip one character of the ciphertext body.
    const tamperedData = data.slice(0, -2) + (data.endsWith("A=") ? "B=" : "A=");
    expect(() => decryptSecret([iv, tag, tamperedData].join(":"))).toThrow();
  });

  test("rejects malformed ciphertext", () => {
    expect(() => decryptSecret("not-a-payload")).toThrow(/Malformed/);
    expect(() => decryptSecret("a:b:c")).toThrow();
  });

  test("masks keys for client display without leaking the middle", () => {
    const masked = maskKey("sk-abcdefgh12345678wxyz");
    expect(masked).toContain("sk-a");
    expect(masked).toContain("wxyz");
    expect(masked).not.toContain("12345678");
    expect(masked).toContain("•");
  });

  test("fully masks very short keys", () => {
    expect(maskKey("abc")).toBe("•••");
    expect(maskKey("12345678")).toBe("••••••••");
  });
});
