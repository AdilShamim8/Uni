import { describe, expect, test } from "bun:test";
import { clientIp, rateLimit } from "@/lib/rate-limit";

describe("rateLimit (sliding window)", () => {
  test("allows events under the limit and blocks over it", () => {
    const key = `t-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(rateLimit(key, 5, 60_000).ok).toBe(true);
    }
    const blocked = rateLimit(key, 5, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
  });

  test("tracks keys independently", () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    rateLimit(a, 1, 60_000);
    expect(rateLimit(a, 1, 60_000).ok).toBe(false);
    expect(rateLimit(b, 1, 60_000).ok).toBe(true);
  });

  test("releases the window after it elapses", () => {
    const key = `w-${Math.random()}`;
    expect(rateLimit(key, 1, 10).ok).toBe(true);
    expect(rateLimit(key, 1, 10).ok).toBe(false);
    // Wait past the 10ms window.
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    return sleep(20).then(() => {
      expect(rateLimit(key, 1, 10).ok).toBe(true);
    });
  });
});

describe("clientIp", () => {
  test("takes the first x-forwarded-for entry", () => {
    const req = new Request("https://rewoo.tech/", {
      headers: { "x-forwarded-for": "203.0.113.7, 70.41.3.18" },
    });
    expect(clientIp(req)).toBe("203.0.113.7");
  });

  test("falls back through x-real-ip to 'unknown'", () => {
    const proxied = new Request("https://rewoo.tech/", { headers: { "x-real-ip": "198.51.100.9" } });
    expect(clientIp(proxied)).toBe("198.51.100.9");
    expect(clientIp(new Request("https://rewoo.tech/"))).toBe("unknown");
  });
});
