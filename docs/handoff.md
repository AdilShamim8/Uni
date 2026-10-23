# handoff.md — resumption checkpoint

Keep short and factual: current commit, completed gate, exact commands and
results, unresolved problems, environment blockers, next action.

## Current state (updated 2026-10-23, B01 complete)

- **Branch:** `feat/backend-foundation` (pushed; commits land one at a
  time per working agreement).
- **Completed gates:** B00 and B01.
  - B00: baseline verified, EmployeeView render-mutation fixed with
    regression tests, documentation set created, README Work-mode claim
    corrected.
  - B01: `backend/` (Fastify factory, zod env, redacted logging, error
    envelope, `/health/live` + `/health/ready`, Drizzle + committed
    migration 0000, docker-compose dev DB, 11/11 tests incl. real
    embedded-PG integration), `packages/contracts` (`@uni/contracts`),
    frontend API client + dev proxy + `.env.example`
    (5 client tests; build + lint clean).
- **Verification snapshot:** `docs/verification.md` per gate. Frontend
  suite 278/278 + 5 = 283 green in isolated single-worker runs.
- **Stack decision:** Fastify + Drizzle + PostgreSQL + Better Auth + Zod +
  Vercel AI SDK (+ pg-boss at B06). Recorded in `docs/backend-roadmap.md`.

## Environment notes

- Development sandbox has no Docker daemon and no system PostgreSQL and
  no root; DB-backed tests run against real PostgreSQL via the
  `embedded-postgres` package (disposable data dirs under gitignored
  `.tmp/`). `infra/docker-compose.yml` is the documented path for normal
  development machines.
- Authenticated GitHub push is configured via a local credential helper;
  the token is never committed.

## Next action

B02 per `docs/backend-roadmap.md`: Better Auth integration (Fastify
adapter, personal workspaces, HttpOnly sessions, registration policy),
`GET /api/v1/me`, session-scoped conversation CRUD with message-tree
persistence, and the deliberate backup importer (dry-run preview +
confirm; idempotent; local originals preserved). Then B03 (providers,
encrypted credentials, streamed runs).

## Unresolved / watch list

- Vite mixed static/dynamic import warning for `libraryStore.ts`
  (pre-existing bundling observation; not a blocker).
- Parallel-load test timeouts observed historically (4/274 under load);
  isolated runs pass; treat timing flakiness as environment-driven until
  an assertion failure is reproduced.
- Deployed Vercel site not browser-retested this session.
- Frontend mirrors the contract error envelope locally (keeps Vercel
  build root working); revisit direct `@uni/contracts` imports at the
  single-origin deployment (B08).
