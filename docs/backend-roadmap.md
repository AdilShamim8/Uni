# backend-roadmap.md — B-gate implementation status

Source of truth for what the backend actually does. Update after every
gate; never mark a gate complete on intent. Prompt of record:
`Uni_Prompt_08_Backend_End_to_End.md` (23 October 2026).

## Stack (chosen at B00)

TypeScript modular monolith: **Fastify** (MIT) for HTTP, **Drizzle ORM**
(Apache-2.0) + PostgreSQL for persistence and migrations, **Better Auth**
(MIT) for identity/sessions, **Zod** (MIT) for validation, **Vercel AI
SDK** (Apache-2.0) for provider transport, **pg-boss** (MIT) for durable
jobs (from B06). Node LTS pinned per actual engine requirements
(development verified on Node 24 / npm 11). No Redis, no vector DB, no
Kubernetes, no second backend.

## Gate status

| Gate | Scope | Status |
| --- | --- | --- |
| B00 | Baseline evidence, EmployeeView render-mutation fix, docs, stack decision | **Complete** (23 Oct 2026) |
| B01 | Running backend, health endpoints, DB wiring, contracts package | **Complete** (23 Oct 2026) — backend + contracts + embedded-PG integration tests + docker-compose + frontend API client/dev-proxy wiring |
| B02 | Better Auth identity, workspaces, conversation persistence, importer | **Complete** (23 Oct 2026) — backend (auth 6, conversations 7, importer 6 integration tests) + frontend Account section (sign-in/out, deliberate import, read-only server conversations; 7 tests) |
| B03 | Server BYOK providers, encrypted credentials, streamed chat runs | **Complete** (26 Oct 2026) — providers (encrypted credentials, SSRF guard, tests) + vendored OpenClaw repetition guard + runs module (create/stream/cancel/replay, durable events, honest terminals) + frontend Account chat surface; E2E verified in-browser |
| B04 | Library, employee memory, shared context on the server | Not started |
| B05 | Server-side plugins with enforced grants | Not started |
| B06 | Durable Work (pg-boss worker) | Not started |
| B07 | File ingestion, export/import completeness, optional routines | Not started |
| B08 | Deployment, security verification, handoff, draft PR | Not started |

## B00 record (2026-10-23)

- Repository reviewed at `3ad6b95c30972c728f8895da8137bf0cd6d85202`
  (matches the prompt's audited HEAD; no newer commits existed).
- Baseline commands and results: see `docs/verification.md`.
- Fixed the render-time store mutation in
  `frontend/src/features/agents/EmployeeView.tsx`: `openAgentConversation`
  moved from `useMemo` into a `useEffect` with a loading state; added
  regression coverage (`tests/employeeThreadLifecycle.test.tsx`) for
  no-render-mutation, Strict Mode single-thread, and navigation reuse.
- Root README's stale "Work is local simulation / chat-only network"
  claim corrected: source supports live BYOK Work drafting and revisions.
- No backend existed at HEAD; nothing was overwritten.

## First-day target (from the prompt)

B00–B03: sign in → configure a provider securely → send a streamed chat →
reload and recover the same conversation. Later gates continue from the
preserved working slice; see `docs/handoff.md` for the exact checkpoint.


## B03 record (2026-10-26)

- Vendored the OpenClaw repetition guard (MIT, commit `29397d2a`) with
  its upstream suite and the Hermes attribution chain preserved
  (`third_party/sources.lock.json`); wired into the run lifecycle as an
  honest `repetition_stopped` terminal.
- `modules/runs`: idempotent create (client key + unique index),
  per-workspace concurrency (default 2) and creation rate limits,
  server-side history resolution from the owned tree (char budget from
  the newest end), execution via Vercel AI SDK (openai-compatible +
  anthropic), persisted ordered events (started/delta/usage/terminal),
  SSE subscription (bus-first, DB-poll backstop), durable cancel with
  partial output, stuck-run reconciliation (interrupted, never
  complete), truthful assistant-node finalization (status/error/
  statusPrefix mapped; active leaf only advances when the user has not
  branched). No automatic provider retries (`maxRetries: 0`) — a failed
  request may have reached the provider.
- Frontend: Account section gains the server chat surface — provider
  panel (key sent once, redacted afterwards), conversation creation,
  send → run → streamed reply, Stop, honest no-provider hint; reload
  re-fetches the same tree.
- Fixed a B02 bug found in E2E: conversation `messageCount` was always
  0 (drizzle renders sql-template column refs unqualified; the
  correlated subquery compared node.id to node.conversation_id).
  Regression test added.
- Verification: backend 57/57 (runs suite: 9 integration tests against
  a mode-switchable fake provider); frontend 292/292; tsc/eslint/build
  clean both sides; full browser E2E on the dev stack (embedded
  PostgreSQL + Fastify + Vite proxy): sign-up → add provider → send →
  stream → reload same tree, honest error branch for a
  protocol-violating provider, zero console/page errors. Screenshots in
  the session record.
