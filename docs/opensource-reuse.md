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
| better-auth | (planned) | MIT | B02 | Authentication, session lifecycle |
| @ai-sdk/* (core + openai + anthropic) | (planned) | Apache-2.0 | B03 | Provider adapters, streaming, cancellation |
| pg-boss | (planned) | MIT | B06 | PostgreSQL-backed durable jobs |

License texts for the B01 set are preserved under `third_party/licenses/`
and summarized in `THIRD_PARTY_NOTICES.md`. Frontend dependencies
(React, Vite, Zustand, react-markdown, Papa Parse, Vitest, Testing
Library, lucide-react, react-router-dom, tailwindcss) pre-date the
B-gates and are recorded in `frontend/package.json`.

## Section 2 — Adapted files (vendored or substantially copied source)

Format: upstream repo @ commit → upstream path → local path → license →
modifications → validation. **None yet.** When the first file is adapted
(e.g. an example worker from pg-boss or an adapter pattern from
vercel/ai examples), record: upstream repository, commit, path, file hash,
local path, reason, license, modifications, and validation performed.

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
