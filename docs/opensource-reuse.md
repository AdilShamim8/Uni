# opensource-reuse.md — reuse ledger

Every package dependency and every adapted/vendored file is recorded here.
License texts live under `third_party/licenses/`; notices in
`THIRD_PARTY_NOTICES.md`. A permissive root license is a candidate signal,
not unconditional clearance: each incorporation still requires checking the
exact release, file headers, subdirectory licenses, NOTICE files, and
transitive dependencies.

## Section 1 — Installed packages (dependencies)

Recorded at introduction; re-generate the full inventory from the lockfile
at B08 (`npm ls --all` + license scan) and pin it.

| Package | License | Introduced | Purpose |
| --- | --- | --- | --- |
| fastify | MIT | B01 | HTTP server, plugin encapsulation, injection testing |
| zod | MIT | B01 | Input/output validation, contract schemas |
| drizzle-orm | Apache-2.0 | B01 | Typed PostgreSQL queries and migrations |
| better-auth | MIT | B02 | Authentication, session lifecycle |
| @ai-sdk/* (core + openai + anthropic) | Apache-2.0 | B03 | Provider adapters, streaming, cancellation |
| pg-boss | MIT | B06 (planned) | PostgreSQL-backed durable jobs |
| pg / postgres drivers | MIT | B01 | PostgreSQL client (per driver choice) |

Frontend dependencies (React, Vite, Zustand, react-markdown, Papa Parse,
Vitest, Testing Library, lucide-react, react-router-dom, tailwindcss)
pre-date the B-gates and are recorded in `frontend/package.json`.

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
