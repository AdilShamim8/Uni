# opensource-reuse.md — reuse ledger

Every package dependency and every adapted/vendored file is recorded here.
License texts live under `third_party/licenses/`; notices in
`THIRD_PARTY_NOTICES.md`. A permissive root license is a candidate signal,
not unconditional clearance: each incorporation still requires checking the
exact release, file headers, subdirectory licenses, NOTICE files, and
transitive dependencies.

## Section 1 — Installed packages (dependencies)

Recorded at introduction; re-generate the full inventory from the lockfile
at B08 (`npm ls --all` + license scan) and pin it. Versions below are the
resolved versions in `backend/package-lock.json` as of B01 (2026-10-23).

| Package | Version | License | Introduced | Purpose |
| --- | --- | --- | --- | --- |
| fastify | 5.12.7 | MIT | B01 | HTTP server, plugin encapsulation, injection testing |
| @fastify/cors | 11.3.1 | MIT | B01 | Explicit-origin credentialed CORS for browser integration |
| zod | 3.25.76 | MIT | B01 | Input/output validation, contract schemas (backend + contracts) |
| drizzle-orm | 0.45.4 | Apache-2.0 | B01 | Typed PostgreSQL queries and migrations |
| drizzle-kit (dev) | 0.31.11 | MIT | B01 | Migration SQL generation |
| pg (node-postgres) | 8.23.1 | MIT | B01 | PostgreSQL client (pg-boss-compatible driver) |
| pino | 9.14.0 | MIT | B01 | Structured logging with secret redaction |
| dotenv | 18.0.9 | BSD-2-Clause | B01 | Local-development .env loading (never production) |
| vitest (dev) | 2.1.9 | MIT | B01 | Backend unit + integration tests |
| tsx (dev) | 4.23.15 | MIT | B01 | Development runner / migration runner |
| typescript (dev) | 5.6.3 | Apache-2.0 | B01 | Type checking and builds |
| embedded-postgres (dev/test) | 18.4.0-beta.17 | MIT | B01 | Real PostgreSQL binaries for disposable integration tests |
| better-auth | 1.7.12 | MIT | B02 | Authentication, session lifecycle |
| @ai-sdk/* (core + openai + anthropic) | (planned) | Apache-2.0 | B03 | Provider adapters, streaming, cancellation |
| pg-boss | (planned) | MIT | B06 | PostgreSQL-backed durable jobs |

License texts for the B01 set are preserved under `third_party/licenses/`
and summarized in `THIRD_PARTY_NOTICES.md`. Frontend dependencies
(React, Vite, Zustand, react-markdown, Papa Parse, Vitest, Testing
Library, lucide-react, react-router-dom, tailwindcss) pre-date the
B-gates and are recorded in `frontend/package.json`.

## Section 2 — Adapted files (vendored or substantially copied source)

Format: upstream repo @ commit → upstream path → local path → license →
modifications → validation.

| # | Upstream | Local path | License | Modifications | Validation |
| --- | --- | --- | --- | --- | --- |
| 2 | openclaw/openclaw @ `29397d2a185c29d4b4d79d2ad41af0f7cf1f6a9b` → `packages/agent-core/src/repetition-guard.ts` + `repetition-guard.test.ts` + `repetition-guard.test-fixtures.ts` | `backend/src/vendor/openclaw/` + `backend/tests/vendor-openclaw-repetition-guard.test.ts` | MIT (c) 2026 OpenClaw Foundation; file itself adapts Hermes Agent (MIT, (c) 2025 Nous Research @ `acc3cada0da86c81efc8aa6c5a291989549ca900`) | Guard + fixtures verbatim (provenance headers prepended); test import paths adapted; integrity hashes in `third_party/sources.lock.json` | Upstream suite executed in backend `npm test` (7 tests incl. chunk-width matrix and false-positive controls) |
| 1 | better-auth/better-auth @ `88f36c63cf70c4142cf6b03c28cbeca84c981775` → `docs/content/docs/integrations/fastify.mdx` (Fastify integration example, fetched 2026-10-23) | `backend/src/modules/auth/auth.routes.ts` | MIT | Adapted, not copied verbatim: URL base from operator-configured APP_URL env instead of request Host header; multi-value Set-Cookie forwarded via `getSetCookie()`; Fastify JSON parsing kept (no raw-stream hijack) so injection tests match production traffic; wrapped in an encapsulated plugin with an auth-presence guard | `tests/auth.integration.test.ts`: 6/6 — sign-up/sign-in/sign-out round-trip, HttpOnly session cookie, CSRF rejection of untrusted origins (403, no cookie), registration-closed policy, hashed password storage |

Upstream file hash (fastify.mdx at the pinned commit):
`curl -s https://raw.githubusercontent.com/better-auth/better-auth/88f36c63cf70c4142cf6b03c28cbeca84c981775/docs/content/docs/integrations/fastify.mdx | sha256sum`
(recorded at B08 alongside the full inventory).

Candidate locations inspected and approved *as candidates* by the prompt
of record (not yet incorporated):

- `vercel/ai@e623e8c` — `examples/ai-functions/src/stream-text/openai/basic.ts`,
  `openai/abort.ts`, `anthropic/basic.ts`: server provider adapter
  patterns. Install the SDK; adapt example shapes only.
- `better-auth@2712441` — `docs/content/docs/integrations/fastify.mdx`:
  Fastify route bridge/session lookup patterns.
- `timgit/pg-boss@d44008` — `examples/readme.mjs`, `test/cancelTest.ts`,
  `test/retryTest.ts`: worker startup, cancellation, retry shapes.
- `LibreChat-AI/LibreChat@b793ab8` — `packages/api/src/crypto/credentials.ts`
  (reference only — versioned credential envelope concept; do not copy its
  legacy fixed-IV path), `packages/api/src/app/permissions.ts`,
  `packages/api/src/mcp/authorization.ts` (inspect before any adaptation).

## Section 3 — Rules

1. Pin the upstream commit/tag; inspect actual license coverage including
   nested exceptions and headers before incorporating.
2. Preserve copyright/license headers and required notices; mark
   modifications where required (Apache-2.0 modified-file notices).
3. MIT notice obligations and Apache-2.0 conditions are satisfied via
   `third_party/licenses/` + `THIRD_PARTY_NOTICES.md`.
4. Keep original Uni code under its existing license; do not relabel
   incorporated Apache-2.0 code as MIT-only.
5. Prefer installing tested packages over copying internals; vendoring is
   the exception, justified per file.
6. Do not copy unlicensed projects, tutorial snippets without permission,
   proprietary code/assets, or GPL/AGPL sources for this implementation.
