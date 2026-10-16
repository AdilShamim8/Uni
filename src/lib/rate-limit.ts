/**
 * Lightweight in-memory sliding-window rate limiter.
 *
 * Designed for ReWoo's single-process deployments (self-hosted Node,
 * Docker, `next start`). On serverless platforms (Vercel) each function
 * instance keeps its own counters, so limits are enforced per-instance —
 * still an effective burst guard, but not a global quota. For strict
 * global limits, put a limiter (e.g. Vercel WAF / Upstash) in front.
 *
 * No external dependencies; buckets self-clean when the map grows.
 */

interface RateLimitResult {
  ok: boolean;
  /** seconds until the oldest hit leaves the window (when not ok) */
  retryAfterSec: number;
}

const buckets = new Map<string, number[]>();
const MAX_TRACKED_KEYS = 10_000;

/** Allow at most `limit` events per `windowMs` for `key`. */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);

  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)) };
  }

  hits.push(now);
  buckets.set(key, hits);

  // Opportunistic cleanup: sweep expired keys once the map grows large.
  if (buckets.size > MAX_TRACKED_KEYS) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }

  return { ok: true, retryAfterSec: 0 };
}

/** Best-effort client IP from proxy headers (Vercel/nginx set x-forwarded-for). */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Standard 429 response with a Retry-After header. */
export function tooManyRequests(retryAfterSec: number, message = "Too many requests. Please slow down."): Response {
  return Response.json({ error: message }, { status: 429, headers: { "Retry-After": String(retryAfterSec) } });
}
