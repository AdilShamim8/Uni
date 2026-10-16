# Security

## Threat model (v0.3)

ReWoo is a **multi-user, self-hostable web application** (or your own Vercel deployment). Anyone who
can reach the deployment can attempt to create an account, so the app assumes an untrusted network
by default and treats provider API keys as high-value secrets.

## Built-in protections

| Area | Protection |
|---|---|
| Passwords | scrypt with per-user random salt (node:crypto, no external dependency); constant-time verification. |
| Sessions | 32-byte random tokens in httpOnly, SameSite=Lax cookies; only the SHA-256 hash is stored, so a database leak does not yield usable tokens; 30-day sliding expiry. |
| Sign-in / sign-up | Sliding-window rate limits per IP (10/min sign-in, 5/min sign-up) with `Retry-After` responses; constant-shape errors that don't reveal whether an email exists. |
| Provider keys | Encrypted at rest with AES-256-GCM (`REWOO_MASTER_KEY`); decrypted only inside server-side routes; APIs return masked previews only (`sk-a•••wxyz`). |
| Tenant isolation | Every database query is scoped by the session user; enforced by automated two-user isolation tests. |
| Chat / model calls | Per-user rate limit (30 turns/min); provider errors are normalized (no key material in error messages); streaming preserves partial output on failure. |
| Input validation | Email/password policy; message length caps; credential labels and API keys length-capped; provider IDs validated against a whitelist. |
| Secrets in git | `.env` is gitignored; `.env.example` documents every variable; no secrets in client code (the model gateway is server-side only). |

### Serverless caveat (Vercel)

The built-in rate limiter is in-memory, so on serverless each function instance enforces its own
counters. It stops bursts but is not a global quota. For strict quotas, front the deployment with
Vercel WAF or a shared-store limiter (e.g. Upstash Ratelimit).

## Self-hosting checklist

1. Set `REWOO_MASTER_KEY` (`openssl rand -hex 32`) **before** the first user stores a credential.
2. Use PostgreSQL in production (see docs/DEPLOYMENT.md).
3. Serve over TLS (Vercel does this automatically; otherwise terminate TLS at your proxy).
4. Keep your deployment's database backed up — provider credentials cannot be recovered without the master key.

## Reporting a vulnerability

Please email **adilshamim696@gmail.com** with details and steps to reproduce. Don't open a public
issue for security problems. You'll get an acknowledgement within 72 hours.
