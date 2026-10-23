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
| B01 | Running backend, health endpoints, DB wiring, contracts package | **Server side complete** (23 Oct 2026) — backend, contracts, embedded-PG integration tests, docker-compose; frontend API base/proxy wiring lands in the next commit |
| B02 | Better Auth identity, workspaces, conversation persistence, importer | Not started |
| B03 | Server BYOK providers, encrypted credentials, streamed chat runs | Not started |
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
