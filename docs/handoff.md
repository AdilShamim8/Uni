# handoff.md — resumption checkpoint

Keep short and factual: current commit, completed gate, exact commands and
results, unresolved problems, environment blockers, next action.

## Current state (updated 2026-10-29, provider-freedom wave complete)

- **Branch:** `main` (commits pushed one at a time per working agreement).
- **Wave scope shipped:** suggested models per provider (21 host catalogs +
  kind fallbacks), 10 new presets with free-tier badges (21 presets total),
  honest OpenRouter key verification via `/key` (frontend BYOK + backend
  server-side, free-first discovery), `X-Title` attribution on OpenRouter
  chat, long-model-list collapse, CI (contracts/frontend/backend), Dependabot,
  PR template, CONTRIBUTING, CHANGELOG, and the beginner-facing root README
  with 9 fresh screenshots in `docs/screenshots/`.
- **Wave complete (300th commit milestone):** all suites green at close —
  frontend 339/339 + typecheck + lint clean, backend 105/105 + typecheck
  clean, contracts clean, live GitHub anchors + screenshot URLs verified.
  Full closing record in `docs/verification.md`.
- **Verification:** frontend 338/338 (typecheck + lint clean), backend
  105/105 (typecheck clean, embedded PG per file), contracts build clean,
  full browser golden-path pass with a real local OpenAI-compatible mock
  (connect → discover → live SSE reply, zero console errors). Details in
  `docs/verification.md` (Provider-freedom wave section).
- **Notable facts for the next session:** OpenRouter `/models` is public
  (key must be proven against `/key` — both sides now do this); live
  catalog 2026-10-29 held 457 models, 16 `:free`; shell-exported
  `DATABASE_URL` overrides `backend/.env` (dotenv precedence) — documented
  in both READMEs.
- **Next action candidates:** multimodal content + tool-calling on the wire
  (B05+), reasoning-model streaming fields, server-mode provider list in
  the frontend Account section polish, README localization.

## Prior state (2026-10-26, backend QA pass complete)

- **Branch:** `feat/qa-backend-verify` (off `main` after the B04 merge,
  PR #24; commits pushed one at a time per working agreement).
- **Completed gates:** B00, B01, B02, B03, B04, QA pass (103/103).
- **QA pass (2026-10-26):** memory-block route 404 consistency fix,
  SSE sentinel dead-code fix (prompt close on finalize), `.env.example`
  gained `BETTER_AUTH_SECRET`, new `backend/scripts/smoke-live.mjs`
  boots the compiled server in production mode over real HTTP (11/11).
  - B00: baseline, EmployeeView render-mutation fix, docs.
  - B01: Fastify app, env validation, health, Drizzle + migration 0000,
    docker-compose, `@uni/contracts`, frontend API client + dev proxy.
  - B02: Better Auth identity, workspaces, conversation CRUD + message
    tree, deliberate importer, frontend Account section.
  - B03: providers with encrypted credentials + SSRF guard; vendored
    OpenClaw repetition guard (provenance in
    `third_party/sources.lock.json`); runs module — idempotent create,
    server-side history, AI-SDK execution, persisted ordered events,
    SSE replay + live tail, durable cancel, honest terminals
    (complete/stopped/repetition_stopped/error), stuck-run
    reconciliation; frontend server chat surface in Account; B02
    messageCount bug fixed with regression test.
  - B04: employees, employee memory (vendored OpenMausBot kernel —
    redaction, hash-guarded writes, audit journal with revert, m07
    memory block, recall), the Library (artifacts + immutable versions,
    canonical save transaction), all wired into run execution.
- **Verification:** backend 101/101; frontend 321/321 (unchanged this
  gate); tsc/build clean (see `docs/verification.md` B03/B04 sections).
- **Stack:** Fastify + Drizzle + PostgreSQL + Better Auth + Zod +
  Vercel AI SDK (ai 7.0.153, openai-compatible 3.0.78, anthropic
  4.0.88) + pg-boss (from B06).

## Environment notes

- Development sandbox has no Docker daemon and no system PostgreSQL;
  DB-backed tests use `embedded-postgres` with disposable data dirs.
  The B03 browser E2E used a persistent embedded instance
  (`scripts/e2e-pg.mjs` pattern, kept outside the repo tree).
- Authenticated GitHub push is configured via the remote URL; the
  token is never committed.

## Next action

B05 per `docs/backend-roadmap.md`: server-side plugins with enforced
grants (port the frontend dispatcher's grant model to the server;
skills inspiration from OpenMausBot's skill-library). Then B06 (pg-boss
durable Work; define lease/crash semantics for in-flight runs), B07
(files, export/import completeness, optional routines — OpenMausBot's
webhook-ingress + routine designs are the reference), B08 (deployment +
security verification). A B04-followup polish item: frontend surfaces
for server employees/memory/library (the API is ready; the UI still
reads localStorage).

## Unresolved / watch list

- Single-process run execution by design for B03; B06 moves durable
  execution to pg-boss and must define lease/crash semantics for
  in-flight runs (the interrupted reconciliation is the stopgap).
- In-memory creation rate limit is per-process; revisit with B06.
- ChatPage unification (single surface for local + server
  conversations) is deliberate future polish; the Account surface is
  the complete B03 journey.
- Vite mixed static/dynamic import warning for `libraryStore.ts`
  (pre-existing; not a blocker).
