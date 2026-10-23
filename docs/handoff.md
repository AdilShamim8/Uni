# handoff.md — resumption checkpoint

Keep short and factual: current commit, completed gate, exact commands and
results, unresolved problems, environment blockers, next action.

## Current state (updated 2026-10-23, B00 complete)

- **Branch:** `feat/backend-foundation` (pushed; commits land one at a
  time per working agreement).
- **Completed gate:** B00 — baseline verified, EmployeeView render-time
  store mutation fixed with regression tests, documentation set created
  (root/frontend `AGENTS.md`, `docs/PROJECT_CONTEXT.md`, `backend-roadmap`,
  `opensource-reuse`, `verification`, `frontend-backend-map`), root README
  Work-mode claim corrected.
- **Verification snapshot:** `npm ci` ok; `npm run build` ok;
  `npm run lint` clean; `npm run test -- --maxWorkers=1 --minWorkers=1`
  → 278/278 across 41 files. Details in `docs/verification.md`.
- **Stack decision:** Fastify + Drizzle + PostgreSQL + Better Auth + Zod +
  Vercel AI SDK (+ pg-boss at B06). Recorded in `docs/backend-roadmap.md`.

## Environment notes

- Development sandbox has no Docker daemon and no system PostgreSQL and
  no root; DB-backed tests must run against PostgreSQL provisioned another
  way (embedded binaries or a reachable service). `infra/docker-compose.yml`
  remains the documented path for normal development machines.
- Authenticated GitHub push is configured via a local credential helper;
  the token is never committed.

## Next action

B01 per `docs/backend-roadmap.md`: scaffold `backend/` (Fastify app
factory, env schema, logging, error envelope, `/health/live` +
`/health/ready`), add PostgreSQL compose + Drizzle migrations, add
`packages/contracts`, add one meaningful DB-backed test. Then commit and
push as its own increment before starting B02.

## Unresolved / watch list

- Vite mixed static/dynamic import warning for `libraryStore.ts`
  (pre-existing bundling observation; not a blocker).
- Parallel-load test timeouts observed historically (4/274 under load);
  isolated runs pass; treat timing flakiness as environment-driven until
  an assertion failure is reproduced.
- Deployed Vercel site not browser-retested this session.
