# handoff.md — resumption checkpoint

Keep short and factual: current commit, completed gate, exact commands and
results, unresolved problems, environment blockers, next action.

## Current state (updated 2026-10-26, B03 complete)

- **Branch:** `feat/backend-foundation` (commits pushed one at a time
  per working agreement; draft PR next).
- **Completed gates:** B00, B01, B02, B03.
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
- **Verification:** backend 57/57; frontend 292/292; tsc/eslint/build
  clean; full browser E2E on the dev stack (see
  `docs/verification.md` B03 section).
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

B04 per `docs/backend-roadmap.md`: server-side employees (agent
profiles, memory notes with Hermes-inspired scoped formatting), shared
context, and the Library (artifacts, versions, canonical save as a
server transaction). Port `buildAgentMemoryBlock` semantics and the
canonicalSave conflict rules; keep every read/write workspace- and
agent-scoped with server-derived identity. Then B05 (plugins with
enforced grants), B06 (pg-boss durable Work), B07 (files), B08
(deployment + draft PR if not yet opened).

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
